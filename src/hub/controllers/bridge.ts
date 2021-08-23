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
import Security from "../../services/security";

export default class BridgeController {
    constructor() {
        State.app?.get("/api/bridge", Security, (request, response) => this.all(request, response));
        State.app?.get("/api/bridge/:bridge", Security, (request, response) => this.status(request, response));
        State.app?.post("/api/bridge/:bridge/start", Security, (request, response) => this.start(request, response));
        State.app?.post("/api/bridge/:bridge/stop", Security, (request, response) => this.stop(request, response));
        State.app?.post("/api/bridge/:bridge/restart", Security, (request, response) => this.restart(request, response));
    }

    async all(_request: Request, response: Response): Promise<Response> {
        const results: { [key: string]: any } = [];
        const waits: Promise<void>[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type !== "hub") {
                waits.push(new Promise((resolve) => {
                    State.ipc?.fetch(State.bridges[i].id, "status:get").then((status) => {
                        if (status) {
                            results.push({
                                bridge: State.bridges[i].id,
                                status,
                            });
                        }
                    }).finally(() => {
                        resolve();
                    });
                }));
            }
        }

        await Promise.allSettled(waits);

        return response.send(results);
    }

    async status(request: Request, response: Response): Promise<Response> {
        const status = await State.ipc?.fetch(request.params.bridge, "status:get");

        return response.send(status);
    }

    async start(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions?.config) return response.send({ token: false, error: "Unauthorized." });

        const bridge = State.bridges.find((item) => item.id === request.params.bridge);

        if (bridge) State.hub?.launch(bridge);

        return response.send({ success: true });
    }

    async stop(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions?.config) return response.send({ token: false, error: "Unauthorized." });

        const bridge = State.bridges.find((item) => item.id === request.params.bridge);

        if (bridge) await State.hub?.teardown(bridge);

        return response.send({ success: true });
    }

    async restart(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions?.config) return response.send({ token: false, error: "Unauthorized." });

        await State.hub?.teardown(request.params.bridge);

        const bridge = State.bridges.find((item) => item.id === request.params.bridge);

        if (bridge) State.hub?.launch(bridge);

        return response.send({ success: true });
    }
}
