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
import Instance from "../shared/instance";
import Users, { UserRecord } from "../shared/users";

export default class AuthController {
    constructor() {
        Instance.app?.get("/api/auth", (request, response) => this.state(request, response));
        Instance.app?.post("/api/auth/logon", (request, response) => this.logon(request, response));
        Instance.app?.put("/api/auth/create", (request, response) => this.create(request, response));
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

    async create(request: Request, response: Response): Promise<Response> {
        if (Users.count() > 0 && !(await Users.validateToken(request.headers.authorization))) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        if (!request.body.username || request.body.username === "" || request.body.username.length < 3) {
            return response.send({
                token: false,
                error: "Invalid username.",
            });
        }

        if (request.body.password.length < 5) {
            return response.send({
                token: false,
                error: "Password too weak.",
            });
        }

        if (Users.count() === 0) {
            request.body.admin = true;
        }

        const user = await Users.create(request.body.name, request.body.username, request.body.password, request.body.admin);

        return response.send({
            token: await Users.generateToken(user.id),
        });
    }
}
