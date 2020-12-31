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
import { InstanceRecord } from "../../services/instances";

export default class ConfigController {
    constructor() {
        State.app?.get("/api/config", (request, response) => this.getConsole(request, response));
        State.app?.post("/api/config", (request, response) => this.saveConsole(request, response));
        State.app?.get("/api/config/:instance", (request, response) => this.getInstance(request, response));
        State.app?.post("/api/config/:instance", (request, response) => this.saveInstance(request, response));
    }

    async getConsole(_request: Request, response: Response): Promise<Response> {
        return response.send(State.api?.config);
    }

    async saveConsole(request: Request, response: Response): Promise<Response> {
        Console.emit(Events.CONFIG_CHANGE, "api", Config.configuration());

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

    async getInstance(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.instance, "config:get"));
    }

    async saveInstance(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const instance: InstanceRecord | undefined = State.instances.find((item) => item.id === request.params.instance);

        Console.notify(
            request.params.instance,
            "Configuration Changed",
            `The configuration for "${instance?.display || "Undefined"}" has changed.`,
            NotificationType.WARN,
            "settings",
        );

        return response.send(await Socket.fetch(request.params.instance, "config:save", request.params, request.body));
    }
}
