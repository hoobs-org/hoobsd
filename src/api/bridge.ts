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
import { command } from "./socket";

export default class BridgeController {
    constructor() {
        Instance.app?.post("/api/bridge/:instance/start", (request, response) => this.start(request, response));
        Instance.app?.post("/api/bridge/:instance/stop", (request, response) => this.stop(request, response));
        Instance.app?.post("/api/bridge/:instance/restart", (request, response) => this.restart(request, response));
        Instance.app?.post("/api/bridge/:instance/clean", (request, response) => this.clean(request, response));
    }

    async start(request: Request, response: Response): Promise<void> {
        response.send(await command(request.params.instance, "bridge:start"));
    }

    async stop(request: Request, response: Response): Promise<void> {
        response.send(await command(request.params.instance, "bridge:stop"));
    }

    async restart(request: Request, response: Response): Promise<void> {
        response.send(await command(request.params.instance, "bridge:restart"));
    }

    async clean(request: Request, response: Response): Promise<void> {
        response.send(await command(request.params.instance, "bridge:clean"));
    }
}
