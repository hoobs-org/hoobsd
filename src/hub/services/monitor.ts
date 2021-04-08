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

import SystemInfo from "systeminformation";
import State from "../../state";
import { Console, Events } from "../../services/logger";
import Socket from "./socket";

const DEFAULT_POLLING = 5;

export default async function Monitor() {
    const results: { [key: string]: any } = {};

    for (let i = 0; i < State.bridges.length; i += 1) {
        if (State.bridges[i].type !== "hub") {
            const status = await Socket.fetch(State.bridges[i].id, "status:get");

            if (status) {
                results[State.bridges[i].id] = {
                    version: status.version,
                    running: status.running,
                    status: status.status,
                    display: State.bridges[i].display,
                    uptime: status.uptime,
                    heap: status.heap,
                };
            } else {
                results[State.bridges[i].id] = {
                    running: false,
                    status: "unavailable",
                    display: "Unavailable",
                    uptime: 0,
                    heap: 0,
                };
            }
        }
    }

    Console.emit(Events.MONITOR, "hub", {
        bridges: results,
        cpu: await SystemInfo.currentLoad(),
        memory: await SystemInfo.mem(),
        temp: await SystemInfo.cpuTemperature(),
        heap: process.memoryUsage().heapUsed,
    });

    setTimeout(() => {
        Monitor();
    }, (State.hub?.settings?.polling_seconds || DEFAULT_POLLING) * 1000);
}
