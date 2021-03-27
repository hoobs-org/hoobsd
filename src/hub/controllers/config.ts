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
import Config from "../../services/config";
import Security from "../../services/security";
import { Console, Events, NotificationType } from "../../services/logger";
import { BridgeRecord } from "../../services/bridges";

export default class ConfigController {
    constructor() {
        State.app?.get("/api/config", (request, response) => this.getConsole(request, response));
        State.app?.post("/api/config", Security, (request, response) => this.saveConsole(request, response));
        State.app?.get("/api/config/:bridge", Security, (request, response) => this.getBridge(request, response));
        State.app?.post("/api/config/:bridge", Security, (request, response) => this.saveBridge(request, response));
    }

    getConsole(request: Request, response: Response): void {
        Security(request, response, () => {
            response.send(State.hub?.config);
        }, () => {
            const { ...config } = State.hub?.config;

            delete config.weather;
            delete config.dashboard;

            response.send(config);
        });
    }

    saveConsole(request: Request, response: Response): void {
        Config.saveConfig(request.body);

        Console.emit(Events.CONFIG_CHANGE, "hub", Config.configuration());

        response.send({
            success: true,
        });
    }

    async getBridge(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions?.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const config = Config.configuration(request.params.bridge);

        if (request.params.bridge !== "hub") {
            for (let i = 0; i < (config?.accessories || []).length; i += 1) {
                delete config.accessories[i].plugin_map;
            }

            for (let i = 0; i < (config?.platforms || []).length; i += 1) {
                delete config.platforms[i].plugin_map;
            }
        }

        return response.send(config);
    }

    async saveBridge(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions?.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const bridge: BridgeRecord | undefined = State.bridges.find((item) => item.id === request.params.bridge);

        Console.notify(
            request.params.bridge,
            "Configuration Changed",
            `The configuration for "${bridge?.display || "Undefined"}" has changed.`,
            NotificationType.WARN,
            "cog",
        );

        Config.saveConfig(request.body, request.params.bridge);

        return response.send({
            success: true,
        });
    }
}
