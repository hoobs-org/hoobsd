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

import Instance from "../shared/instance";
import Paths from "../shared/paths";
import { SocketRequest, SocketResponse } from "./socket";

export default class ConfigController {
    constructor() {
        Instance.socket?.route("config:get", (request: SocketRequest, response: SocketResponse) => this.get(request, response));
        Instance.socket?.route("config:save", (request: SocketRequest, response: SocketResponse) => this.save(request, response));
    }

    get(_request: SocketRequest, response: SocketResponse): void {
        response.send(Instance.server?.config);
    }

    async save(request: SocketRequest, response: SocketResponse): Promise<void> {
        Paths.saveConfig(request.body);

        if (Instance.bridge) {
            await Instance.bridge.restart();
        }

        response.send({
            success: true,
        });
    }
}
