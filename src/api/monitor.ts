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
import Instance from "../shared/instance";
import { Console } from "../shared/logger";
import Socket from "./socket";

export default async function Monitor(bridges: any[]) {
    const instances: { [key: string]: any } = {};

    for (let i = 0; i < bridges.length; i += 1) {
        const status = await Socket.fetch(bridges[i].id, "status:get");

        if (status) {
            instances[bridges[i].id] = {
                version: status.version,
                running: status.running,
                status: status.status,
                uptime: status.uptime,
            };
        } else {
            instances[bridges[i].id] = {
                running: false,
                status: "unavailable",
                uptime: 0,
            };
        }
    }

    Console.message("monitor", "api", {
        instances,
        cpu: await System.currentLoad(),
        memory: await System.mem(),
        temp: await System.cpuTemperature(),
    });

    setTimeout(() => {
        Monitor(bridges);
    }, (Instance.api?.settings?.polling_seconds || 5) * 1000);
}
