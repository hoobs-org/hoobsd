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
import CORS from "cors";
import EIOWS from "eiows";
import Process from "child_process";
import Path from "path";
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
import System, { ProcessQuery, LedStatus } from "../services/system";
import State from "../state";
import Users from "../services/users";
import IPC from "./services/ipc";
import Socket from "./services/socket";
import Monitor from "./services/monitor";
import Pipe from "../services/pipe";
import Bridges, { BridgeRecord, BridgeProcess } from "../services/bridges";
import { Console, Events, NotificationType } from "../services/logger";
import { cloneJson, compressJson } from "../services/json";

import IndexController from "./controllers/index";
import AuthController from "./controllers/auth";
import UsersController from "./controllers/users";
import StatusController from "./controllers/status";
import LogController from "./controllers/log";
import AccessoriesController from "./controllers/accessories";
import BridgeController from "./controllers/bridge";
import CacheController from "./controllers/cache";
import ConfigController from "./controllers/config";
import BridgesController from "./controllers/bridges";
import PluginController from "./controllers/plugin";
import PluginsController from "./controllers/plugins";
import SystemController from "./controllers/system";
import NetworkController from "./controllers/network";
import ThemesController from "./controllers/themes";
import WeatherController from "./controllers/weather";

const BRIDGE_LAUNCH_DELAY = 1 * 1000;
const BRIDGE_TEARDOWN_DELAY = 3 * 1000;
const BRIDGE_RELAUNCH_DELAY = 7 * 1000;

export default class API extends EventEmitter {
    declare time: number;

    declare running: boolean;

    declare config: any;

    declare settings: any;

    declare readonly port: number;

    declare private enviornment: { [key: string]: string };

    declare private bridges: { [key: string]: BridgeProcess };

    declare private listner: HTTP.Server;

    declare private terminator: HttpTerminator;

    declare private tasks: NodeJS.Timeout | undefined;

    constructor(port: number | undefined) {
        super();

        this.time = 0;
        this.config = Config.configuration();
        this.settings = (this.config || {}).api || {};
        this.port = port || 80;
        this.bridges = {};

        State.app = Express();
        State.app.disable("x-powered-by");

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
            wsEngine: EIOWS.Server,
            perMessageDeflate: { threshold: false },
            cors: {
                origin: this.settings.origin || "*",
                credentials: false,
            },
        });

        State.ipc = new IPC(this.bridges);

        State.ipc.on(Events.LOG, (data: any) => Console.log(LogLevel.INFO, data));
        State.ipc.on(Events.NOTIFICATION, (data: any) => State.io?.sockets.emit(Events.NOTIFICATION, compressJson(data)));

        State.ipc.on(Events.ACCESSORY_CHANGE, (data: any) => {
            const working = AccessoriesController.layout;
            const { accessory } = data.data;

            if (accessory && working.accessories[accessory.accessory_identifier]) {
                _.extend(accessory, working.accessories[accessory.accessory_identifier]);
            }

            data.data.accessory = accessory;
            State.io?.sockets.emit(Events.ACCESSORY_CHANGE, compressJson(data));
        });

        State.ipc.on(Events.RESTART, async (data: string) => {
            await this.teardown(data);

            const bridge = State.bridges.find((item) => item.id === data);

            if (bridge) this.launch(bridge);
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
        new BridgesController();
        new PluginController();
        new PluginsController();
        new SystemController();
        new NetworkController();
        new ThemesController();
        new WeatherController();

        State.app?.use("/", Express.static(existsSync(this.settings.gui_path || "/usr/lib/hoobs") ? this.settings.gui_path || "/usr/lib/hoobs" : Path.join(__dirname, "../static")));
        State.app?.use("/touch", Express.static(existsSync(this.settings.touch_path || "/usr/lib/hoobs-touch") ? this.settings.touch_path || "/usr/lib/hoobs-touch" : Path.join(__dirname, "../static")));
        State.app?.use("/themes", Express.static(Paths.themes));

        State.app?.use("/backups", Express.static(Paths.backups, {
            setHeaders: (response, path) => {
                if (Path.extname(path) === ".bridge") response.set("content-disposition", `attachment; filename="${Path.basename(path).split("_")[0]}.bridge"`);
                if (Path.extname(path) === ".backup") response.set("content-disposition", "attachment; filename=\"hoobs.backup\"");
            },
        }));

        State.app?.get("*", (_request, response) => {
            response.sendFile(Path.resolve(Path.join(existsSync(this.settings.gui_path || "/usr/lib/hoobs") ? this.settings.gui_path || "/usr/lib/hoobs" : Path.join(__dirname, "../static"), "index.html")));
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

    launch(bridge: BridgeRecord): void {
        const hoobsd = State.mode === "development" ? Path.join(Path.resolve(Paths.application), "debug") : Path.join(__dirname, "../../../bin/hoobsd");

        const flags: string[] = [
            "bridge",
            "--mode", State.mode,
            "--bridge", bridge.id,
            "--port", `${bridge.port}`,
        ];

        if (State.debug || bridge.debugging) flags.push("--debug");
        if (State.verbose) flags.push("--verbose");
        if (!State.orphans) flags.push("--orphans");

        let waits: Promise<void>[] = [];
        const keys = Object.keys(this.bridges).filter((item) => item !== bridge.id && this.bridges[item].port === bridge.port && Bridges.running(this.bridges[item].process.pid));

        for (let i = 0; i < keys.length; i += 1) {
            waits.push(this.teardown(keys[i]));
        }

        waits.push(this.teardown(bridge.id));

        Promise.allSettled(waits).then(() => {
            waits = [];

            Console.info(`${bridge.display || bridge.id} starting`);
            Bridges.kill(bridge);

            const forked = Process.fork(hoobsd, flags, { env: cloneJson(process.env), silent: true });

            this.bridges[bridge.id] = {
                bridge,
                port: bridge.port,
                process: forked,
                socket: new Socket(<IPC>State.ipc, forked),
            };

            const stdout = new Pipe((data) => {
                const messages: string[] = data.toString().split("\n");

                for (let i = 0; i < messages.length; i += 1) {
                    Console.log(LogLevel.DEBUG, {
                        level: LogLevel.DEBUG,
                        bridge: bridge.id,
                        display: bridge.display || bridge.id,
                        timestamp: new Date().getTime(),
                        message: messages[i].trim(),
                    });
                }
            });

            const stderr = new Pipe((data) => {
                const messages: string[] = data.toString().split("\n");

                for (let i = 0; i < messages.length; i += 1) {
                    Console.log(LogLevel.ERROR, {
                        level: LogLevel.ERROR,
                        bridge: bridge.id,
                        display: bridge.display || bridge.id,
                        timestamp: new Date().getTime(),
                        message: messages[i].trim(),
                    });
                }
            });

            this.bridges[bridge.id].process.removeAllListeners("exit");

            this.bridges[bridge.id].process.once("exit", () => {
                Console.notify(
                    bridge.id,
                    "Bridge Stopped",
                    `${bridge.display || bridge.id} has stopped.`,
                    NotificationType.ERROR,
                );
            });

            setTimeout(() => {
                if (Bridges.running(this.bridges[bridge.id].process.pid)) {
                    this.bridges[bridge.id].process.once("exit", () => {
                        setTimeout(() => this.launch(bridge), BRIDGE_RELAUNCH_DELAY);
                    });
                }
            }, BRIDGE_LAUNCH_DELAY * 2);

            this.bridges[bridge.id].process.stdout?.pipe(stdout);
            this.bridges[bridge.id].process.stderr?.pipe(stderr);

            Console.notify(
                bridge.id,
                "Bridge Started",
                `${bridge.display || bridge.id} has started.`,
                NotificationType.SUCCESS,
                "layers",
            );
        });
    }

    teardown(bridge: BridgeRecord | string): Promise<void> {
        const id = typeof bridge === "string" ? bridge : bridge.id;

        return new Promise((resolve) => {
            if (this.bridges[id] && Bridges.running(this.bridges[id].process.pid)) {
                Console.info(`${typeof bridge === "string" ? bridge : bridge.display} stopping`);

                let display = "";

                if (typeof bridge === "string") {
                    display = (State.bridges.find((item) => item.id === bridge) || {}).display || bridge;
                } else {
                    display = bridge.display;
                }

                const handler = () => {
                    setTimeout(() => {
                        Console.notify(
                            typeof bridge === "string" ? bridge : bridge.id,
                            "Bridge Stopped",
                            `${display} has stopped.`,
                            NotificationType.ERROR,
                        );

                        resolve();
                    }, BRIDGE_TEARDOWN_DELAY);
                };

                this.bridges[id].process.removeAllListeners("exit");
                this.bridges[id].process.on("exit", handler);
                this.bridges[id].process.on("SIGINT", handler);
                this.bridges[id].process.on("SIGTERM", handler);
                this.bridges[id].process.on("SIGUSR1", handler);
                this.bridges[id].process.on("SIGUSR2", handler);

                this.bridges[id].process.kill("SIGINT");
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

            let waits: Promise<void>[] = [];
            const current = Object.keys(this.bridges);

            for (let i = 0; i < current.length; i += 1) {
                if (!State.bridges.find((item) => item.id === current[i])) {
                    waits.push(this.teardown(current[i]));
                }
            }

            const directories = readdirSync(Paths.data()).filter((item) => {
                if (item === "hub") return false;
                if (item === "backups") return false;
                if (item === "access") return false;

                if (item === "bridges.conf") return false;
                if (item === "layout.conf") return false;
                if (item === "hoobs.log") return false;
                if (item === "hub.log") return false;

                if (item.indexOf(".accessories") >= 0) return false;
                if (item.indexOf(".persist") >= 0) return false;
                if (item.indexOf(".conf") >= 0) return false;

                return lstatSync(Path.join(Paths.data(), item)).isDirectory();
            });

            const bridges = State.bridges.filter((item) => item.type !== "hub");
            const remove = directories.filter((item) => bridges.findIndex((bridge) => bridge.id === item) === -1);

            for (let i = 0; i < remove.length; i += 1) {
                removeSync(Path.join(Paths.data(), remove[i]));
                removeSync(Path.join(Paths.data(), `${remove[i]}.accessories`));
                removeSync(Path.join(Paths.data(), `${remove[i]}.persist`));
                removeSync(Path.join(Paths.data(), `${remove[i]}.conf`));
            }

            for (let i = 0; i < bridges.length; i += 1) {
                if (!this.bridges[bridges[i].id] || !Bridges.running(this.bridges[bridges[i].id].process.pid)) {
                    this.launch(bridges[i]);
                }
            }

            Promise.allSettled(waits).then(() => {
                waits = [];

                resolve();
            });
        });
    }

    start(): void {
        if (State.mode === "development") Console.warn("running in development mode");

        System.kill(ProcessQuery.PORT, this.port);

        this.listner?.listen(this.port, () => {
            this.time = new Date().getTime();
            this.running = true;

            this.emit(Events.LISTENING, this.port);

            setTimeout(() => {
                const bridges = State.bridges.filter((item) => item.type === "bridge" || item.type === "dev");

                for (let i = 0; i < bridges.length; i += 1) {
                    this.launch(bridges[i]);
                }

                Monitor();
                System.led(LedStatus.GOOD);
            }, BRIDGE_LAUNCH_DELAY);
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.running) {
                Console.debug("Shutting down");

                if (this.tasks) clearInterval(this.tasks);

                this.running = false;
                this.tasks = undefined;

                const bridges = State.bridges.filter((item) => item.type !== "hub");
                let waits: Promise<void>[] = [];

                for (let i = 0; i < bridges.length; i += 1) {
                    waits.push(this.teardown(bridges[i]));
                }

                Promise.allSettled(waits).then(() => {
                    waits = [];

                    const keys = Object.keys(this.bridges);

                    for (let i = 0; i < keys.length; i += 1) {
                        this.bridges[keys[i]].process.removeAllListeners("exit");
                        this.bridges[keys[i]].process.kill("SIGINT");
                    }

                    this.terminator.terminate().then(() => {
                        Console.debug("Stopped");
                        Console.save();

                        System.led(LedStatus.STOPPED);

                        resolve();
                    });
                });
            } else {
                resolve();
            }
        });
    }
}
