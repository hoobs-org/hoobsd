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
import * as Enviornment from "dotenv";

import Program from "commander";
import Watcher from "chokidar";
import { join } from "path";
import { existsSync } from "fs-extra";
import State from "./state";
import Bridges from "./services/bridges";
import Users from "./services/users";
import Bridge from "./bridge";
import Cache from "./services/cache";
import Paths from "./services/paths";
import System from "./services/system";
import Hub from "./hub";
import { Console } from "./services/logger";
import { sanitize, cloneJson, jsonEquals } from "./services/formatters";

const PROCESS_KILL_DELAY = 1000;

if (System.shellSync("cat /proc/1/cgroup | grep 'docker\\|lxc'") !== "") {
    State.container = true;
}

export = function Daemon(): void {
    Program.version(State.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.option("-m, --mode <mode>", "set the enviornment", (mode: string) => { State.mode = mode; })
        .option("-d, --debug", "turn on debug level logging", () => { State.debug = true; })
        .option("--container", "run in a container", () => { State.container = true; })
        .option("--orphans", "keep cached accessories for orphaned plugins", () => { State.orphans = false; })
        .option("--verbose", "turn on verbose logging", () => { State.verbose = true; });

    Program.command("hub", { isDefault: true })
        .description("start the hub service")
        .option("-p, --port <port>", "change the port the hub runs on")
        .action((command) => {
            State.enviornment = Enviornment.config({ path: join(__dirname, `.env.${State.mode || "production"}`) }).parsed;

            State.id = sanitize("hub");
            State.display = "Hub";

            Console.load();

            State.bridges = Bridges.list();
            State.users = Users.list();
            State.cache = new Cache();
            State.cache.load(Paths.storagePath(State.id));

            const bridge = State.bridges.find((n) => n.id === State.id);

            if (bridge) {
                State.hub = Hub.createServer(command.port || bridge.port);

                Watcher.watch(Paths.bridgesPath()).on("change", () => {
                    State.bridges = Bridges.list();
                    State.hub?.sync();
                });

                Watcher.watch(join(Paths.storagePath(), "access")).on("change", () => {
                    State.users = Users.list();
                });

                Watcher.watch(Paths.configPath()).on("change", () => {
                    State.hub?.stop().then(() => {
                        State.hub = Hub.createServer(command.port || bridge.port);
                        State.hub.start();
                    });
                });

                State.hub.start();
            } else {
                Console.error(`${State.id} is not created, please run 'sudo hbs install' to create`);
            }
        });

    Program.command("bridge")
        .description("start a bridge bridge")
        .option("-i, --bridge <name>", "set the bridge name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .action(async (command) => {
            State.enviornment = Enviornment.config({ path: join(__dirname, `.env.${State.mode || "production"}`) }).parsed;

            State.id = sanitize(command.bridge, "hub");
            State.bridges = Bridges.list();
            State.users = Users.list();
            State.cache = new Cache();
            State.cache.load(Paths.storagePath(State.id));

            const bridge = State.bridges.find((n) => n.id === State.id);

            if (bridge) {
                State.bridge = new Bridge(command.port || bridge.port);

                Watcher.watch(Paths.bridgesPath()).on("change", () => {
                    const current = cloneJson(State.bridges.find((n: any) => n.id === State.id));

                    if (current) {
                        State.bridges = Bridges.list();

                        const modified = State.bridges.find((n: any) => n.id === State.id);

                        if (modified && !jsonEquals(current, modified)) {
                            State.bridge?.stop().then(() => {
                                State.bridge?.start();
                            });
                        }
                    }
                });

                Watcher.watch(Paths.configPath()).on("change", () => {
                    State.bridge?.stop().then(() => {
                        if (existsSync(Paths.configPath())) State.bridge?.start();
                    });
                });

                State.bridge.start();
            } else {
                Console.error(`${State.id} is not created, please run 'sudo hoobs bridge add' to create`);
            }
        });

    Program.command("service <action>")
        .description("manage server bridges")
        .option("-i, --bridge <name>", "set the bridge name")
        .action((action, command) => {
            State.enviornment = Enviornment.config({ path: join(__dirname, `.env.${State.mode || "production"}`) }).parsed;

            State.id = sanitize(command.bridge);

            Bridges.manage(action).then((success) => {
                if (success) {
                    switch (action) {
                        case "start":
                            Console.info("hoobsd started");
                            break;

                        case "stop":
                            Console.info("hoobsd stoped");
                            break;

                        case "restart":
                            Console.info("hoobsd restarted");
                            break;

                        default:
                            Console.info(Program.helpInformation());
                            break;
                    }
                } else {
                    Console.error("Unable to control service");
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
            if (State.terminating) return;

            State.terminating = true;

            if (State.cache) State.cache.save(Paths.storagePath(State.id), ["hap/accessories"]);
            if (State.bridge) await State.bridge.stop();
            if (State.hub) await State.hub.stop();

            setTimeout(() => {
                process.exit();
            }, PROCESS_KILL_DELAY);
        });
    });

    process.on("uncaughtException", (error) => {
        Console.error(`${error.stack}`);

        if (!State.terminating) process.kill(process.pid, "SIGTERM");
    });

    process.on("unhandledRejection", (reason) => {
        if ((`${reason}`).trim() !== "TypeError: Invalid Version:") Console.debug(`unhandled rejection: ${reason}`);
    });
};
