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
import Users from "../../services/users";

export default class UsersController {
    constructor() {
        Instance.app?.get("/api/users", (request, response) => this.list(request, response));
        Instance.app?.put("/api/users", (request, response) => this.create(request, response));
        Instance.app?.get("/api/users/:id", (request, response) => this.get(request, response));
        Instance.app?.post("/api/users/:id", (request, response) => this.update(request, response));
        Instance.app?.delete("/api/users/:id", (request, response) => this.delete(request, response));
    }

    list(_request: Request, response: Response): Response {
        return response.send(Users.list().map((item) => ({
            id: item.id,
            username: item.username,
            name: item.name,
            admin: item.admin,
        })));
    }

    get(request: Request, response: Response): Response {
        const user = Users.list().filter((u) => u.id === parseInt(request.params.id, 10))[0];

        if (!user) {
            return response.send({
                error: "user not found",
            });
        }

        return response.send({
            id: user.id,
            username: user.username,
            name: user.name,
            admin: user.admin,
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

        if (Users.count() === 0) request.body.admin = true;

        await Users.create(request.body.name, request.body.username, request.body.password, request.body.admin);

        return this.list(request, response);
    }

    async update(request: Request, response: Response): Promise<Response> {
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

        if (Users.count() === 0) request.body.admin = true;

        const user = await Users.update(parseInt(request.params.id, 10), request.body.name, request.body.username, request.body.password, request.body.admin);

        if (!user) {
            return response.send({
                error: "unable to update user",
            });
        }

        return this.list(request, response);
    }

    delete(request: Request, response: Response): Response {
        Users.delete(parseInt(request.params.id, 10));

        return this.list(request, response);
    }
}
