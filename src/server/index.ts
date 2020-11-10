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
import Instance from "../services/instance";
import Paths from "../services/paths";
import Socket from "./services/socket";
import Bridge from "../bridge";
import Config from "../services/config";
import Plugin from "../services/plugin";
import Plugins from "../services/plugins";

import {
    Console,
    Prefixed,
    NotificationType,
    Events,
} from "../services/logger";

import CacheController from "./controllers/cache";
import StatusController from "./controllers/status";
import ConfigController from "./controllers/config";
import BridgeController from "./controllers/bridge";
import PluginsController from "./controllers/plugins";
import AccessoriesController from "./controllers/accessories";

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

        Instance.socket = new Socket(Instance.id);

        new CacheController();
        new StatusController();
        new ConfigController();
        new BridgeController();
        new PluginsController();
        new AccessoriesController();

        Plugins.load(Instance.id, (identifier, name, _scope, directory, _pjson, library) => {
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

    start(): void {
        const instance = Instance.instances.find((n: any) => n.id === Instance.id);

        Instance.bridge = new Bridge(this.port || undefined);

        Instance.bridge?.on(Events.PUBLISH_SETUP_URI, (uri) => {
            Console.debug(`Setup URI '${uri}'`);
        });

        Instance.bridge?.on(Events.LISTENING, () => {
            Console.notify(
                Instance.id,
                "Instance Started",
                `${Instance.display || Instance.id} has been started.`,
                NotificationType.SUCCESS,
                "router",
            );
        });

        Instance.bridge?.on(Events.SHUTDOWN, () => {
            Console.notify(
                Instance.id,
                "Instance Stopped",
                `${Instance.display || Instance.id} has been stopped.`,
                NotificationType.WARN,
                "router",
            );
        });

        Instance.bridge?.on(Events.ACCESSORY_CHANGE, (accessory, value) => {
            Console.emit(Events.ACCESSORY_CHANGE, Instance.id, {
                accessory,
                value,
            });
        });

        if ((instance?.autostart || 0) >= 0) {
            setTimeout(() => {
                Instance.bridge?.start();
            }, (instance?.autostart || 0) * 1000);
        }

        Instance.socket?.start();
    }

    async stop(): Promise<void> {
        Console.debug("Shutting down");

        if (Instance.bridge) await Instance.bridge.stop();

        Console.debug("Stopped");

        if (Instance.socket) Instance.socket.stop();

        Instance.bridge = undefined;
    }
}
