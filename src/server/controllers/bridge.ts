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
import Bridges from "../../services/bridges";
import { SocketRequest, SocketResponse } from "../services/socket";

export default class BridgeController {
    constructor() {
        State.socket?.route("bridge:start", (request: SocketRequest, response: SocketResponse) => this.start(request, response));
        State.socket?.route("bridge:stop", (request: SocketRequest, response: SocketResponse) => this.stop(request, response));
        State.socket?.route("bridge:restart", (request: SocketRequest, response: SocketResponse) => this.restart(request, response));
        State.socket?.route("bridge:purge", (request: SocketRequest, response: SocketResponse) => this.purge(request, response));
    }

    async start(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (!State.homebridge?.running) State.server?.start(true);

        response.send({
            success: true,
        });
    }

    async stop(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (State.homebridge?.running) await State.server?.stop(true);

        response.send({
            success: true,
        });
    }

    async restart(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (State.homebridge?.running) await State.server?.stop(true);
        if (!State.homebridge?.running) State.server?.start(true, true);

        response.send({
            success: true,
        });
    }

    async purge(_request: SocketRequest, response: SocketResponse): Promise<void> {
        Bridges.purge();

        if (State.homebridge?.running) await State.server?.stop(true);
        if (!State.homebridge?.running) State.server?.start(true, true);

        response.send({
            success: true,
        });
    }
}
