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
import { BridgeRecord } from "../services/bridges";
import { Console, Events, NotificationType } from "../services/logger";

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
import SystemController from "./controllers/system";
import ThemesController from "./controllers/themes";
import WeatherController from "./controllers/weather";

const BRIDGE_LAUNCH_DELAY = 1 * 1000;
const BRIDGE_TEARDOWN_DELAY = 5 * 1000;

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
        new SystemController();
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
        const flags: string[] = [
            "bridge",
            "--mode", State.mode,
            "--bridge", bridge.id,
            "--port", `${bridge.port}`,
        ];

        if (State.debug) flags.push("--debug");
        if (State.verbose) flags.push("--verbose");
        if (State.container) flags.push("--container");
        if (!State.orphans) flags.push("--orphans");

        Console.info(`${bridge.display || bridge.id} starting`);

        this.processes[bridge.id] = Process.spawn(Path.join(__dirname, "../../../bin/hoobsd"), flags);

        this.processes[bridge.id].on("exit", () => {
            Console.notify(
                bridge.id,
                "Bridge Stopped",
                `${bridge.display || bridge.id} has stopped.`,
                NotificationType.ERROR,
            );
        });

        if (State.debug) {
            this.processes[bridge.id].stdout?.on("data", (data) => {
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
        }

        this.processes[bridge.id].stderr?.on("data", (data) => {
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

        Console.notify(
            typeof bridge === "string" ? bridge : bridge.id,
            "Bridge Started",
            `${typeof bridge === "string" ? bridge : bridge.display} has started.`,
            NotificationType.SUCCESS,
            "layers",
        );
    }

    teardown(bridge: BridgeRecord | string): Promise<void> {
        const id = typeof bridge === "string" ? bridge : bridge.id;

        return new Promise((resolve) => {
            if (this.processes[id] && !this.processes[id].killed) {
                Console.info(`${typeof bridge === "string" ? bridge : bridge.display} stopping`);

                this.processes[id].removeAllListeners("exit");

                this.processes[id].once("exit", () => {
                    setTimeout(() => {
                        Console.notify(
                            typeof bridge === "string" ? bridge : bridge.id,
                            "Bridge Stopped",
                            `${typeof bridge === "string" ? bridge : bridge.display} has stopped.`,
                            NotificationType.ERROR,
                        );

                        resolve();
                    }, BRIDGE_TEARDOWN_DELAY);
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
                    this.launch(bridges[i]);
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

        this.socket.on(Events.RESTART, async (data: string) => {
            await this.teardown(data);

            const bridge = State.bridges.find((item) => item.id === data);

            if (bridge) this.launch(bridge);
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
                this.launch(bridges[i]);
            }

            if (State.mode === "development") {
                bridges = State.bridges.filter((item) => item.type === "dev");

                for (let i = 0; i < bridges.length; i += 1) {
                    this.launch(bridges[i]);
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
                    waiters.push(this.teardown(bridges[i]));
                }

                Promise.all(waiters).then(() => {
                    this.socket.stop();

                    this.terminator.terminate().then(() => {
                        Console.debug("Stopped");
                        Console.save();

                        resolve();
                    });
                });
            } else {
                resolve();
            }
        });
    }
}
