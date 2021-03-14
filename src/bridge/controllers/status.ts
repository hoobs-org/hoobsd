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
import { SocketRequest, SocketResponse } from "../services/socket";

export default class StatusController {
    declare id: string | undefined;

    declare path: string | undefined;

    constructor() {
        State.socket?.route("status:get", (request: SocketRequest, response: SocketResponse) => this.status(request, response));
        State.socket?.route("status:log", (request: SocketRequest, response: SocketResponse) => this.log(request, response));
    }

    status(_request: SocketRequest, response: SocketResponse): void {
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
        });
    }

    log(_request: SocketRequest, response: SocketResponse): void {
        response.send(Console.cache());
    }
}
