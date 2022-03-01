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
import { BridgeRecord } from "../../services/bridges";
import { sanitize } from "../../services/formatters";

export function Locals(bridge: BridgeRecord | undefined, identifier: string, response: Response) {
    if (bridge && bridge.type !== "hub") {
        const plugin: { [key: string]: any } | undefined = Plugins.load(bridge.id, bridge.type === "dev").find((item) => item.identifier === identifier);

        if (plugin) {
            const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(bridge.id), "sidecars.json"), {});

            response.locals.bridge = bridge.id;
            response.locals.identifier = plugin.identifier;
            response.locals.sidecar = sidecars[plugin.identifier] ? join(Paths.data(bridge.id), "node_modules", sidecars[plugin.identifier]) : null;
            response.locals.directory = plugin.directory;
            response.locals.library = plugin.library;

            return true;
        }
    }

    return false;
}

export default async function Plugin(request: Request, response: Response, next: NextFunction): Promise<void> {
    const identifier: string = decodeURIComponent(request.params.identifier);

    let found = false;

    const id = sanitize(request.body.bridge, "hub");

    found = Locals(State.bridges.find((item) => item.id === id), identifier, response);

    if (found) return next();

    for (let i = 0; i < State.bridges.length; i += 1) {
        found = Locals(State.bridges[i], identifier, response);

        if (found) return next();
    }

    let gui: string = State.hub?.settings.gui_path || "/usr/lib/hoobs";

    if (!existsSync(gui)) gui = "/usr/local/lib/hoobs";
    if (!existsSync(gui)) gui = join(__dirname, "../static");

    return response.sendFile(resolve(join(gui, "index.html")));
}
