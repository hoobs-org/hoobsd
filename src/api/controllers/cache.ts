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
import Socket from "../services/socket";

export default class CacheController {
    constructor() {
        State.app?.get("/api/cache", (request, response) => this.all(request, response));
        State.app?.get("/api/cache/:instance", (request, response) => this.list(request, response));
        State.app?.get("/api/cache/:instance/parings", (request, response) => this.listParings(request, response));
        State.app?.get("/api/cache/:instance/accessories", (request, response) => this.listAccessories(request, response));
    }

    async all(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const results = [];

        for (let i = 0; i < State.instances.length; i += 1) {
            if (State.instances[i].type === "bridge") {
                const parings = await Socket.fetch(State.instances[i].id, "cache:parings");
                const accessories = await Socket.fetch(State.instances[i].id, "cache:accessories");

                if (parings || accessories) {
                    results.push({
                        instance: State.instances[i].id,
                        parings,
                        accessories,
                    });
                }
            }
        }

        return response.send(results);
    }

    async list(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const parings = await Socket.fetch(request.params.instance, "cache:parings");
        const accessories = await Socket.fetch(request.params.instance, "cache:accessories");

        return response.send({
            parings,
            accessories,
        });
    }

    async listParings(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.instance, "cache:parings"));
    }

    async listAccessories(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.instance, "cache:accessories"));
    }
}
