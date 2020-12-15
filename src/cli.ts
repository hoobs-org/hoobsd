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

import State from "./state";
import Instances from "./services/instances";
import Users from "./services/users";
import Server from "./server";
import Cache from "./services/cache";
import Paths from "./services/paths";
import API from "./api";
import { Console } from "./services/logger";
import { sanitize, cloneJson, jsonEquals } from "./services/formatters";

export = function Daemon(): void {
    Program.version(State.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.option("-m, --mode <mode>", "set the enviornment", (mode: string) => { State.mode = mode; })
        .option("-d, --debug", "turn on debug level logging", () => { State.debug = true; })
        .option("--container", "run in a container", () => { State.container = true; })
        .option("--orphans", "keep cached accessories for orphaned plugins", () => { State.orphans = false; })
        .option("--verbose", "turn on verbose logging", () => { State.verbose = true; });

    Program.command("start", { isDefault: true })
        .description("start the api service")
        .option("-p, --port <port>", "change the port the api runs on")
        .action((command) => {
            State.enviornment = Enviornment.config({ path: join(__dirname, `.env.${State.mode || "production"}`) }).parsed;

            State.id = sanitize("api");
            State.display = "API";

            Console.load();

            State.instances = Instances.list();
            State.users = Users.list();
            State.cache = new Cache();
            State.cache.load(join(Paths.storagePath(State.id), "cache"));

            const instance = State.instances.find((n) => n.id === State.id);

            if (instance) {
                State.api = API.createServer(command.port || instance.port);

                Watcher.watch(Paths.instancesPath()).on("change", () => {
                    State.instances = Instances.list();
                    State.api?.sync();
                });

                Watcher.watch(join(Paths.storagePath(), "access")).on("change", () => {
                    State.users = Users.list();
                });

                Watcher.watch(Paths.configPath()).on("change", () => {
                    State.api?.stop().then(() => {
                        State.api = API.createServer(command.port || instance.port);
                        State.api.start();
                    });
                });

                State.api.start();
            } else {
                Console.error(`${State.id} is not created, please run 'sudo hoobs initilize' to create`);
            }
        });

    Program.command("instance")
        .description("start a bridge instance")
        .option("-i, --instance <name>", "set the instance name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .action(async (command) => {
            State.enviornment = Enviornment.config({ path: join(__dirname, `.env.${State.mode || "production"}`) }).parsed;

            State.id = sanitize(command.instance, "api");
            State.instances = Instances.list();
            State.users = Users.list();
            State.cache = new Cache();
            State.cache.load(join(Paths.storagePath(State.id), "cache"));

            const instance = State.instances.find((n) => n.id === State.id);

            if (instance) {
                State.server = new Server(command.port || instance.port);

                Watcher.watch(Paths.instancesPath()).on("change", () => {
                    const current = cloneJson(State.instances.find((n: any) => n.id === State.id));

                    if (current) {
                        State.instances = Instances.list();

                        const modified = State.instances.find((n: any) => n.id === State.id);

                        if (modified && !jsonEquals(current, modified)) {
                            State.server?.stop().then(() => {
                                State.server?.start();
                            });
                        }
                    }
                });

                Watcher.watch(Paths.configPath()).on("change", () => {
                    State.server?.stop().then(() => {
                        State.server?.start();
                    });
                });

                State.server.start();
            } else {
                Console.error(`${State.id} is not created, please run 'sudo hoobs instance add' to create`);
            }
        });

    Program.command("service <action>")
        .description("manage server instances")
        .option("-i, --instance <name>", "set the instance name")
        .action((action, command) => {
            State.enviornment = Enviornment.config({ path: join(__dirname, `.env.${State.mode || "production"}`) }).parsed;

            State.id = sanitize(command.instance);

            Instances.controlInstance(action).then((success) => {
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

            if (State.cache) State.cache.save(join(Paths.storagePath(State.id), "cache"), ["hap/accessories"]);
            if (State.server) await State.server.stop();
            if (State.api) await State.api.stop();

            process.exit();
        });
    });

    process.on("uncaughtException", (error) => {
        Console.error(`${error.stack}`);

        if (!State.terminating) process.kill(process.pid, "SIGTERM");
    });

    process.on("unhandledRejection", (_reason, promise) => {
        promise.catch((error) => {
            Console.error(error.stack);
        });
    });
};
