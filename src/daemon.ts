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

import Program from "commander";
import Watcher from "chokidar";
import { join } from "path";
import Instance from "./shared/instance";
import Instances from "./shared/instances";
import Users from "./shared/users";
import Server from "./server";
import Paths from "./shared/paths";
import API from "./api";
import { Console } from "./shared/logger";
import { sanitize } from "./shared/helpers";

export = function Daemon(): void {
    Program.version(Instance.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.command("start", { isDefault: true })
        .description("start a server instance")
        .option("-d, --debug", "turn on debug level logging")
        .option("-v, --verbose", "turn on verbose logging")
        .option("-i, --instance <name>", "set the instance name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .option("-o, --orphans", "keep cached accessories for orphaned plugins")
        .option("-c, --container", "run in a container")
        .action(async (command) => {
            Instance.id = sanitize(command.instance, "api");
            Instance.debug = command.debug;
            Instance.verbose = command.verbose;
            Instance.orphans = !command.orphans;
            Instance.container = command.container;

            Instance.instances = Instances.list();
            Instance.users = Users.list();

            const instance = Instance.instances.find((n) => n.id === Instance.id);

            if (instance) {
                Instance.server = new Server(command.port || instance.port);

                Watcher.watch(Paths.instancesPath()).on("change", () => {
                    Instance.instances = Instances.list();
                });

                Watcher.watch(join(Paths.storagePath(), "access.json")).on("change", () => {
                    Instance.users = Users.list();
                });

                Watcher.watch(Paths.configPath()).on("change", async () => {
                    await Instance.server?.stop();

                    Instance.server?.start();
                });

                Instance.server.start();
            } else {
                Console.error(`${Instance.id} is not created, please run 'hoobs instance create' to create`);
            }
        });

    Program.command("api")
        .description("start the api service")
        .option("-d, --debug", "turn on debug level logging")
        .option("-v, --verbose", "turn on verbose logging")
        .option("-p, --port <port>", "change the port the api runs on")
        .option("-c, --container", "run in a container")
        .action((command) => {
            Instance.id = sanitize("api");
            Instance.display = "API";
            Instance.debug = command.debug;
            Instance.verbose = command.verbose;
            Instance.container = command.container;

            Instance.instances = Instances.list();
            Instance.users = Users.list();

            const instance = Instance.instances.find((n) => n.id === Instance.id);

            if (instance) {
                Instance.api = API.createServer(command.port || instance.port);

                Watcher.watch(Paths.instancesPath()).on("change", () => {
                    Instance.instances = Instances.list();
                });

                Watcher.watch(join(Paths.storagePath(), "access.json")).on("change", () => {
                    Instance.users = Users.list();
                });

                Watcher.watch(Paths.configPath()).on("change", async () => {
                    await Instance.api?.stop();

                    Instance.api = API.createServer(command.port || instance.port);
                    Instance.api.start();
                });

                Instance.api.start();
            } else {
                Console.error(`${Instance.id} is not created, please run 'hoobs instance create' to create`);
            }
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
                            Console.info(`${command.instance || "Default"} instance started`);
                            break;

                        case "stop":
                            Console.info(`${command.instance || "Default"} instance stoped`);
                            break;

                        case "restart":
                            Console.info(`${command.instance || "Default"} instance restarted`);
                            break;

                        default:
                            console.log(Program.helpInformation());
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

            if (Instance.server) await Instance.server.stop();
            if (Instance.api) await Instance.api.stop();

            process.exit(128 + signals[signal]);
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
