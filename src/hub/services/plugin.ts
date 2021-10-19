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

import { existsSync } from "fs-extra";
import { join, resolve } from "path";
import { Request, Response, NextFunction } from "express-serve-static-core";
import State from "../../state";
import Paths from "../../services/paths";
import Plugins from "../../services/plugins";

export default async function Plugin(request: Request, response: Response, next: NextFunction): Promise<void> {
    const identifier: string = decodeURIComponent(request.params.identifier);

    let found = false;

    for (let i = 0; i < State.bridges.length; i += 1) {
        if (State.bridges[i].type !== "hub") {
            const plugin: { [key: string]: any } | undefined = Plugins.load(State.bridges[i].id, State.bridges[i].type === "dev").find((item) => item.identifier === identifier);

            if (plugin) {
                const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(State.bridges[i].id), "sidecars.json"), {});

                response.locals.bridge = State.bridges[i].id;
                response.locals.identifier = plugin.identifier;
                response.locals.sidecar = sidecars[plugin.identifier] ? join(Paths.data(State.bridges[i].id), "node_modules", sidecars[plugin.identifier]) : null;
                response.locals.directory = plugin.directory;
                response.locals.library = plugin.library;

                found = true;

                next();
            }
        }
    }

    if (!found) {
        let gui: string = State.hub?.settings.gui_path || "/usr/lib/hoobs";

        if (!existsSync(gui)) gui = "/usr/local/lib/hoobs";
        if (!existsSync(gui)) gui = join(__dirname, "../static");

        response.sendFile(resolve(join(gui, "index.html")));
    }
}
