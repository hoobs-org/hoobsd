/**************************************************************************************************
 * HOOBSD                                                                                         *
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

import Instance from "../shared/instance";
import Paths from "../shared/paths";
import { SocketRequest, SocketResponse } from "./pipe";

export default class BridgeController {
    constructor() {
        Instance.socket?.route("bridge:start", (request: SocketRequest, response: SocketResponse) => BridgeController.start(request, response));
        Instance.socket?.route("bridge:stop", (request: SocketRequest, response: SocketResponse) => BridgeController.stop(request, response));
        Instance.socket?.route("bridge:restart", (request: SocketRequest, response: SocketResponse) => BridgeController.restart(request, response));
        Instance.socket?.route("bridge:clean", (request: SocketRequest, response: SocketResponse) => BridgeController.clean(request, response));
    }

    static async start(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (!Instance.bridge?.running) {
            await Instance.bridge?.start();
        }

        response.send({
            success: true,
        });
    }

    static async stop(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (Instance.bridge?.running) {
            await Instance.bridge.stop();
        }

        response.send({
            success: true,
        });
    }

    static async restart(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (Instance.bridge?.running) {
            await Instance.bridge.restart();
        }

        response.send({
            success: true,
        });
    }

    static async clean(_request: SocketRequest, response: SocketResponse): Promise<void> {
        if (Instance.bridge?.running) {
            await Instance.bridge.stop();
        }

        Paths.clean();

        await Instance.bridge?.start();

        response.send({
            success: true,
        });
    }
}
