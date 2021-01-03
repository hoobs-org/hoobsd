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
import Socket from "../services/socket";
import { Console, Events, NotificationType } from "../../services/logger";
import { BridgeRecord } from "../../services/bridges";

export default class ConfigController {
    constructor() {
        State.app?.get("/api/config", (request, response) => this.getConsole(request, response));
        State.app?.post("/api/config", (request, response) => this.saveConsole(request, response));
        State.app?.get("/api/config/:bridge", (request, response) => this.getBridge(request, response));
        State.app?.post("/api/config/:bridge", (request, response) => this.saveBridge(request, response));
    }

    async getConsole(_request: Request, response: Response): Promise<Response> {
        return response.send(State.hub?.config);
    }

    async saveConsole(request: Request, response: Response): Promise<Response> {
        Console.emit(Events.CONFIG_CHANGE, "hub", Config.configuration());

        Console.notify(
            State.id,
            "Configuration Changed",
            "The configuration for the API has changed.",
            NotificationType.WARN,
            "settings",
        );

        Config.saveConfig(request.body);

        return response.send({
            success: true,
        });
    }

    async getBridge(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.bridge, "config:get"));
    }

    async saveBridge(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
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
            "settings",
        );

        return response.send(await Socket.fetch(request.params.bridge, "config:save", request.params, request.body));
    }
}
