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

export default class StatusController {
    constructor() {
        State.app?.get("/api/status", (request, response) => this.status(request, response));
    }

    async status(_request: Request, response: Response): Promise<Response> {
        const results: { [key: string]: any } = {};

        for (let i = 0; i < State.instances.length; i += 1) {
            if (State.instances[i].type === "bridge") {
                const status = await Socket.fetch(State.instances[i].id, "status:get");

                if (status) {
                    results[State.instances[i].id] = {
                        version: status.version,
                        running: status.running,
                        status: status.status,
                        uptime: status.uptime,
                        product: status.productproduct,
                        bridge_name: status.bridge_name,
                        bridge_username: status.bridge_username,
                        bridge_port: status.bridge_port,
                        setup_pin: status.setup_pin,
                        setup_id: status.setup_id,
                        instance_path: status.instance_path,
                    };
                } else {
                    results[State.instances[i].id] = {
                        running: false,
                        status: "unavailable",
                        uptime: 0,
                    };
                }
            }
        }

        const cli = System.cli.info();
        const hoobsd = System.hoobsd.info();
        const runtime = System.runtime.info();

        return response.send({
            version: hoobsd.hoobsd_version,
            release: hoobsd.hoobsd_release,
            upgraded: hoobsd.hoobsd_upgraded,
            cli_version: cli.cli_version,
            cli_release: cli.cli_release,
            cli_upgraded: cli.cli_upgraded,
            node_version: runtime.node_version,
            node_release: runtime.node_release,
            node_upgraded: runtime.node_upgraded,
            instances: results,
            cpu: await SystemInfo.currentLoad(),
            memory: await SystemInfo.mem(),
            temp: await SystemInfo.cpuTemperature(),
        });
    }
}
