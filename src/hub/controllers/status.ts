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
import Socket from "../services/socket";
import System from "../../services/system";
import Security from "../../services/security";

export default class StatusController {
    constructor() {
        State.app?.get("/api/status", Security, (request, response) => this.status(request, response));
    }

    async status(_request: Request, response: Response): Promise<Response> {
        const key = "system/status";
        const results: { [key: string]: any } = {};

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type !== "hub") {
                const status = await Socket.fetch(State.bridges[i].id, "status:get");

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
                    results[State.bridges[i].id] = {
                        running: false,
                        status: "unavailable",
                        uptime: 0,
                    };
                }
            }
        }

        const system = System.info();
        const waits: Promise<void>[] = [];
        const applications: { [key: string]: any } = State.cache?.get<{ [key: string]: any }>(key) || {};

        if (!applications.cli) waits.push(new Promise((resolve) => { System.cli.info().then((info: { [key: string]: any }) => { applications.cli = info; }).finally(() => { resolve(); }); }));
        if (!applications.gui) waits.push(new Promise((resolve) => { System.gui.info().then((info: { [key: string]: any }) => { applications.gui = info; }).finally(() => { resolve(); }); }));
        if (!applications.hoobsd) waits.push(new Promise((resolve) => { System.hoobsd.info().then((info: { [key: string]: any }) => { applications.hoobsd = info; }).finally(() => { resolve(); }); }));
        if (!applications.runtime) waits.push(new Promise((resolve) => { System.runtime.info().then((info: { [key: string]: any }) => { applications.runtime = info; }).finally(() => { resolve(); }); }));

        await Promise.all(waits);

        let product = "custom";
        let upgraded = true;

        if (system.product === "box" || system.product === "card" || system.product === "headless") product = system.product;
        if ((system.product === "box" || system.product === "card" || system.product === "headless") && system.package_manager === "apt-get") upgraded = applications.runtime?.node_upgraded;

        if (applications.gui?.gui_version) {
            return response.send({
                product,
                mdns: system.mdns,
                broadcast: system.mdns_broadcast,
                version: applications.hoobsd?.hoobsd_version,
                current: applications.hoobsd?.hoobsd_current,
                upgraded: applications.hoobsd?.hoobsd_upgraded,
                cli_version: applications.cli?.cli_version,
                cli_current: applications.cli?.cli_current,
                cli_upgraded: applications.cli?.cli_upgraded,
                gui_version: applications.gui.gui_version,
                gui_current: applications.gui.gui_current,
                gui_upgraded: applications.gui.gui_upgraded,
                node_version: process.version.replace("v", ""),
                node_current: applications.runtime?.node_current,
                node_upgraded: upgraded,
                bridges: results,
                cpu: await SystemInfo.currentLoad(),
                memory: await SystemInfo.mem(),
                temp: await SystemInfo.cpuTemperature(),
            });
        }

        return response.send({
            product,
            mdns: system.mdns,
            broadcast: system.mdns_broadcast,
            version: applications.hoobsd?.hoobsd_version,
            current: applications.hoobsd?.hoobsd_current,
            upgraded: applications.hoobsd?.hoobsd_upgraded,
            cli_version: applications.cli?.cli_version,
            cli_current: applications.cli?.cli_current,
            cli_upgraded: applications.cli?.cli_upgraded,
            node_version: process.version.replace("v", ""),
            node_current: applications.runtime?.node_current,
            node_upgraded: upgraded,
            bridges: results,
            cpu: await SystemInfo.currentLoad(),
            memory: await SystemInfo.mem(),
            temp: await SystemInfo.cpuTemperature(),
        });
    }
}
