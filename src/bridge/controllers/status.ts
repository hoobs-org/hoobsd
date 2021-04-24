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

import State from "../../state";
import Paths from "../../services/paths";
import { Console } from "../../services/logger";
import { IPCRequest, IPCResponse } from "../../services/ipc";

export default class StatusController {
    declare id: string | undefined;

    declare path: string | undefined;

    constructor() {
        State.ipc?.route("status:get", (request, response) => this.status(request, response));
        State.ipc?.route("status:log", (request, response) => this.log(request, response));
    }

    status(_request: IPCRequest, response: IPCResponse): void {
        this.path = this.path || Paths.data(State.id);

        response.send({
            id: State.id,
            bridge: State.display || State.id,
            running: State.homebridge?.running,
            status: State.homebridge?.running ? "running" : "stopped",
            uptime: new Date().getTime() - (State.bridge?.time || 0),
            product: "HOOBS State",
            version: State.version,
            bridge_name: State.homebridge?.settings.name || "",
            bridge_username: State.homebridge?.settings.username || "",
            bridge_port: State.homebridge?.port,
            setup_pin: State.homebridge?.settings.pin || "",
            setup_id: State.setup || "",
            bridge_path: this.path || "",
            heap: process.memoryUsage().heapUsed,
        });
    }

    log(_request: IPCRequest, response: IPCResponse): void {
        response.send(Console.cache());
    }
}
