/**************************************************************************************************
 * hoobs-server                                                                                   *
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

import Program from "commander";
import { join } from "path";
import { execSync, spawn } from "child_process";
import { LogLevel } from "homebridge/lib/logger";

import {
    existsSync,
    copyFileSync,
    writeFileSync,
    unlinkSync,
} from "fs-extra";

import Paths from "./services/paths";
import Instance from "./services/instance";
import Instances from "./services/instances";
import Config from "./services/config";
import Cockpit from "./api/cockpit";
import Plugins from "./services/plugins";
import Ffmpeg from "./features/ffmpeg";
import { Console } from "./services/logger";
import { sanitize, loadJson, formatJson } from "./services/formatters";

export = function Command(): void {
    Program.version(Instance.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.command("plugin [action] [name]")
        .description("manage plugins for a given instance")
        .option("-i, --instance <name>", "set the instance name")
        .option("-c, --container", "run in a container")
        .action((action, name, command) => {
            Instance.id = sanitize(command.instance);
            Instance.debug = true;
            Instance.timestamps = false;
            Instance.container = command.container;
            Instance.instances = Instances.list();

            let plugin = name;
            let plugins = [];
            let scope = "";
            let tag = "latest";

            switch (action) {
                case "add":
                    if (command.instance && command.instance !== "" && Instance.id !== "api" && plugin) {
                        if (plugin.startsWith("@")) {
                            plugin = plugin.substring(1);
                            scope = plugin.split("/").shift();
                            plugin = plugin.split("/").pop();
                        }

                        if (plugin.indexOf("@") >= 0) {
                            tag = plugin.split("@").pop();
                            plugin = plugin.split("@").shift();
                        }

                        Plugins.install(scope && scope !== "" ? `@${scope}/${plugin}` : plugin, tag).finally(() => {
                            plugins = Plugins.installed();

                            if (plugins.length > 0) {
                                console.table(plugins.map((item) => ({
                                    name: item.getPluginIdentifier(),
                                    version: item.version,
                                    path: item.getPluginPath(),
                                })));
                            }
                        });
                    } else {
                        console.warn("please define a valid instance");
                    }

                    break;

                case "remove":
                    if (command.instance && command.instance !== "" && Instance.id !== "api" && plugin) {
                        if (plugin.startsWith("@")) {
                            plugin = plugin.substring(1);
                            scope = plugin.split("/").shift();
                            plugin = plugin.split("/").pop();
                        }

                        if (plugin.indexOf("@") >= 0) {
                            plugin = plugin.split("@").shift();
                        }

                        Plugins.uninstall(scope && scope !== "" ? `@${scope}/${plugin}` : plugin).finally(() => {
                            plugins = Plugins.installed();

                            if (plugins.length > 0) {
                                console.table(plugins.map((item) => ({
                                    name: item.getPluginIdentifier(),
                                    version: item.version,
                                    path: item.getPluginPath(),
                                })));
                            }
                        });
                    } else {
                        console.warn("please define a valid instance");
                    }

                    break;

                case "upgrade":
                    if (command.instance && command.instance !== "" && Instance.id !== "api" && plugin) {
                        if (plugin.startsWith("@")) {
                            plugin = plugin.substring(1);
                            scope = plugin.split("/").shift();
                            plugin = plugin.split("/").pop();
                        }

                        if (plugin.indexOf("@") >= 0) {
                            tag = plugin.split("@").pop();
                            plugin = plugin.split("@").shift();
                        }

                        Plugins.upgrade(scope && scope !== "" ? `@${scope}/${plugin}` : plugin, tag).finally(() => {
                            plugins = Plugins.installed();

                            if (plugins.length > 0) {
                                console.table(plugins.map((item) => ({
                                    name: item.getPluginIdentifier(),
                                    version: item.version,
                                    path: item.getPluginPath(),
                                })));
                            }
                        });
                    } else if (command.instance && command.instance !== "" && Instance.id !== "api") {
                        Plugins.upgrade().finally(() => {
                            plugins = Plugins.installed();

                            if (plugins.length > 0) {
                                console.table(plugins.map((item) => ({
                                    name: item.getPluginIdentifier(),
                                    version: item.version,
                                    path: item.getPluginPath(),
                                })));
                            }
                        });
                    } else {
                        console.warn("please define a valid instance");
                    }

                    break;

                case "list":
                    if (command.instance && command.instance !== "" && Instance.id !== "api") {
                        plugins = Plugins.installed();

                        if (plugins.length > 0) {
                            console.table(plugins.map((item) => ({
                                name: item.getPluginIdentifier(),
                                version: item.version,
                                path: item.getPluginPath(),
                            })));
                        } else {
                            console.warn("no plugins installed");
                        }
                    } else {
                        console.warn("please define a valid instance");
                    }

                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }
        });

    Program.command("log")
        .description("show the combined log from the api and instances")
        .option("-i, --instance <name>", "set the instance name")
        .option("-t, --tail", "set the number of lines")
        .option("-d, --debug", "turn on debug level logging")
        .option("-c, --container", "run in a container")
        .action((command) => {
            Instance.id = "api";
            Instance.debug = command.debug;
            Instance.container = command.container;
            Instance.instances = Instances.list();

            Console.load();

            let instance: string;

            if (command.instance) {
                instance = sanitize(command.instance);
            }

            const messages = Console.cache(parseInt(command.tail, 10) || 500, instance!);

            for (let i = 0; i < messages.length; i += 1) {
                if (messages[i].message && messages[i].message !== "") {
                    Console.log(LogLevel.INFO, messages[i]);
                }
            }
        });

    Program.command("config")
        .description("manage the configuration for a given instance")
        .option("-i, --instance <name>", "set the instance name")
        .option("-c, --container", "run in a container")
        .action((command) => {
            Instance.id = sanitize(command.instance || "api");
            Instance.debug = true;
            Instance.timestamps = false;
            Instance.container = command.container;

            writeFileSync(join(Paths.storagePath(), `${Instance.id}.config.json`), formatJson(Config.configuration()));

            spawn("nano", [join(Paths.storagePath(), `${Instance.id}.config.json`)], {
                stdio: "inherit",
                detached: true,
            }).on("data", (data) => {
                process.stdout.pipe(data);
            }).on("close", () => {
                Config.saveConfig(loadJson<any>(join(Paths.storagePath(), `${Instance.id}.config.json`), {}));

                unlinkSync(join(Paths.storagePath(), `${Instance.id}.config.json`));
            });
        });

    Program.command("instance [action]")
        .description("manage server instances")
        .option("-i, --instance <name>", "set the instance name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .option("-s, --skip", "skip init system intergration")
        .option("-c, --container", "run in a container")
        .action((action, command) => {
            Instance.debug = true;
            Instance.timestamps = false;
            Instance.container = command.container;
            Instance.instances = Instances.list();

            let instances = [];

            switch (action) {
                case "create":
                    Instances.createService(command.instance, parseInt(command.port, 10), command.skip).then((success) => {
                        if (success) {
                            instances = Instances.list();

                            if (instances.length > 0) console.table(instances);
                        }
                    });

                    break;

                case "remove":
                    Instances.removeService(command.instance).then((success) => {
                        if (success) {
                            instances = Instances.list();

                            if (instances.length > 0) console.table(instances);
                        }
                    });

                    break;

                case "list":
                    instances = Instances.list();

                    if (instances.length > 0) {
                        console.table(instances);
                    } else {
                        console.warn("no instances");
                    }

                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }
        });

    Program.command("enable [feature]")
        .description("enable additional server features")
        .option("-c, --container", "run in a container")
        .action((feature, command) => {
            Instance.debug = true;
            Instance.timestamps = false;
            Instance.container = command.container;
            Instance.instances = Instances.list();

            let results: { [key: string]: any } = {};

            switch (feature) {
                case "ffmpeg":
                    results = Ffmpeg.enable();
                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }

            if (results.error) console.log(results.error);

            console.table([{
                feature: "ffmpeg",
                description: "enables ffmpeg camera support",
                enabled: Paths.tryCommand("ffmpeg"),
            }]);
        });

    Program.command("disable [feature]")
        .description("disables additional server features")
        .option("-c, --container", "run in a container")
        .action((feature, command) => {
            Instance.debug = true;
            Instance.timestamps = false;
            Instance.container = command.container;
            Instance.instances = Instances.list();

            let results: { [key: string]: any } = {};

            switch (feature) {
                case "ffmpeg":
                    results = Ffmpeg.disable();
                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }

            if (results.error) console.log(results.error);

            console.table([{
                feature: "ffmpeg",
                description: "enables ffmpeg camera support",
                enabled: Paths.tryCommand("ffmpeg"),
            }]);
        });

    Program.command("system <action> [file]")
        .description("reboot, reset and upgrade this device")
        .option("-c, --container", "run in a container")
        .action((action, file, command) => {
            Instance.id = "api";
            Instance.debug = true;
            Instance.timestamps = false;
            Instance.container = command.container;
            Instance.instances = Instances.list();

            switch (action) {
                case "upgrade":
                    execSync("npm install -g --unsafe-perm @hoobs/hoobsd@latest");
                    break;

                case "backup":
                    Instances.backup().then((filename) => {
                        copyFileSync(
                            join(Paths.backupPath(), filename),
                            join(process.cwd(), filename),
                        );

                        console.log("backup complete");
                    }).catch((error) => {
                        console.warn(error.message || "unable to create backup");
                    });

                    break;

                case "restore":
                    if (file && existsSync(file)) {
                        Instances.restore(file).finally(() => console.log("restore complete"));
                    } else {
                        console.warn("invalid restore file");
                    }

                    break;

                case "clean":
                    Instances.clean();

                    console.log("bridge caches cleaned");

                    break;

                case "reset":
                    Instances.reset();

                    console.log("configuration and plugins removed");

                    break;

                case "sockets":
                    try {
                        execSync(`lsof | grep '${Paths.storagePath()}'`, {
                            stdio: "inherit",
                        });
                    } catch (_error) {
                        console.warn("no sockets started");
                    }

                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }
        });

    Program.command("remote")
        .description("start a remote support session")
        .action(() => {
            Instance.debug = true;
            Instance.timestamps = false;
            Instance.id = "api";
            Instance.instances = Instances.list();

            const client = new Cockpit();

            client.start(true).then((registration) => {
                console.log(`access code ${registration}`);
            }).catch(() => {
                console.warn("unable to connect");
            });
        });

    Program.parse(process.argv);
};
