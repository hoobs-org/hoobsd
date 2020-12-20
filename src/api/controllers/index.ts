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

import { Request, Response } from "express-serve-static-core";
import State from "../../state";
import System from "../../services/system";

export default class IndexController {
    constructor() {
        State.app?.get("/api", (request, response) => this.info(request, response));
    }

    async info(_request: Request, response: Response): Promise<Response> {
        const system = await System.info();

        if ((system.product === "box" || system.product === "card") && system.init_system === "systemd" && system.mdns) {
            return response.send({
                version: State.version,
                product: system.product,
                broadcast: system.mdns_broadcast,
            });
        }

        return response.send({
            version: State.version,
        });
    }
}
