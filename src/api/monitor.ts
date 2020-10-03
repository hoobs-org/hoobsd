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

import System from "systeminformation";
import Instance from "../services/instance";
import { Console, Events } from "../services/logger";
import Socket from "./socket";

export default async function Monitor() {
    const results: { [key: string]: any } = {};

    for (let i = 0; i < Instance.instances.length; i += 1) {
        if (Instance.instances[i].type === "bridge") {
            const status = await Socket.fetch(Instance.instances[i].id, "status:get");

            if (status) {
                results[Instance.instances[i].id] = {
                    version: status.version,
                    running: status.running,
                    status: status.status,
                    uptime: status.uptime,
                };
            } else {
                results[Instance.instances[i].id] = {
                    running: false,
                    status: "unavailable",
                    uptime: 0,
                };
            }
        }
    }

    Console.emit(Events.MONITOR, "api", {
        instances: results,
        cpu: await System.currentLoad(),
        memory: await System.mem(),
        temp: await System.cpuTemperature(),
    });

    setTimeout(() => {
        Monitor();
    }, (Instance.api?.settings?.polling_seconds || 5) * 1000);
}
