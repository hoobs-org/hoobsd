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
import Compression from "compression";
import IO from "socket.io";
import CORS from "cors";
import Process from "child_process";
import Path from "path";
import { spawn, IPty } from "node-pty";
import { createHttpTerminator, HttpTerminator } from "http-terminator";
import { EventEmitter } from "events";
import { LogLevel } from "homebridge/lib/logger";

import {
    existsSync,
    lstatSync,
    readdirSync,
    removeSync,
} from "fs-extra";

import Paths from "../services/paths";
import Config from "../services/config";
import System from "../services/system";
import State from "../state";
import Users from "../services/users";
import Socket from "./services/socket";
import Monitor from "./services/monitor";
import Bridges from "../services/bridges";
import { Console, Events } from "../services/logger";

import IndexController from "./controllers/index";
import AuthController from "./controllers/auth";
import UsersController from "./controllers/users";
import StatusController from "./controllers/status";
import LogController from "./controllers/log";
import AccessoriesController from "./controllers/accessories";
import BridgeController from "./controllers/bridge";
import CacheController from "./controllers/cache";
import ConfigController from "./controllers/config";
import ExtentionsController from "./controllers/extentions";
import BridgesController from "./controllers/bridges";
import PluginController from "./controllers/plugin";
import PluginsController from "./controllers/plugins";
import RemoteController from "./controllers/remote";
import SystemController from "./controllers/system";
import ThemesController from "./controllers/themes";
import WeatherController from "./controllers/weather";

const BRIDGE_LAUNCH_DELAY = 1000;

export default class API extends EventEmitter {
    declare time: number;

    declare running: boolean;

    declare config: any;

    declare settings: any;

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

        State.app = Express();
        State.app.use(Compression());

        State.app?.use(CORS({
            origin: this.settings.origin || "*",
            credentials: false,
        }));

        this.listner = HTTP.createServer(State.app);

        this.terminator = createHttpTerminator({
            gracefulTerminationTimeout: 500,
            server: this.listner,
        });

        State.io = new IO.Server(this.listner, {
            cors: {
                origin: this.settings.origin || "*",
                credentials: false,
            },
        });

        const paths = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].plugins && existsSync(Path.join(<string>State.bridges[i].plugins, ".bin"))) {
                paths.push(Path.join(<string>State.bridges[i].plugins, ".bin"));
            }
        }

        this.enviornment = {
            PATH: `${process.env.PATH}:${paths.join(":")}`,
            USER: `${process.env.USER}`,
        };

        if (existsSync("/etc/ssl/certs/cacert.pem")) this.enviornment.SSL_CERT_FILE = "/etc/ssl/certs/cacert.pem";

        State.io?.on("connection", (socket: IO.Socket): void => {
            socket.on(Events.SHELL_CONNECT, () => {
                Console.debug("terminal connect");

                let shell: IPty;

                try {
                    shell = spawn(existsSync("/bin/bash") ? "/bin/bash" : process.env.SHELL || "sh", [], {
                        name: "xterm-color",
                        cwd: Paths.data(),
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

        State.app?.use(Express.json({ limit: "2gb" }));

        if (State.debug) {
            State.app?.use((request, _response, next) => {
                this.emit("request", request.method, request.url);

                next();
            });
        }

        State.app?.use(async (request, _response, next) => {
            request.user = Users.decodeToken(request.headers.authorization);

            next();
        });

        new IndexController();
        new AuthController();
        new UsersController();
        new StatusController();
        new LogController();
        new AccessoriesController();
        new BridgeController();
        new CacheController();
        new ConfigController();
        new ExtentionsController();
        new BridgesController();
        new PluginController();
        new PluginsController();
        new RemoteController();
        new SystemController();
        new ThemesController();
        new WeatherController();

        State.app?.use("/", Express.static(this.settings.gui_path || existsSync("/usr/lib/hoobs") ? "/usr/lib/hoobs" : Path.join(__dirname, "../static")));
        State.app?.use("/touch", Express.static(this.settings.touch_path || existsSync("/usr/lib/hoobs-touch") ? "/usr/lib/hoobs-touch" : Path.join(__dirname, "../static")));
        State.app?.use("/themes", Express.static(Paths.themes));

        State.app?.use("/backups", Express.static(Paths.backups, {
            setHeaders: (response, path) => {
                if (Path.extname(path) === ".bridge") response.set("content-disposition", `attachment; filename="${Path.basename(path).split("_")[0]}.bridge"`);
                if (Path.extname(path) === ".backup") response.set("content-disposition", "attachment; filename=\"hoobs.backup\"");
            },
        }));

        State.app?.get("*", (_request, response) => {
            response.sendFile(Path.resolve(Path.join(this.settings.gui_path || existsSync("/usr/lib/hoobs") ? "/usr/lib/hoobs" : Path.join(__dirname, "../static"), "index.html")));
        });
    }

    static createServer(port: number): API {
        const api = new API(port);

        api.on(Events.LISTENING, () => {
            Console.info(`hub is running on port ${port}`);
        });

        return api;
    }

    reload() {
        this.config = Config.configuration();
        this.settings = (this.config || {}).api || {};
    }

    launch(id: string, port: number, display?: string): void {
        const flags: string[] = [
            "bridge",
            "--mode", State.mode,
            "--bridge", id,
            "--port", `${port}`,
        ];

        if (State.debug) flags.push("--debug");
        if (State.verbose) flags.push("--verbose");
        if (State.container) flags.push("--container");
        if (!State.orphans) flags.push("--orphans");

        this.processes[id] = Process.spawn(Path.join(__dirname, "../../../bin/hoobsd"), flags).on("exit", () => {
            State.bridges = Bridges.list();

            if (State.bridges.findIndex((item) => item.id === id) >= 0) this.launch(id, port, display);
        });

        this.processes[id].stdout?.on("data", (data) => {
            const messages: string[] = data.toString().split("\n");

            for (let i = 0; i < messages.length; i += 1) {
                Console.log(LogLevel.DEBUG, {
                    level: LogLevel.DEBUG,
                    bridge: id,
                    display: display || id,
                    timestamp: new Date().getTime(),
                    message: messages[i].trim(),
                });
            }
        });

        this.processes[id].stderr?.on("data", (data) => {
            const messages: string[] = data.toString().split("\n");

            for (let i = 0; i < messages.length; i += 1) {
                Console.log(LogLevel.ERROR, {
                    level: LogLevel.ERROR,
                    bridge: id,
                    display: display || id,
                    timestamp: new Date().getTime(),
                    message: messages[i].trim(),
                });
            }
        });
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
            if (State.restoring) {
                resolve();

                return;
            }

            const waiters: Promise<void>[] = [];
            const current = Object.keys(this.processes);

            for (let i = 0; i < current.length; i += 1) {
                if (!State.bridges.find((item) => item.id === current[i])) {
                    waiters.push(this.teardown(current[i]));
                }
            }

            const directories = readdirSync(Paths.data()).filter((item) => item !== "hub" && item !== "backups" && lstatSync(Path.join(Paths.data(), item)).isDirectory());
            const remove = directories.filter((item) => State.bridges.filter((bridge) => bridge.type !== "hub").findIndex((bridge) => bridge.id === item) === -1);

            for (let i = 0; i < remove.length; i += 1) {
                removeSync(Path.join(Paths.data(), remove[i]));
            }

            const bridges = State.bridges.filter((item) => item.type !== "hub");

            for (let i = 0; i < bridges.length; i += 1) {
                if (!this.processes[bridges[i].id] || this.processes[bridges[i].id].killed) {
                    this.launch(bridges[i].id, bridges[i].port, bridges[i].display);
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
        this.socket.on(Events.NOTIFICATION, (data: any) => State.io?.sockets.emit(Events.NOTIFICATION, data));

        this.socket.on(Events.ACCESSORY_CHANGE, (data: any) => {
            const working = AccessoriesController.layout;
            const { accessory } = data.data;

            if (accessory && working.accessories[accessory.accessory_identifier]) {
                _.extend(accessory, working.accessories[accessory.accessory_identifier]);
            }

            data.data.accessory = accessory;
            State.io?.sockets.emit(Events.ACCESSORY_CHANGE, data);
        });

        this.socket.on(Events.RESTART, async (data: any) => {
            const bridge = State.bridges.find((item) => item.id === data);

            if (bridge) await this.teardown(bridge.id);
            if (bridge) this.launch(bridge.id, bridge.port, bridge.display);
        });

        this.socket.start();

        if (State.mode === "development") {
            Console.warn("running in development mode");
        }

        System.preload();

        this.listner?.listen(this.port, () => {
            this.time = new Date().getTime();
            this.running = true;

            this.emit(Events.LISTENING, this.port);
        });

        Monitor();

        setTimeout(() => {
            let bridges = State.bridges.filter((item) => item.type === "bridge");

            for (let i = 0; i < bridges.length; i += 1) {
                this.launch(bridges[i].id, bridges[i].port, bridges[i].display);
            }

            if (State.mode === "development") {
                bridges = State.bridges.filter((item) => item.type === "dev");

                for (let i = 0; i < bridges.length; i += 1) {
                    this.launch(bridges[i].id, bridges[i].port, bridges[i].display);
                }
            }
        }, BRIDGE_LAUNCH_DELAY);
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.running) {
                Console.debug("Shutting down");

                this.running = false;

                const bridges = State.bridges.filter((item) => item.type !== "hub");
                const waiters: Promise<void>[] = [];

                for (let i = 0; i < bridges.length; i += 1) {
                    waiters.push(this.teardown(bridges[i].id));
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
