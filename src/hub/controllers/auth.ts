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
import Axios from "axios";
import State from "../../state";
import Config from "../../services/config";
import { Console } from "../../services/logger";
import Users, { UserRecord } from "../../services/users";

export default class AuthController {
    constructor() {
        State.app?.get("/api/auth", (request, response) => this.state(request, response));
        State.app?.post("/api/auth/disable", (request, response) => this.disable(request, response));
        State.app?.post("/api/auth/logon", (request, response) => this.logon(request, response));
        State.app?.get("/api/auth/logout", (request, response) => this.logout(request, response));
        State.app?.get("/api/auth/validate", (request, response) => this.validate(request, response));
        State.app?.post("/api/auth/vendor/:vendor", (request, response) => this.vendor(request, response));
    }

    state(_request: Request, response: Response): Response {
        if (State.hub?.settings.disable_auth) {
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
        if (State.hub?.settings.disable_auth) {
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

    logout(request: Request, response: Response): Response {
        if (State.hub?.settings.disable_auth) {
            return response.send({
                success: true,
            });
        }

        if (!request.headers.authorization || request.headers.authorization === "") {
            return response.send({
                success: true,
            });
        }

        State.cache?.remove(request.headers.authorization);

        return response.send({
            success: true,
        });
    }

    async vendor(request: Request, response: Response): Promise<void> {
        let results;

        const { username, password, verification } = request.body;

        console.log(request.body);

        switch (request.params.vendor) {
            case "ring":
                try {
                    results = await Axios.post("https://oauth.ring.com/oauth/token", {
                        client_id: "ring_official_android",
                        scope: "client",
                        grant_type: "password",
                        password,
                        username,
                    },
                    { headers: { "content-type": "application/json", "2fa-support": "true", "2fa-code": verification || "" } });

                    response.send(results.data);
                } catch (error) {
                    if (error.response && error.response.status === 412) {
                        response.send({ status: 412 });
                    } else if (error.response && error.response.data) {
                        response.send(error.response.data);
                    } else {
                        Console.error("ring login failed");
                        Console.error(error.message);

                        response.send({ error });
                    }
                }

                break;

            default:
                response.send({ error: "invalid vendor" });
                break;
        }
    }
}
