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
import State from "../../state";
import Users from "../../services/users";
import Security from "../../services/security";

export default class UsersController {
    constructor() {
        State.app?.get("/api/users", (request, response) => this.list(request, response));
        State.app?.put("/api/users", (request, response) => this.create(request, response));
        State.app?.get("/api/users/:id", Security, (request, response) => this.get(request, response));
        State.app?.post("/api/users/:id", Security, (request, response) => this.update(request, response));
        State.app?.delete("/api/users/:id", Security, (request, response) => this.delete(request, response));
    }

    async list(_request: Request, response: Response): Promise<void> {
        response.send(Users.list().map((item) => ({
            id: item.id,
            username: item.username,
            name: item.name,
            permissions: item.permissions,
        })));
    }

    get(request: Request, response: Response): void {
        if (!request.user?.permissions?.users) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

            return;
        }

        const user = Users.list().filter((u) => u.id === parseInt(request.params.id, 10))[0];

        if (!user) {
            response.send({
                error: "user not found",
            });

            return;
        }

        response.send({
            id: user.id,
            username: user.username,
            name: user.name,
            permissions: user.permissions,
        });
    }

    async create(request: Request, response: Response): Promise<void> {
        if (Users.count() > 0 && (!(await Users.validateToken(request.headers.authorization)) || !request.user?.permissions?.users)) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

            return;
        }

        if (!request.body.username || request.body.username === "" || request.body.username.length < 3) {
            response.send({
                token: false,
                error: "Invalid username.",
            });

            return;
        }

        if (request.body.password && request.body.password.length < 5) {
            response.send({
                token: false,
                error: "Password too weak.",
            });

            return;
        }

        if (Users.count() === 0) {
            request.body.permissions = {
                accessories: true,
                controller: true,
                bridges: true,
                terminal: true,
                plugins: true,
                users: true,
                reboot: true,
                config: true,
            };
        }

        await Users.create(request.body.name, request.body.username, request.body.password, request.body.permissions || {
            accessories: false,
            controller: false,
            bridges: false,
            terminal: false,
            plugins: false,
            users: false,
            reboot: false,
            config: false,
        });

        this.list(request, response);
    }

    async update(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions?.users && request.user?.id !== parseInt(request.params.id, 10)) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

            return;
        }

        if (!request.body.username || request.body.username === "" || request.body.username.length < 3) {
            response.send({
                token: false,
                error: "Invalid username.",
            });

            return;
        }

        if (request.body.password && request.body.password.length < 5) {
            response.send({
                token: false,
                error: "Password too weak.",
            });

            return;
        }

        if (Users.count() === 0) {
            response.send({
                token: false,
                error: "No users exist.",
            });

            return;
        }

        const user = await Users.update(parseInt(request.params.id, 10), request.body.name, request.body.username, request.body.password, request.body.permissions);

        if (!user) {
            response.send({
                error: "unable to update user",
            });

            return;
        }

        this.list(request, response);
    }

    delete(request: Request, response: Response): void {
        if (!request.user?.permissions?.users) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

            return;
        }

        Users.delete(parseInt(request.params.id, 10));

        this.list(request, response);
    }
}
