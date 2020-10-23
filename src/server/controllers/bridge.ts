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

import Instance from "../../services/instance";
import Instances from "../../services/instances";
import { SocketRequest, SocketResponse } from "../services/socket";

export default class BridgeController {
    constructor() {
        Instance.socket?.route("bridge:start", (request: SocketRequest, response: SocketResponse) => this.start(request, response));
        Instance.socket?.route("bridge:stop", (request: SocketRequest, response: SocketResponse) => this.stop(request, response));
        Instance.socket?.route("bridge:restart", (request: SocketRequest, response: SocketResponse) => this.restart(request, response));
        Instance.socket?.route("bridge:clean", (request: SocketRequest, response: SocketResponse) => this.clean(request, response));
    }

    async start(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (!Instance.bridge?.running) await Instance.bridge?.start();

        response.send({
            success: true,
        });
    }

    async stop(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (Instance.bridge?.running) await Instance.bridge.stop();

        response.send({
            success: true,
        });
    }

    async restart(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (Instance.bridge?.running) await Instance.bridge.restart();

        response.send({
            success: true,
        });
    }

    async clean(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (Instance.bridge?.running) await Instance.bridge.stop();

        Instances.clean();

        await Instance.bridge?.start();

        response.send({
            success: true,
        });
    }
}
