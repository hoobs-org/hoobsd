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
import State from "../state";
import Config from "./config";
import Paths from "./paths";
import { Console, Prefixed, PluginLogger } from "./logger";
import { BridgeRecord } from "./bridges";

export default class Plugin {
    declare readonly bridge: BridgeRecord;

    declare readonly identifier: string;

    declare readonly name: string;

    declare readonly display: string;

    declare readonly logger: PluginLogger;

    constructor(bridge: BridgeRecord, identifier: string, name: string) {
        const config = Config.configuration(bridge.id);
        const platform = config.platforms.find((p: any) => (p.plugin_map || {}).plugin_name === name);
        const accessory = config.accessories.find((p: any) => (p.plugin_map || {}).plugin_name === name);

        this.bridge = bridge;
        this.identifier = identifier;
        this.name = name;
        this.display = platform?.name || accessory?.name || name;
        this.logger = Prefixed(identifier, this.display);
    }

    registerRoute(action: string, controller: (request: Request, response: Response) => any) {
        if ((/^([a-zA-Z0-9-_]*)$/).test(action)) {
            Console.debug(`Registering route '${this.identifier.replace(/[^a-zA-Z0-9-_@/]/, "")}:${action}' on '${this.bridge.id}'`);

            State.plugins[`${this.bridge.id}:plugin:${this.identifier.replace(/[^a-zA-Z0-9-_@/]/, "")}:${action}`] = (request: Request, response: Response) => {
                try {
                    controller(request, response);
                } catch (error: any) {
                    this.logger.error(error?.message || "Error running route");
                }
            };
        } else {
            this.logger.error(`Unable to register route '${action}', action is not formatted correctly.`);
        }
    }

    get storagePath() {
        return Paths.data(State.id);
    }
}
