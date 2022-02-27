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
import { Console } from "./services/logger";
import State from "./state";
import Bridges from "./services/bridges";
import Users from "./services/users";
import Bridge from "./bridge";
import Cache from "./services/cache";
import Paths from "./services/paths";
import System, { LedStatus } from "./services/system";
import Hub from "./hub";
import { jsonEquals, cloneJson } from "./services/json";
import { sanitize } from "./services/formatters";

process.setMaxListeners(0);

function teardown() {
    let waits: Promise<void>[] = [];

    if (State.terminating) return;

    State.terminating = true;

    for (let i = 0; i < State.watchers.length; i += 1) {
        waits.push(State.watchers[i].close());
    }

    if (State.cache && !State.restoring) State.cache.save(Paths.data(State.id));
    if (State.bridge) waits.push(State.bridge.stop());
    if (State.hub) waits.push(State.hub.stop());

    Promise.allSettled(waits).then(() => {
        waits = [];
        State.watchers = [];

        process.exit();
    });
}

export = function Daemon(): void {
    Program.version(State.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.option("-m, --mode <mode>", "set the enviornment", (mode: string) => { State.mode = mode; })
        .option("-d, --debug", "turn on debug level logging", () => { State.debug = true; })
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

            State.cache.load(Paths.data(State.id));

            const bridge = State.bridges.find((n) => n.id === State.id);

            if (bridge) {
                State.hub = Hub.createServer(command.port || bridge.port);

                State.watchers.push(Watcher.watch(Paths.bridges).on("change", () => {
                    if (!State.restoring) {
                        State.bridges = Bridges.list();

                        State.hub?.sync();
                    }
                }));

                State.watchers.push(Watcher.watch(join(Paths.data(), "access")).on("change", () => {
                    if (!State.restoring) State.users = Users.list();
                }));

                State.watchers.push(Watcher.watch(Paths.config).on("change", () => {
                    if (!State.restoring) State.hub?.reload();
                }));

                State.watchers.push(Watcher.watch(Paths.log).on("change", () => {
                    if (!State.terminating) Console.save();
                }));

                State.hub.start();
            } else {
                Console.error(`${State.id} is not created, please run 'sudo hbs install' to create`);
            }
        });

    Program.command("bridge")
        .description("start a bridge bridge")
        .option("-b, --bridge <name>", "set the bridge name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .action(async (command) => {
            State.enviornment = Enviornment.config({ path: join(__dirname, `.env.${State.mode || "production"}`) }).parsed;

            State.id = sanitize(command.bridge, "hub");
            State.bridges = Bridges.list();
            State.users = Users.list();
            State.cache = new Cache();

            State.cache.load(Paths.data(State.id));

            const bridge = State.bridges.find((n) => n.id === State.id);

            if (bridge) {
                if (bridge.type === "dev") {
                    State.project = bridge.project;
                    State.bridge = new Bridge(command.port || bridge.port, true);
                } else {
                    State.bridge = new Bridge(command.port || bridge.port);
                }

                State.watchers.push(Watcher.watch(Paths.bridges).on("change", () => {
                    const current = cloneJson(State.bridges.find((n: any) => n.id === State.id));

                    if (current) {
                        State.bridges = Bridges.list();

                        const modified = State.bridges.find((n: any) => n.id === State.id);

                        if (modified && !jsonEquals(current, modified)) {
                            Console.info("Bridge change");

                            State.bridge?.restart();
                        }
                    }
                }));

                State.watchers.push(Watcher.watch(Paths.config).on("change", () => {
                    Console.info("Configuration change");

                    if (!State.saving) State.bridge?.restart();

                    State.saving = false;
                }));

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

    process.on("exit", teardown);
    process.on("SIGINT", teardown);
    process.on("SIGTERM", teardown);
    process.on("SIGUSR1", teardown);
    process.on("SIGUSR2", teardown);

    process.on("uncaughtException", (error) => {
        Console.error(`${error.stack}`);
        teardown();
        System.status(LedStatus.ERROR);
    });

    process.on("unhandledRejection", (reason) => {
        Console.warn(`unhandled rejection: ${reason}`);
    });
};
