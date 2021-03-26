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

import { join } from "path";
import { existsSync } from "fs-extra";
import { Request, Response, NextFunction } from "express-serve-static-core";
import State from "../../state";
import Socket from "../services/socket";
import Plugin from "../services/plugin";
import Security from "../../services/security";

export default class PluginController {
    constructor() {
        State.app?.get("/ui/plugin/:identifier/*", Plugin, (request, response, next) => this.ui(request, response));
        State.app?.post("/api/plugin/:identifier/:action", Security, Plugin, (request, response, next) => this.execute(request, response, next));
    }

    ui(request: Request, response: Response): void {
        const directory = response.locals.sidecar || join(response.locals.directory, "hoobs");
        const filename = join(directory, "ui", request.params[0] ? request.params[0] : "index.html");

        if (existsSync(filename)) {
            response.sendFile(filename);

            return;
        }

        response.send();
    }

    async execute(request: Request, response: Response, next: NextFunction): Promise<void> {
        const directory = response.locals.sidecar || join(response.locals.directory, "hoobs");

        if (existsSync(join(directory, "routes.js"))) {
            response.send(await Socket.fetch(response.locals.bridge, `plugin:${response.locals.identifier}:${request.params.action}`, request.params, request.body));

            return;
        }

        next();
    }
}
