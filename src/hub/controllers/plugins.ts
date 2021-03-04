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
import Config from "../../services/config";
import Security from "../../services/security";

export default class PluginsController {
    constructor() {
        State.app?.get("/api/plugins", Security, (request, response) => this.all(request, response));
        State.app?.get("/api/plugins/:bridge", Security, (request, response) => this.installed(request, response));
        State.app?.put("/api/plugins/:bridge/:name", Security, (request, response) => this.install(request, response));
        State.app?.put("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.install(request, response));
        State.app?.post("/api/plugins/:bridge/:name", Security, (request, response) => this.upgrade(request, response));
        State.app?.post("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.upgrade(request, response));
        State.app?.delete("/api/plugins/:bridge/:name", Security, (request, response) => this.uninstall(request, response));
        State.app?.delete("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.uninstall(request, response));
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

        const results = await Socket.fetch(request.params.bridge, "plugins:uninstall", request.params);

        if (results.success && Array.isArray(results.accessories && State.hub?.config.dashboard && State.hub?.config.dashboard.items)) {
            const { ...config } = State.hub?.config;

            for (let i = 0; i < results.accessories.length; i += 1) {
                let index = config.dashboard.items.findIndex((item: { [key: string]: any }) => item.component === "accessory-widget" && item.id === results.accessories[i]);

                while (index >= 0) {
                    config.dashboard.items.splice(index, 1);

                    index = config.dashboard.items.findIndex((item: { [key: string]: any }) => item.component === "accessory-widget" && item.id === results.accessories[i]);
                }
            }

            Config.saveConfig(config);
        }

        return response.send(results);
    }
}
