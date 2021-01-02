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
import System from "../../services/system";

const DEFAULT_POLLING = 5;

export default async function Monitor() {
    const results: { [key: string]: any } = {};

    for (let i = 0; i < State.bridges.length; i += 1) {
        if (State.bridges[i].type === "bridge") {
            const status = await Socket.fetch(State.bridges[i].id, "status:get");

            if (status) {
                results[State.bridges[i].id] = {
                    version: status.version,
                    running: status.running,
                    status: status.status,
                    display: State.bridges[i].display,
                    uptime: status.uptime,
                };
            } else {
                results[State.bridges[i].id] = {
                    running: false,
                    status: "unavailable",
                    display: "Unavailable",
                    uptime: 0,
                };
            }
        }
    }

    const system = await System.info();

    const cli = await System.cli.info();
    const hoobsd = await System.hoobsd.info();
    const runtime = await System.runtime.info();

    let upgraded = true;

    if (!hoobsd.hoobsd_upgraded) upgraded = false;
    if (!cli.cli_upgraded) upgraded = false;
    if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get" && !runtime.node_upgraded) upgraded = false;

    Console.emit(Events.MONITOR, "hub", {
        bridges: results,
        upgraded,
        cpu: await SystemInfo.currentLoad(),
        memory: await SystemInfo.mem(),
        temp: await SystemInfo.cpuTemperature(),
    });

    setTimeout(() => {
        Monitor();
    }, (State.api?.settings?.polling_seconds || DEFAULT_POLLING) * 1000);
}
