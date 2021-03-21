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

import OS from "os";
import { Request, Response } from "express-serve-static-core";
import State from "../../state";

export default class IndexController {
    constructor() {
        State.app?.get("/api", (request, response) => this.info(request, response));
    }

    info(_request: Request, response: Response): Response {
        const interfaces = OS.networkInterfaces();
        const network: { [key: string]: any } = [];
        const keys = Object.keys(interfaces);

        for (let i = 0; i < keys.length; i += 1) {
            let current: { [key: string]: any }[] = [];

            current = interfaces[keys[i]]?.filter((item: { [key: string]: any }) => !item.internal && item.family === "IPv4") || [];
            current = current.map((item: { [key: string]: any }) => ({ interface: keys[i], ip_address: item.address, mac_address: item.mac }));

            if (current.length > 0) network.push(...current);
        }

        return response.send({
            application: "hoobsd",
            version: State.version,
            authentication: {
                state: "/api/auth",
                login: "/api/auth/logon",
                validate: "/api/auth/validate",
            },
            network,
        });
    }
}
