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
import Instance from "../shared/instance";
import Paths from "../shared/paths";
import Cache from "../shared/cache";
import Socket from "./socket";
import Bridge from "../bridge";
import Config from "../shared/config";
import Plugin from "../shared/plugin";
import Plugins from "../shared/plugins";
import { Console, Prefixed } from "../shared/logger";

import CacheController from "./cache";
import StatusController from "./status";
import ConfigController from "./config";
import BridgeController from "./bridge";
import PluginsController from "./plugins";
import AccessoriesController from "./accessories";

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
        this.config = Paths.configuration();
        this.settings = (this.config || {}).server || {};

        Instance.socket = new Socket(Instance.id);
        Instance.cache = new Cache();

        new CacheController();
        new StatusController();
        new ConfigController();
        new BridgeController();
        new PluginsController();
        new AccessoriesController();

        Plugins.load((identifier, name, _scope, directory, _pjson, library) => {
            if (existsSync(join(directory, library, "hoobs"))) {
                const plugin = require(join(directory, library, "hoobs")); // eslint-disable-line @typescript-eslint/no-var-requires, import/no-dynamic-require, global-require

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

    start(): void {
        Instance.bridge = new Bridge(this.port || undefined);

        Instance.bridge?.on("publishSetupUri", (uri) => {
            Console.debug(`Setup URI '${uri}'`);
        });

        Instance.bridge?.on("listening", () => {
            Console.message("bridge_start", Instance.id, {
                time: new Date().getTime(),
            });
        });

        Instance.bridge?.on("shutdown", () => {
            Console.message("bridge_stop", Instance.id, {
                time: new Date().getTime(),
            });
        });

        if ((this.config.server.autostart || 0) >= 0) {
            setTimeout(() => {
                Instance.bridge?.start();
            }, (this.config.server.autostart || 0) * 1000);
        }

        Instance.socket?.start();
    }

    async stop(): Promise<void> {
        Console.debug("");
        Console.debug("Shutting down");

        if (Instance.bridge) await Instance.bridge.stop();

        Console.debug("Stopped");

        if (Instance.socket) Instance.socket.stop();

        Instance.bridge = undefined;
    }
}
