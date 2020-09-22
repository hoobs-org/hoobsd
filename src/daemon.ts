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

import "source-map-support/register";

import HTTP from "http";
import Express from "express";
import Program from "commander";
import IO from "socket.io";
import { HAPStorage } from "hap-nodejs";
import { existsSync } from "fs-extra";
import Instance from "./shared/instance";
import Instances from "./shared/instances";
import Paths from "./shared/paths";
import Pipe from "./server/pipe";
import Server from "./server";
import Bridge from "./bridge";
import Heartbeat from "./server/heartbeat";
import Console from "./console";
import Monitor from "./console/monitor";
import { Log } from "./shared/logger";
import { sanitize } from "./shared/helpers";

export = function Daemon(): void {
    Program.version(Instance.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.command("start")
        .description("start a server instance")
        .option("-d, --debug", "turn on debug level logging")
        .option("-v, --verbose", "turn on verbose logging")
        .option("-i, --instance <name>", "set the instance name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .option("-o, --orphans", "keep cached accessories for orphaned plugins")
        .option("-c, --container", "run in a container")
        .action(async (command) => {
            const options = command;

            if (options.instance === "console") {
                options.instance = undefined;
            }

            Instance.id = sanitize(options.instance || "default");
            Instance.debug = options.debug;
            Instance.verbose = options.verbose;
            Instance.orphans = !options.orphans;
            Instance.container = options.container;
            Instance.manager = existsSync("/usr/local/bin/yarn") || existsSync("/usr/bin/yarn") ? "yarn" : "npm";

            HAPStorage.setCustomStoragePath(Paths.persistPath());

            Instance.socket = new Pipe(Instance.id);
            Instance.server = new Server();
            Instance.bridge = new Bridge(parseInt(options.port, 10) || undefined);

            Instance.server.on("request", (method, url) => {
                Log.debug(`"${method}" ${url}`);
            });

            Instance.bridge?.on("publishSetupUri", (uri) => {
                Log.debug(`Setup URI "${uri}"`);
            });

            Instance.bridge?.on("listening", () => {
                Log.message("bridge_start", Instance.id, {
                    time: new Date().getTime(),
                });
            });

            Instance.bridge?.on("shutdown", () => {
                Log.message("bridge_stop", Instance.id, {
                    time: new Date().getTime(),
                });
            });

            if ((Instance.server.config.server.autostart || 0) >= 0) {
                setTimeout(() => {
                    Instance.bridge?.start();
                }, (Instance.server.config.server.autostart || 0) * 1000);
            }

            Instance.socket.start();

            Heartbeat();
        });

    Program.command("console")
        .description("start the console service")
        .option("-d, --debug", "turn on debug level logging")
        .option("-v, --verbose", "turn on verbose logging")
        .option("-p, --port <port>", "change the port the console runs on")
        .option("-c, --container", "run in a container")
        .action((command) => {
            Instance.id = sanitize("console");
            Instance.display = "Console";
            Instance.debug = command.debug;
            Instance.verbose = command.verbose;
            Instance.container = command.container;
            Instance.app = Express();
            Instance.listner = HTTP.createServer(Instance.app);
            Instance.io = IO(Instance.listner);

            Instance.io.on("connection", (socket: IO.Socket) => {
                socket.on("log_history", () => {
                    socket.emit("log_cache", Log.cache());
                });
            });

            Instance.console = new Console(command.port);

            Instance.console.on("listening", (port) => {
                Log.info(`API is running on port ${port}`);
            });

            Instance.console.on("request", (method, url) => {
                Log.debug(`"${method}" ${url}`);
            });

            Instance.console.start();

            Monitor();
        });

    Program.command("service <action>")
        .description("manage server instances")
        .option("-d, --debug", "turn on debug level logging")
        .option("-i, --instance <name>", "set the instance name")
        .action((action, command) => {
            Instance.debug = command.debug;

            Instances.controlInstance(action, command.instance || "default").then((success) => {
                if (success) {
                    switch (action) {
                        case "start":
                            Log.info(`${command.instance || "Default"} instance started`);
                            break;

                        case "stop":
                            Log.info(`${command.instance || "Default"} instance stoped`);
                            break;

                        case "restart":
                            Log.info(`${command.instance || "Default"} instance restarted`);
                            break;

                        default:
                            console.log(Program.helpInformation());
                            break;
                    }
                } else {
                    Log.error("Unable to control service");
                }
            });
        });

    Program.parse(process.argv);

    const signals: { [key: string]: number } = {
        SIGINT: 2,
        SIGTERM: 15,
    };

    Object.keys(signals).forEach((signal) => {
        process.on(signal, async () => {
            if (Instance.terminating) {
                return;
            }

            Instance.terminating = true;

            Log.debug("");
            Log.debug("Shutting down");

            if (Instance.bridge) {
                await Instance.bridge.stop();
            }

            if (Instance.socket) {
                Instance.socket.stop();
            }

            Log.debug("Stopped");

            process.exit(128 + signals[signal]);
        });
    });

    process.on("uncaughtException", (error) => {
        Log.error(`${error.stack}`);

        if (!Instance.terminating) {
            process.kill(process.pid, "SIGTERM");
        }
    });

    process.on("unhandledRejection", (_reason, promise) => {
        promise.catch((error) => {
            Log.error(error.stack);
        });
    });
};