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

export default class PluginsController {
    constructor() {
        State.app?.get("/api/plugins", (request, response) => this.all(request, response));
        State.app?.get("/api/plugins/:bridge", (request, response) => this.installed(request, response));
        State.app?.put("/api/plugins/:bridge/:name", (request, response) => this.install(request, response));
        State.app?.put("/api/plugins/:bridge/:scope/:name", (request, response) => this.install(request, response));
        State.app?.post("/api/plugins/:bridge/:name", (request, response) => this.upgrade(request, response));
        State.app?.post("/api/plugins/:bridge/:scope/:name", (request, response) => this.upgrade(request, response));
        State.app?.delete("/api/plugins/:bridge/:name", (request, response) => this.uninstall(request, response));
        State.app?.delete("/api/plugins/:bridge/:scope/:name", (request, response) => this.uninstall(request, response));
    }

    async all(_request: Request, response: Response): Promise<Response> {
        const results = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type === "bridge") {
                const plugins = await Socket.fetch(State.bridges[i].id, "plugins:get");

                if (plugins) {
                    for (let j = 0; j < plugins.length; j += 1) {
                        const { ...plugin } = plugins[j];

                        plugin.bridge = State.bridges[i].id;

                        results.push(plugin);
                    }
                }
            }
        }

        return response.send(results);
    }

    async installed(request: Request, response: Response): Promise<Response> {
        return response.send(await Socket.fetch(request.params.bridge, "plugins:get"));
    }

    async install(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.plugins) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.bridge, "plugins:install", request.params));
    }

    async upgrade(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.plugins) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.bridge, "plugins:upgrade", request.params));
    }

    async uninstall(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.plugins) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.bridge, "plugins:uninstall", request.params));
    }
}
