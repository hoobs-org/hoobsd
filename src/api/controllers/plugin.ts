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
import { existsSync } from "fs-extra";
import { join } from "path";
import State from "../../state";
import Socket from "../services/socket";
import Plugins from "../../services/plugins";

export default class PluginController {
    constructor() {
        const defined: string[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type === "bridge") {
                Plugins.load(State.bridges[i].id, (_identifier, name, _scope, directory, _pjson, library) => {
                    const route = `/api/plugin/${name.replace(/[^a-zA-Z0-9-_]/, "")}/:action`;

                    if (defined.indexOf(route) === -1 && existsSync(join(directory, library, "routes.js"))) {
                        State.app?.post(route, (request, response) => this.execute(request.body.bridge, name, request, response));

                        defined.push(route);
                    }
                });
            }
        }
    }

    async execute(bridge: string, name: string, request: Request, response: Response): Promise<void> {
        delete request.body.bridge;

        if (bridge && bridge !== "" && bridge !== "api") {
            response.send(await Socket.fetch(bridge, `plugin:${name}:${request.params.action}`, request.params, request.body));
        }

        response.send({});
    }
}
