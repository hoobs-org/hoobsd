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

import { EventEmitter } from "events";
import { HAPStorage } from "hap-nodejs";
import { existsSync } from "fs-extra";
import { join } from "path";
import State from "../state";
import Paths from "../services/paths";
import Socket from "./services/socket";
import Bridge from "../bridge";
import Config from "../services/config";
import Plugin from "../services/plugin";
import Plugins from "../services/plugins";

import {
    Console,
    Prefixed,
    Events,
} from "../services/logger";

import CacheController from "./controllers/cache";
import StatusController from "./controllers/status";
import ConfigController from "./controllers/config";
import BridgeController from "./controllers/bridge";
import PluginsController from "./controllers/plugins";
import AccessoriesController from "./controllers/accessories";

const BRIDGE_START_DELAY = 0;

export default class Server extends EventEmitter {
    declare time: number;

    declare config: any;

    declare settings: any;

    declare readonly port: number;

    constructor(port: number | undefined) {
        super();

        HAPStorage.setCustomStoragePath(Paths.persistPath());

        this.time = 0;
        this.port = port || 51826;
        this.config = Config.configuration();
        this.settings = (this.config || {}).server || {};

        State.socket = new Socket(State.id);

        new CacheController();
        new StatusController();
        new ConfigController();
        new BridgeController();
        new PluginsController();
        new AccessoriesController();

        Plugins.load(State.id, (identifier, name, _scope, directory, _pjson, library) => {
            if (existsSync(join(directory, library, "routes.js"))) {
                const plugin = require(join(directory, library, "routes.js"));

                let initializer;

                if (typeof plugin === "function") {
                    initializer = plugin;
                } else if (plugin && typeof plugin.default === "function") {
                    initializer = plugin.default;
                }

                if (initializer) {
                    try {
                        const api = new Plugin(identifier, name);
                        const logger = Prefixed(identifier, api.display);
                        const config = new Config(name);

                        initializer(logger, config, api);
                    } catch (_error) {
                        Console.error(`Error loading plugin ${identifier}`);
                    }
                }
            }
        });
    }

    start(soft?: boolean, override?: boolean): void {
        const bridge = State.bridges.find((n: any) => n.id === State.id);

        this.config = Config.configuration();
        State.bridge = new Bridge(this.port || undefined);

        State.bridge?.on(Events.PUBLISH_SETUP_URI, (uri) => {
            Console.debug(`Setup URI '${uri}'`);
        });

        State.bridge?.on(Events.ACCESSORY_CHANGE, (accessory, value) => {
            Console.emit(Events.ACCESSORY_CHANGE, State.id, {
                accessory,
                value,
            });
        });

        if (override || (bridge?.autostart || 0) >= 0) {
            setTimeout(() => {
                State.bridge?.start();
            }, override ? 0 : (bridge?.autostart || BRIDGE_START_DELAY) * 1000);
        }

        if (!soft) State.socket?.start();
    }

    async stop(soft?: boolean): Promise<void> {
        Console.debug("Shutting down");

        if (State.bridge) await State.bridge.stop();
        if (State.socket && !soft) State.socket.stop();

        Console.debug("Stopped");

        State.bridge = undefined;
    }
}
