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

import Instance from "./services/instance";
import Instances from "./services/instances";
import Users from "./services/users";
import Server from "./server";
import Cache from "./services/cache";
import Paths from "./services/paths";
import API from "./api";
import { Console } from "./services/logger";
import { sanitize, cloneJson, jsonEquals } from "./services/formatters";

const runtime: string = (process.version || "").replace(/v/gi, "");

export = function Daemon(): void {
    Program.version(`${Instance.version}${runtime !== "" ? ` (runtime ${runtime})` : ""}`, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.option("-m, --mode <mode>", "set the enviornment", (mode: string) => { Instance.mode = mode; })
        .option("-d, --debug", "turn on debug level logging", () => { Instance.debug = true; })
        .option("--container", "run in a container", () => { Instance.container = true; })
        .option("--orphans", "keep cached accessories for orphaned plugins", () => { Instance.orphans = false; })
        .option("--verbose", "turn on verbose logging", () => { Instance.verbose = true; });

    Program.command("start", { isDefault: true })
        .description("start the api service")
        .option("-p, --port <port>", "change the port the api runs on")
        .action((command) => {
            Instance.enviornment = Enviornment.config({ path: join(__dirname, `../var/.env.${Instance.mode || "production"}`) }).parsed;

            Instance.id = sanitize("api");
            Instance.display = "API";

            Console.load();

            Instance.instances = Instances.list();
            Instance.users = Users.list();
            Instance.cache = new Cache();
            Instance.cache.load(join(Paths.storagePath(Instance.id), "cache"));

            const instance = Instance.instances.find((n) => n.id === Instance.id);

            if (instance) {
                Instance.api = API.createServer(command.port || instance.port);

                Watcher.watch(Paths.instancesPath()).on("change", () => {
                    Instance.instances = Instances.list();
                    Instance.api?.sync();
                });

                Watcher.watch(join(Paths.storagePath(), "access")).on("change", () => {
                    Instance.users = Users.list();
                });

                Watcher.watch(Paths.configPath()).on("change", () => {
                    Instance.api?.stop().then(() => {
                        Instance.api = API.createServer(command.port || instance.port);
                        Instance.api.start();
                    });
                });

                Instance.api.start();
            } else {
                Console.error(`${Instance.id} is not created, please run 'sudo hoobs initilize' to create`);
            }
        });

    Program.command("instance")
        .description("start a bridge instance")
        .option("-i, --instance <name>", "set the instance name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .action(async (command) => {
            Instance.enviornment = Enviornment.config({ path: join(__dirname, `../.env.${Instance.mode || "production"}`) }).parsed;

            Instance.id = sanitize(command.instance, "api");
            Instance.instances = Instances.list();
            Instance.users = Users.list();
            Instance.cache = new Cache();
            Instance.cache.load(join(Paths.storagePath(Instance.id), "cache"));

            const instance = Instance.instances.find((n) => n.id === Instance.id);

            if (instance) {
                Instance.server = new Server(command.port || instance.port);

                Watcher.watch(Paths.instancesPath()).on("change", () => {
                    const current = cloneJson(Instance.instances.find((n: any) => n.id === Instance.id));

                    if (current) {
                        Instance.instances = Instances.list();

                        const modified = Instance.instances.find((n: any) => n.id === Instance.id);

                        if (modified && !jsonEquals(current, modified)) {
                            Instance.server?.stop().then(() => {
                                Instance.server?.start();
                            });
                        }
                    }
                });

                Watcher.watch(Paths.configPath()).on("change", () => {
                    Instance.server?.stop().then(() => {
                        Instance.server?.start();
                    });
                });

                Instance.server.start();
            } else {
                Console.error(`${Instance.id} is not created, please run 'sudo hoobs instance add' to create`);
            }
        });

    Program.command("service <action>")
        .description("manage server instances")
        .option("-i, --instance <name>", "set the instance name")
        .action((action, command) => {
            Instance.enviornment = Enviornment.config({ path: join(__dirname, `../.env.${Instance.mode || "production"}`) }).parsed;

            Instance.id = sanitize(command.instance);

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
            if (Instance.terminating) return;

            Instance.terminating = true;

            if (Instance.cache) Instance.cache.save(join(Paths.storagePath(Instance.id), "cache"), ["hap/accessories"]);
            if (Instance.server) await Instance.server.stop();
            if (Instance.api) await Instance.api.stop();

            process.exit();
        });
    });

    process.on("uncaughtException", (error) => {
        Console.error(`${error.stack}`);

        if (!Instance.terminating) process.kill(process.pid, "SIGTERM");
    });

    process.on("unhandledRejection", (_reason, promise) => {
        promise.catch((error) => {
            Console.error(error.stack);
        });
    });
};
