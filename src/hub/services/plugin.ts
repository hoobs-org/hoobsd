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
import Plugins from "../../services/plugins";

export default async function Plugin(request: Request, response: Response, next: NextFunction): Promise<void> {
    let found = false;
    let name: string | undefined = request.params?.scope ? `${request.params.scope}/${request.params.name}` : request.params?.name;
    let scope: string | undefined = "";

    if ((name || "").startsWith("@")) {
        name = (name || "").substring(1);
        scope = name.split("/").shift();
        name = name.split("/").pop();
    }

    const plugin = (scope || "") !== "" ? `@${scope}/${name}` : (name || "");

    for (let i = 0; i < State.bridges.length; i += 1) {
        if (State.bridges[i].type === "bridge") {
            Plugins.load(State.bridges[i].id, (identifier, _name, _scope, directory, _pjson, library) => {
                if (!found && identifier === plugin) {
                    response.locals.bridge = State.bridges[i].id;
                    response.locals.identifier = identifier;
                    response.locals.directory = directory;
                    response.locals.library = library;

                    found = true;

                    next();
                }
            });
        }
    }

    if (!found) {
        response.sendFile(resolve(join(State.hub?.settings.gui_path || existsSync("/usr/lib/hoobs") ? "/usr/lib/hoobs" : join(__dirname, "../../static"), "index.html")));
    }
}
