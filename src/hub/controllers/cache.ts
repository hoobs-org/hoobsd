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
import Bridges from "../../services/bridges";
import Security from "../../services/security";

export default class CacheController {
    constructor() {
        State.app?.get("/api/cache", Security, (request, response) => this.all(request, response));
        State.app?.get("/api/cache/:bridge", Security, (request, response) => this.list(request, response));
        State.app?.get("/api/cache/:bridge/parings", Security, (request, response) => this.listParings(request, response));
        State.app?.get("/api/cache/:bridge/accessories", Security, (request, response) => this.listAccessories(request, response));
        State.app?.delete("/api/cache/purge", Security, (request, response) => this.clear(request, response));
        State.app?.delete("/api/cache/:bridge/purge", Security, (request, response) => this.purge(request, response));
        State.app?.delete("/api/cache/:bridge/purge/:uuid", Security, (request, response) => this.purge(request, response));
    }

    all(request: Request, response: Response): Response {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const results = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type !== "hub") {
                const parings = Bridges.parings(State.bridges[i].id);
                const accessories = Bridges.accessories(State.bridges[i].id);

                if (parings || accessories) {
                    results.push({
                        bridge: State.bridges[i].id,
                        parings,
                        accessories,
                    });
                }
            }
        }

        return response.send(results);
    }

    list(request: Request, response: Response): Response {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const parings = Bridges.parings(request.params.bridge);
        const accessories = Bridges.accessories(request.params.bridge);

        return response.send({
            parings,
            accessories,
        });
    }

    listParings(request: Request, response: Response): Response {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(Bridges.parings(request.params.bridge));
    }

    listAccessories(request: Request, response: Response): Response {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        return response.send(Bridges.accessories(request.params.bridge));
    }

    clear(request: Request, response: Response): void {
        if (!request.user?.permissions.config) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

            return;
        }

        State.cache?.clear();

        response.send({
            success: true,
        });
    }

    async purge(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.config) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        const bridge = State.bridges.find((item) => item.id === request.params.bridge);

        if (bridge) {
            await State.hub?.teardown(bridge.id);

            Bridges.purge(bridge.id, request.params?.uuid);
            State.hub?.launch(bridge.id, bridge.port, bridge.display);

            return response.send({
                success: true,
            });
        }

        return response.send({
            error: "bridge not found",
        });
    }
}
