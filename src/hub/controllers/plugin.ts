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
import Plugin from "../services/plugin";

export default class PluginController {
    constructor() {
        State.app?.get("/ui/plugin/:identifier/*", (request, response, next) => Plugin(request, response, next), (request, response) => this.ui(request, response));
        State.app?.post("/api/plugin/:identifier/:action", (request, response, next) => Plugin(request, response, next), (request, response, next) => this.execute(request, response, next));
    }

    ui(request: Request, response: Response): void {
        const directory = response.locals.sidecar || join(response.locals.directory, "hoobs");
        const filename = join(directory, "ui", request.params[0] ? request.params[0] : "index.html");

        if (existsSync(filename)) {
            response.sendFile(filename);
        } else {
            response.send();
        }
    }

    async execute(request: Request, response: Response, next: NextFunction): Promise<void> {
        const directory = response.locals.sidecar || join(response.locals.directory, "hoobs");

        if (existsSync(join(directory, "routes.js"))) {
            const results = await State.plugins[`${response.locals.bridge}:plugin:${response.locals.identifier}:${request.params.action}`](request.params, request.body);

            response.send(results);
        } else {
            next();
        }
    }
}
