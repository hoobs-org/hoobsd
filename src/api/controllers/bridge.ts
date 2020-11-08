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
import Socket from "../services/socket";

export default class BridgeController {
    constructor() {
        Instance.app?.get("/api/bridge", (request, response) => this.all(request, response));
        Instance.app?.get("/api/bridge/:instance", (request, response) => this.status(request, response));
        Instance.app?.post("/api/bridge/:instance/start", (request, response) => this.start(request, response));
        Instance.app?.post("/api/bridge/:instance/stop", (request, response) => this.stop(request, response));
        Instance.app?.post("/api/bridge/:instance/restart", (request, response) => this.restart(request, response));
        Instance.app?.post("/api/bridge/:instance/purge", (request, response) => this.purge(request, response));
    }

    async all(_request: Request, response: Response): Promise<Response> {
        const results = [];

        for (let i = 0; i < Instance.instances.length; i += 1) {
            if (Instance.instances[i].type === "bridge") {
                const status = await Socket.fetch(Instance.instances[i].id, "status:get");

                if (status) {
                    results.push({
                        instance: Instance.instances[i].id,
                        status,
                    });
                }
            }
        }

        return response.send(results);
    }

    async status(request: Request, response: Response): Promise<Response> {
        return response.send(await Socket.fetch(request.params.instance, "status:get"));
    }

    async start(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.instance, "bridge:start"));
    }

    async stop(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.instance, "bridge:stop"));
    }

    async restart(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.instance, "bridge:restart"));
    }

    async purge(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(await Socket.fetch(request.params.instance, "bridge:purge"));
    }
}
