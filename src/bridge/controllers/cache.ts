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

import { readdirSync } from "fs-extra";
import { join } from "path";
import State from "../../state";
import Paths from "../../services/paths";
import Bridges from "../../services/bridges";
import { Console } from "../../services/logger";
import { SocketRequest, SocketResponse } from "../services/socket";
import { loadJson } from "../../services/formatters";

export default class CacheController {
    constructor() {
        State.socket?.route("cache:log", (request: SocketRequest, response: SocketResponse) => this.log(request, response));
        State.socket?.route("cache:parings", (request: SocketRequest, response: SocketResponse) => this.parings(request, response));
        State.socket?.route("cache:accessories", (request: SocketRequest, response: SocketResponse) => this.accessories(request, response));
        State.socket?.route("cache:purge", (request: SocketRequest, response: SocketResponse) => this.purge(request, response));
    }

    log(_request: SocketRequest, response: SocketResponse): void {
        response.send(Console.cache());
    }

    parings(_request: SocketRequest, response: SocketResponse): void {
        const pairings = readdirSync(Paths.persist).filter((d) => d.match(/AccessoryInfo\.([A-F,a-f,0-9]+)\.json/));
        const results = [];

        for (let i = 0; i < pairings.length; i += 1) {
            const pairing = loadJson<{ [key: string]: any }>(join(Paths.persist, pairings[i]), {});
            const [, id] = pairings[i].split(".");

            results.push({
                id,
                version: pairing.configVersion,
                username: ((id || "").match(/.{1,2}/g) || []).join(":"),
                display: pairing.displayName,
                category: pairing.category,
                setup_pin: pairing.pincode,
                setup_id: pairing.setupID,
                clients: pairing.pairedClients,
                permissions: pairing.pairedClientsPermission,
            });
        }

        response.send(results);
    }

    accessories(_request: SocketRequest, response: SocketResponse): void {
        response.send(loadJson<{ [key: string]: any }[]>(join(Paths.accessories, "cachedAccessories"), []));
    }

    async purge(request: SocketRequest, response: SocketResponse): Promise<void> {
        Bridges.purge(request.params?.uuid);

        response.send({
            success: true,
        });

        State.bridge?.restart();
    }
}
