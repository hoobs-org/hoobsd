/**************************************************************************************************
 * hoobsd                                                                                         *
 * Copyright (C) 2020 HOOBS                                                                       *
 *                                                                                                *
 * This program is free software: you can redistribute it and/or modify                           *
 * it under the terms of the GNU General Public License as published by                           *
 * the Free Software Foundation, either version 3 of the License, or                              *
 * (at your option) any later version.                                                            *
 *                                                                                                *
 * This program is distributed in the hope that it will be useful,                                *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of                                 *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the                                  *
 * GNU General Public License for more details.                                                   *
 *                                                                                                *
 * You should have received a copy of the GNU General Public License                              *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.                          *
 **************************************************************************************************/

import { Request, Response } from "express-serve-static-core";
import Instance from "../../services/instance";
import Config from "../../services/config";
import Users, { UserRecord } from "../../services/users";

export default class AuthController {
    constructor() {
        Instance.app?.get("/api/auth", (request, response) => this.state(request, response));
        Instance.app?.post("/api/auth/disable", (request, response) => this.disable(request, response));
        Instance.app?.post("/api/auth/logon", (request, response) => this.logon(request, response));
        Instance.app?.get("/api/auth/validate", (request, response) => this.validate(request, response));
    }

    state(_request: Request, response: Response): Response {
        if (Instance.api?.settings.disable_auth) {
            return response.send({
                state: "disabled",
            });
        }

        if (Users.count() === 0) {
            return response.send({
                state: "uninitialized",
            });
        }

        return response.send({
            state: "enabled",
        });
    }

    async validate(request: Request, response: Response): Promise<Response> {
        if (Instance.api?.settings.disable_auth) {
            return response.send({
                valid: true,
            });
        }

        return response.send({
            valid: await Users.validateToken(request.headers.authorization),
        });
    }

    disable(request: Request, response: Response): Response {
        if (Users.count() === 0) {
            const config: any = Config.configuration();

            if (!config.api) config.api = {};

            config.api.disable_auth = true;
            Config.saveConfig(config);
        }

        return this.state(request, response);
    }

    async logon(request: Request, response: Response): Promise<Response> {
        const user: UserRecord | undefined = Users.get(request.body.username);

        if (!user) {
            return response.send({
                token: false,
                error: "Invalid username or password.",
            });
        }

        const challenge: string = await Users.hashValue(request.body.password, user.salt);

        if (challenge !== user.password) {
            return response.send({
                token: false,
                error: "Invalid username or password.",
            });
        }

        const remember: boolean = request.body.remember || false;

        return response.send({
            token: await Users.generateToken(user.id, remember),
        });
    }
}
