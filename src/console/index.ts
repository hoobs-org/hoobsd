/**************************************************************************************************
 * HOOBSD                                                                                         *
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

import _ from "lodash";
import Express from "express";
import IO from "socket.io";
import Parser from "body-parser";
import CORS from "cors";
import PTY from "node-pty";
import { EventEmitter } from "events";
import { realpathSync, existsSync } from "fs-extra";
import { dirname, join } from "path";
import Paths from "../shared/paths";
import Instance from "../shared/instance";
import Instances from "../shared/instances";
import Socket, { command } from "./socket";
import { Log } from "../shared/logger";

import AccessoriesController from "./accessories";
import BridgeController from "./bridge";
import CacheController from "./cache";
import ConfigController from "./config";
import FeaturesController from "./features";
import InstancesController from "./instances";
import PluginsController from "./plugins";
import RemoteController from "./remote";
import StatusController from "./status";
import SystemController from "./system";

export default class Console extends EventEmitter {
    declare time: number;

    declare readonly config: any;

    declare readonly settings: any;

    declare readonly port: number;

    declare private enviornment: { [key: string]: string };

    declare private instances: any[];

    declare private paths: string[];

    declare private socket: Socket;

    constructor(port: number | undefined) {
        super();

        this.time = 0;
        this.config = Paths.configuration();
        this.settings = (this.config || {}).console || {};
        this.port = port || this.settings.port || 50820;
        this.instances = Instances.list();
        this.paths = [];

        for (let i = 0; i < this.instances.length; i += 1) {
            if (this.instances[i].plugins && existsSync(join(this.instances[i].plugins, ".bin"))) {
                this.paths.push(join(this.instances[i].plugins, ".bin"));
            }
        }

        this.enviornment = {
            PATH: `${join(dirname(realpathSync(join(__filename, "../../"))), "cmd")}:${process.env.PATH}:${this.paths.join(":")}`,
        };

        if (existsSync("/etc/ssl/certs/cacert.pem")) {
            this.enviornment.SSL_CERT_FILE = "/etc/ssl/certs/cacert.pem";
        }

        Instance.io?.on("connection", (socket: IO.Socket): void => {
            socket.on("shell:connect", () => {
                let shell: PTY.IPty | undefined;

                try {
                    shell = PTY.spawn(process.env.SHELL || "sh", [], {
                        name: "xterm-color",
                        cwd: Paths.storagePath(),
                        env: _.create(process.env, this.enviornment),
                    });
                } catch (error) {
                    shell = undefined;

                    Log.error(error.message);
                    Log.debug(error.stack);

                    return;
                }

                shell?.onData((data: any) => {
                    socket.emit("shell:output", data);
                });

                socket.on("shell:input", (data: any): void => {
                    shell?.write(data);
                });

                socket.on("shell:resize", (data): void => {
                    const parts = data.split(":");

                    if (parts.length === 3 && !Number.isNaN(parseInt(parts[1], 10)) && !Number.isNaN(parseInt(parts[2], 10))) {
                        shell?.resize(
                            parseInt(parts[1], 10),
                            parseInt(parts[2], 10),
                        );
                    }
                });

                socket.on("shell:clear", (): void => {
                    shell?.write("clear\r");
                });

                socket.on("shell:disconnect", (): void => {
                    shell?.write("exit\r");
                    shell = undefined;
                });
            });
        });

        Instance.app?.use(CORS({
            origin: this.settings.origin || "*",
        }));

        Instance.app?.use(Parser.json());

        if (Instance.debug) {
            Instance.app?.use((request, _response, next) => {
                this.emit("request", request.method, request.url);
                next();
            });
        }

        new AccessoriesController();
        new BridgeController();
        new CacheController();
        new ConfigController();
        new FeaturesController();
        new InstancesController();
        new PluginsController();
        new RemoteController();
        new StatusController();
        new SystemController();

        Instance.app?.use("/backups", Express.static(Paths.backupPath()));
    }

    async start() {
        this.socket = new Socket();

        this.socket.on("log", (data: any) => Log.transmit(data));
        this.socket.on("bridge_start", (data: any) => Instance.io?.sockets.emit("bridge_start", data));
        this.socket.on("bridge_stop", (data: any) => Instance.io?.sockets.emit("bridge_stop", data));
        this.socket.on("accessory_change", (data: any) => Instance.io?.sockets.emit("accessory_change", data));
        this.socket.on("heartbeat", (data: any) => Instance.io?.sockets.emit("heartbeat", data));
        this.socket.on("plugin_install", (data: any) => Instance.io?.sockets.emit("plugin_install", data));
        this.socket.on("plugin_uninstall", (data: any) => Instance.io?.sockets.emit("plugin_uninstall", data));
        this.socket.on("plugin_upgrade", (data: any) => Instance.io?.sockets.emit("plugin_upgrade", data));

        this.socket.start();

        for (let i = 0; i < this.instances.length; i += 1) {
            if (this.instances[i].type === "bridge") {
                Log.import((await command(this.instances[i].id, "cache:log")) || []);
            }
        }

        Instance.listner?.listen(this.port, () => {
            this.emit("listening", this.port);
        });
    }

    stop() {
        this.socket.stop();
    }
}
