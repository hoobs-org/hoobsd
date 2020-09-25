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
import Socket from "./socket";

export default class BridgeController {
    declare private instances: any[];

    constructor(instances: any[]) {
        this.instances = instances;

        Instance.app?.get("/api/bridge", (request, response) => this.all(request, response));
        Instance.app?.get("/api/bridge/:instance", (request, response) => this.status(request, response));
        Instance.app?.post("/api/bridge/:instance/start", (request, response) => this.start(request, response));
        Instance.app?.post("/api/bridge/:instance/stop", (request, response) => this.stop(request, response));
        Instance.app?.post("/api/bridge/:instance/restart", (request, response) => this.restart(request, response));
        Instance.app?.post("/api/bridge/:instance/clean", (request, response) => this.clean(request, response));
    }

    async all(_request: Request, response: Response): Promise<void> {
        const results = [];

        for (let i = 0; i < this.instances.length; i += 1) {
            const status = await Socket.fetch(this.instances[i].id, "status:get");

            if (status) {
                results.push({
                    instance: this.instances[i].id,
                    status,
                });
            }
        }

        response.send(results);
    }

    async status(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.instance, "status:get"));
    }

    async start(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.instance, "bridge:start"));
    }

    async stop(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.instance, "bridge:stop"));
    }

    async restart(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.instance, "bridge:restart"));
    }

    async clean(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.instance, "bridge:clean"));
    }
}
