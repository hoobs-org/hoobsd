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
import { Request, Response } from "express-serve-static-core";
import State from "../../state";
import System from "../../services/system";
import Security from "../../services/security";

export default class StatusController {
    constructor() {
        State.app?.get("/api/status", (request, response, next) => Security(request, response, next), (request, response) => this.status(request, response));
    }

    status(_request: Request, response: Response): void {
        const key = "system/status";
        const results: { [key: string]: any } = {};

        let waits: Promise<void>[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type !== "hub") {
                waits.push(new Promise((resolve) => {
                    State.ipc?.fetch(State.bridges[i].id, "status:get").then((status) => {
                        if (status) {
                            results[State.bridges[i].id] = {
                                version: status.version,
                                running: status.running,
                                status: status.status,
                                uptime: status.uptime,
                                product: status.product,
                                bridge_name: status.bridge_name,
                                bridge_username: status.bridge_username,
                                bridge_port: status.bridge_port,
                                setup_pin: status.setup_pin,
                                setup_id: status.setup_id,
                                bridge_path: status.bridge_path,
                            };
                        } else {
                            results[State.bridges[i].id] = { running: false, status: "unavailable", uptime: 0 };
                        }
                    }).finally(() => resolve());
                }));
            }
        }

        let cpu: any;
        let memory: any;
        let temp: any;

        waits.push(new Promise((resolve) => SystemInfo.currentLoad().then((info: any) => { cpu = info; }).finally(() => { resolve(); })));
        waits.push(new Promise((resolve) => SystemInfo.mem().then((info: any) => { memory = info; }).finally(() => { resolve(); })));
        waits.push(new Promise((resolve) => SystemInfo.cpuTemperature().then((info: any) => { temp = info; }).finally(() => { resolve(); })));

        Promise.allSettled(waits).then(() => {
            waits = [];

            const system = System.info();
            const applications: { [key: string]: any } = State.cache?.get<{ [key: string]: any }>(key) || {};

            if (!applications.cli) applications.cli = System.cli.info();
            if (!applications.gui) applications.gui = System.gui.info();
            if (!applications.hoobsd) applications.hoobsd = System.hoobsd.info();
            if (!applications.runtime) applications.runtime = System.runtime.info();

            let product = "custom";
            let upgraded = true;

            if (system.product === "box" || system.product === "card" || system.product === "headless") product = system.product;
            if (system.package_manager === "apt-get") upgraded = applications.runtime?.node_upgraded;

            let stats: { [key: string]: any } | undefined = {
                product,
                mdns: system.mdns,
                broadcast: system.mdns_broadcast,
                version: applications.hoobsd?.hoobsd_version,
                current: applications.hoobsd?.hoobsd_current,
                upgraded: applications.hoobsd?.hoobsd_upgraded,
                repo: system.repo,
                cli_version: applications.cli?.cli_version,
                cli_current: applications.cli?.cli_current,
                cli_upgraded: applications.cli?.cli_upgraded,
                homebridge_version: State.engine,
                node_version: process.version.replace("v", ""),
                node_current: applications.runtime?.node_current,
                node_upgraded: upgraded,
                upgradable: system.upgradable,
                bridges: results,
                terminal: system.terminal,
                cpu,
                memory,
                temp,
            };

            if (applications.gui?.gui_version) {
                stats.gui_version = applications.gui.gui_version;
                stats.gui_current = applications.gui.gui_current;
                stats.gui_upgraded = applications.gui.gui_upgraded;
            }

            response.send(stats);

            stats = undefined;
        });
    }
}
