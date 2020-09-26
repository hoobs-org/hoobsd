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

import _ from "lodash";
import Express from "express";
import IO from "socket.io";
import Parser from "body-parser";
import CORS from "cors";
import PTY from "node-pty";
import { EventEmitter } from "events";
import { realpathSync, existsSync } from "fs-extra";
import { dirname, join } from "path";
import { LogLevel } from "homebridge/lib/logger";
import Paths from "../shared/paths";
import Instance from "../shared/instance";
import Users from "../shared/users";
import Socket from "./socket";
import Monitor from "./monitor";
import { Console } from "../shared/logger";
import { findModule } from "../shared/helpers";

import AuthController from "./auth";
import StatusController from "./status";
import AccessoriesController from "./accessories";
import BridgeController from "./bridge";
import CacheController from "./cache";
import ConfigController from "./config";
import FeaturesController from "./features";
import InstancesController from "./instances";
import PluginsController from "./plugins";
import RemoteController from "./remote";
import SystemController from "./system";

export default class API extends EventEmitter {
    declare time: number;

    declare readonly config: any;

    declare readonly settings: any;

    declare readonly port: number;

    declare private enviornment: { [key: string]: string };

    declare private socket: Socket;

    constructor(port: number | undefined) {
        super();

        this.time = 0;
        this.config = Paths.configuration();
        this.settings = (this.config || {}).api || {};
        this.port = port || 80;

        const paths = [];

        for (let i = 0; i < Instance.instances.length; i += 1) {
            if (Instance.instances[i].plugins && existsSync(join(<string>Instance.instances[i].plugins, ".bin"))) {
                paths.push(join(<string>Instance.instances[i].plugins, ".bin"));
            }
        }

        this.enviornment = {
            PATH: `${join(dirname(realpathSync(join(__filename, "../../"))), "cmd")}:${process.env.PATH}:${paths.join(":")}`,
        };

        if (existsSync("/etc/ssl/certs/cacert.pem")) this.enviornment.SSL_CERT_FILE = "/etc/ssl/certs/cacert.pem";

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

                    Console.error(error.message);
                    Console.debug(error.stack);

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

        Instance.app?.use(async (request, response, next) => {
            if (this.settings.disable_auth) {
                next();

                return;
            }

            if (request.url.indexOf("/api") === 0 && [
                "/api/auth",
                Users.count() > 0 ? "/api/auth/logon" : null,
                Users.count() === 0 ? "/api/auth/create" : null,
            ].indexOf(request.url) === -1 && (!request.headers.authorization || !(await Users.validateToken(request.headers.authorization)))) {
                response.status(403).json({
                    error: "unauthorized",
                });

                return;
            }

            next();
        });

        Instance.app?.get("/api", (_request, response) => response.send({ version: Instance.version }));

        new AuthController();
        new StatusController();
        new AccessoriesController();
        new BridgeController();
        new CacheController();
        new ConfigController();
        new FeaturesController();
        new InstancesController();
        new PluginsController();
        new RemoteController();
        new SystemController();

        let gui: string | undefined = findModule("@hoobs/gui");

        if (gui && existsSync(join(gui, "lib"))) gui = join(gui, "lib");

        let touch: string | undefined = findModule("@hoobs/touch");

        if (touch && existsSync(join(touch, "lib"))) touch = join(touch, "lib");

        Instance.app?.use("/", Express.static(this.settings.gui_path || gui || join(dirname(realpathSync(__filename)), "../../var")));
        Instance.app?.use("/touch", Express.static(this.settings.touch_path || touch || join(dirname(realpathSync(__filename)), "../../var")));
        Instance.app?.use("/backups", Express.static(Paths.backupPath()));
    }

    async start() {
        this.socket = new Socket();

        this.socket.on("log", (data: any) => Console.log(LogLevel.INFO, data));
        this.socket.on("bridge_start", (data: any) => Instance.io?.sockets.emit("bridge_start", data));
        this.socket.on("bridge_stop", (data: any) => Instance.io?.sockets.emit("bridge_stop", data));
        this.socket.on("accessory_change", (data: any) => Instance.io?.sockets.emit("accessory_change", data));
        this.socket.on("plugin_install", (data: any) => Instance.io?.sockets.emit("plugin_install", data));
        this.socket.on("plugin_uninstall", (data: any) => Instance.io?.sockets.emit("plugin_uninstall", data));
        this.socket.on("plugin_upgrade", (data: any) => Instance.io?.sockets.emit("plugin_upgrade", data));

        this.socket.start();

        for (let i = 0; i < Instance.instances.length; i += 1) {
            if (Instance.instances[i].type === "bridge") Console.import((await Socket.fetch(Instance.instances[i].id, "cache:log")) || []);
        }

        Instance.listner?.listen(this.port, () => {
            this.time = new Date().getTime();
            this.emit("listening", this.port);
        });

        Monitor();
    }

    stop() {
        this.socket.stop();
    }
}
