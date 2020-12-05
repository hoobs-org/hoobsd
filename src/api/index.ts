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
import HTTP from "http";
import Express from "express";
import IO from "socket.io";
import Parser from "body-parser";
import CORS from "cors";
import { spawn, IPty } from "node-pty";
import { createHttpTerminator, HttpTerminator } from "http-terminator";
import Process from "child_process";
import { EventEmitter } from "events";
import { realpathSync, existsSync } from "fs-extra";

import {
    dirname,
    join,
    extname,
    basename,
} from "path";

import { LogLevel } from "homebridge/lib/logger";

import Paths from "../services/paths";
import Config from "../services/config";
import Instance from "../services/instance";
import Users from "../services/users";
import Socket from "./services/socket";
import Monitor from "./services/monitor";
import Plugins from "../services/plugins";
import { Console, Events } from "../services/logger";

import AuthController from "./controllers/auth";
import UsersController from "./controllers/users";
import StatusController from "./controllers/status";
import LogController from "./controllers/log";
import AccessoriesController from "./controllers/accessories";
import BridgeController from "./controllers/bridge";
import CacheController from "./controllers/cache";
import ConfigController from "./controllers/config";
import ExtentionsController from "./controllers/extentions";
import InstancesController from "./controllers/instances";
import PluginsController from "./controllers/plugins";
import RemoteController from "./controllers/remote";
import SystemController from "./controllers/system";
import ThemesController from "./controllers/themes";
import WeatherController from "./controllers/weather";

export default class API extends EventEmitter {
    declare time: number;

    declare running: boolean;

    declare readonly config: any;

    declare readonly settings: any;

    declare readonly port: number;

    declare private enviornment: { [key: string]: string };

    declare private processes: { [key: string]: Process.ChildProcess };

    declare private socket: Socket;

    declare private listner: HTTP.Server;

    declare private terminator: HttpTerminator;

    constructor(port: number | undefined) {
        super();

        this.time = 0;
        this.config = Config.configuration();
        this.settings = (this.config || {}).api || {};
        this.port = port || 80;
        this.processes = {};

        Instance.app = Express();

        this.listner = HTTP.createServer(Instance.app);

        this.terminator = createHttpTerminator({
            gracefulTerminationTimeout: 500,
            server: this.listner,
        });

        Instance.io = IO(this.listner);

        const paths = [];

        for (let i = 0; i < Instance.instances.length; i += 1) {
            if (Instance.instances[i].plugins && existsSync(join(<string>Instance.instances[i].plugins, ".bin"))) {
                paths.push(join(<string>Instance.instances[i].plugins, ".bin"));
            }
        }

        this.enviornment = {
            PATH: `${process.env.PATH}:${paths.join(":")}`,
            USER: `${process.env.USER}`,
        };

        if (existsSync("/etc/ssl/certs/cacert.pem")) this.enviornment.SSL_CERT_FILE = "/etc/ssl/certs/cacert.pem";

        Instance.io?.on("connection", (socket: IO.Socket): void => {
            socket.on(Events.SHELL_CONNECT, () => {
                Console.debug("terminal connect");

                let shell: IPty;

                try {
                    shell = spawn(process.env.SHELL || "sh", [], {
                        name: "xterm-color",
                        cwd: Paths.storagePath(),
                        env: _.create(process.env, this.enviornment),
                    });
                } catch (error) {
                    Console.error(error.message);
                    Console.debug(error.stack);

                    return;
                }

                shell.onData((data: any) => {
                    socket.emit(Events.SHELL_OUTPUT, data);
                });

                socket.on(Events.SHELL_INPUT, (data: any): void => {
                    shell.write(`${data}`);
                });

                socket.on(Events.SHELL_RESIZE, (data: any): void => {
                    Console.debug("terminal resize");

                    const parts = `${data}`.split(":");

                    if (parts.length === 2 && !Number.isNaN(parseInt(parts[0], 10)) && !Number.isNaN(parseInt(parts[1], 10))) {
                        shell.resize(
                            parseInt(parts[0], 10),
                            parseInt(parts[1], 10),
                        );
                    }
                });

                socket.on(Events.SHELL_CLEAR, (): void => {
                    shell.write("clear\r");
                });

                socket.on(Events.SHELL_DISCONNECT, (): void => {
                    Console.debug("terminal disconnect");

                    shell.write("exit\r");
                    shell.kill();
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
            request.user = Users.decodeToken(request.headers.authorization);

            if (this.settings.disable_auth) {
                next();

                return;
            }

            if (request.url.indexOf("/api") === 0 && [
                "/api",
                "/api/log",
                "/api/auth",
                "/api/auth/disable",
                "/api/auth/validate",
                "/api/instances/count",
                Users.count() > 0 ? "/api/auth/logon" : false,
                Users.count() > 0 ? "/api/auth/logout" : false,
                Users.count() === 0 ? "/api/users" : false,
            ].filter((item) => item).indexOf(request.url) === -1 && (!request.headers.authorization || !(await Users.validateToken(request.headers.authorization)))) {
                response.status(403).json({
                    error: "unauthorized",
                });

                return;
            }

            next();
        });

        Instance.app?.get("/api", (_request, response) => response.send({ version: Instance.version }));

        new AuthController();
        new UsersController();
        new StatusController();
        new LogController();
        new AccessoriesController();
        new BridgeController();
        new CacheController();
        new ConfigController();
        new ExtentionsController();
        new InstancesController();
        new PluginsController();
        new RemoteController();
        new SystemController();
        new ThemesController();
        new WeatherController();

        let gui: string | undefined = Plugins.findModule("@hoobs/gui");

        if (gui && existsSync(join(gui, "lib"))) gui = join(gui, "lib");

        let touch: string | undefined = Plugins.findModule("@hoobs/touch");

        if (touch && existsSync(join(touch, "lib"))) touch = join(touch, "lib");

        Instance.app?.use("/", Express.static(this.settings.gui_path || gui || join(dirname(realpathSync(__filename)), "../../var")));
        Instance.app?.use("/touch", Express.static(this.settings.touch_path || touch || join(dirname(realpathSync(__filename)), "../../var")));
        Instance.app?.use("/themes", Express.static(Paths.themePath()));

        Instance.app?.use("/backups", Express.static(Paths.backupPath(), {
            setHeaders: (response, path) => {
                if (extname(path) === ".instance") response.set("content-disposition", `attachment; filename="${basename(path).split("_")[0]}.instance"`);
                if (extname(path) === ".backup") response.set("content-disposition", "attachment; filename=\"hoobs.backup\"");
            },
        }));

        const defined: string[] = [];

        for (let i = 0; i < Instance.instances.length; i += 1) {
            if (Instance.instances[i].type === "bridge") {
                Plugins.load(Instance.instances[i].id, (_identifier, name, _scope, directory) => {
                    const route = `/plugin/${name.replace(/[^a-zA-Z0-9-_]/, "")}`;

                    if (defined.indexOf(route) === -1 && existsSync(join(directory, "static"))) {
                        Instance.app?.use(route, Express.static(join(directory, "static")));

                        defined.push(route);
                    }
                });
            }
        }
    }

    static createServer(port: number): API {
        const api = new API(port);

        api.on(Events.LISTENING, () => {
            Console.info(`API is running on port ${port}`);
        });

        return api;
    }

    launch(id: string, port: number): void {
        const flags: string[] = [
            "instance",
            "--mode", Instance.mode,
            "--instance", id,
            "--port", `${port}`,
        ];

        if (Instance.debug) flags.push("--debug");
        if (Instance.verbose) flags.push("--verbose");
        if (Instance.container) flags.push("--container");
        if (!Instance.orphans) flags.push("--orphans");

        if (basename(process.execPath) === "node") {
            this.processes[id] = Process.spawn(process.execPath, [join(__dirname, "../../bin/hoobsd"), ...flags], {
                stdio: "ignore",
            }).on("exit", () => {
                this.launch(id, port);
            });
        } else {
            this.processes[id] = Process.spawn(join(dirname(process.execPath), "worker"), flags, {
                stdio: "ignore",
            }).on("exit", () => {
                this.launch(id, port);
            });
        }
    }

    teardown(id: string): Promise<void> {
        return new Promise((resolve) => {
            if (this.processes[id] && !this.processes[id].killed) {
                this.processes[id].removeAllListeners("exit");

                this.processes[id].on("exit", () => {
                    resolve();
                });

                this.processes[id].kill();

                delete this.processes[id];
            } else {
                resolve();
            }
        });
    }

    sync(): Promise<void> {
        return new Promise((resolve) => {
            const waiters: Promise<void>[] = [];
            const current = Object.keys(this.processes);

            for (let i = 0; i < current.length; i += 1) {
                if (!Instance.instances.find((item) => item.id === current[i])) {
                    waiters.push(this.teardown(current[i]));
                }
            }

            const instances = Instance.instances.filter((item) => item.type === "bridge");

            for (let i = 0; i < instances.length; i += 1) {
                if (!this.processes[instances[i].id] || this.processes[instances[i].id].killed) {
                    this.launch(instances[i].id, instances[i].port);
                }
            }

            Promise.all(waiters).then(() => {
                resolve();
            });
        });
    }

    async start(): Promise<void> {
        this.socket = new Socket();

        this.socket.on(Events.LOG, (data: any) => Console.log(LogLevel.INFO, data));
        this.socket.on(Events.NOTIFICATION, (data: any) => Instance.io?.sockets.emit(Events.NOTIFICATION, data));
        this.socket.on(Events.ACCESSORY_CHANGE, (data: any) => Instance.io?.sockets.emit(Events.ACCESSORY_CHANGE, data));

        this.socket.start();

        for (let i = 0; i < Instance.instances.length; i += 1) {
            if (Instance.instances[i].type === "bridge") Console.import((await Socket.fetch(Instance.instances[i].id, "cache:log")) || []);
        }

        this.listner?.listen(this.port, () => {
            this.time = new Date().getTime();
            this.running = true;

            this.emit(Events.LISTENING, this.port);
        });

        const instances = Instance.instances.filter((item) => item.type === "bridge");

        for (let i = 0; i < instances.length; i += 1) {
            this.launch(instances[i].id, instances[i].port);
        }

        Monitor();
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.running) {
                Console.debug("Shutting down");

                this.running = false;

                const instances = Instance.instances.filter((item) => item.type === "bridge");
                const waiters: Promise<void>[] = [];

                for (let i = 0; i < instances.length; i += 1) {
                    waiters.push(this.teardown(instances[i].id));
                }

                Promise.all(waiters).then(() => {
                    this.socket.stop();

                    this.terminator.terminate().then(() => {
                        Console.debug("Stopped");

                        resolve();
                    });
                });
            } else {
                resolve();
            }
        });
    }
}
