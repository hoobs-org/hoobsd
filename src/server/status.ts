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

import Instance from "../services/instance";
import Paths from "../services/paths";
import { SocketRequest, SocketResponse } from "./socket";

export default class StatusController {
    constructor() {
        Instance.socket?.route("status:get", (request: SocketRequest, response: SocketResponse) => this.status(request, response));
    }

    status(_request: SocketRequest, response: SocketResponse): void {
        response.send({
            id: Instance.id,
            instance: Instance.display || Instance.id,
            running: Instance.bridge?.running,
            status: Instance.bridge?.running ? "running" : "stopped",
            uptime: new Date().getTime() - (Instance.server?.time || 0),
            bridge_name: Instance.bridge?.settings.name || "",
            product: "HOOBS Server",
            version: Instance.version,
            node_version: (process.version || "").replace(/v/gi, ""),
            username: Instance.bridge?.settings.username || "",
            bridge_port: Instance.bridge?.port,
            setup_pin: Instance.bridge?.settings.pin || "",
            setup_id: Instance.bridge?.setupURI(),
            storage_path: Paths.storagePath(),
        });
    }
}
