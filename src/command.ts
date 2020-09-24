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
import { existsSync, copyFileSync } from "fs-extra";
import { join } from "path";
import { execSync, spawn } from "child_process";
import Paths from "./shared/paths";
import Instance from "./shared/instance";
import Instances from "./shared/instances";
import Cockpit from "./api/cockpit";
import Plugins from "./shared/plugins";
import Ffmpeg from "./features/ffmpeg";

import { sanitize, findCommand } from "./shared/helpers";

export = function Command(): void {
    Program.version(Instance.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.command("plugin [action] [name]")
        .description("manage plugins for a given instance")
        .option("-i, --instance <name>", "set the instance name")
        .action((action, name, command) => {
            const options = command;

            if (options.instance === "api") {
                options.instance = null;
            }

            Instance.id = sanitize(options.instance || "default");
            Instance.debug = true;
            Instance.manager = existsSync("/usr/local/bin/yarn") || existsSync("/usr/bin/yarn") ? "yarn" : "npm";

            let plugin = name;
            let plugins = [];
            let scope = "";
            let tag = "latest";

            switch (action) {
                case "add":
                    if (plugin) {
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
                    }

                    break;

                case "remove":
                    if (plugin) {
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
                    }

                    break;

                case "upgrade":
                    if (plugin) {
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
                    } else {
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
                    }

                    break;

                default:
                    plugins = Plugins.installed();

                    if (plugins.length > 0) {
                        console.table(plugins.map((item) => ({
                            name: item.getPluginIdentifier(),
                            version: item.version,
                            path: item.getPluginPath(),
                        })));
                    } else {
                        console.log("no plugins installed");
                    }

                    break;
            }
        });

    Program.command("config")
        .description("manage the configuration for a given instance")
        .option("-i, --instance <name>", "set the instance name")
        .action((command) => {
            Instance.id = sanitize(command.instance || "api");
            Instance.debug = true;

            spawn("nano", [Paths.configPath()], {
                stdio: "inherit",
                detached: true,
            }).on("data", (data) => {
                process.stdout.pipe(data);
            });
        });

    Program.command("instance [action]")
        .description("manage server instances")
        .option("-i, --instance <name>", "set the instance name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .action((action, command) => {
            Instance.debug = true;

            let instances = [];

            switch (action) {
                case "create":
                    Instances.createService(
                        command.instance,
                        parseInt(command.port, 10),
                    ).then((success) => {
                        if (success) {
                            instances = Instances.list();

                            if (instances.length > 0) {
                                console.table(instances);
                            }
                        }
                    });

                    break;

                case "remove":
                    Instances.removeService(command.instance).then((success) => {
                        if (success) {
                            instances = Instances.list();

                            if (instances.length > 0) {
                                console.table(instances);
                            }
                        }
                    });

                    break;

                default:
                    instances = Instances.list();

                    if (instances.length > 0) {
                        console.table(instances);
                    } else {
                        console.log("no instances");
                    }

                    break;
            }
        });

    Program.command("enable [feature]")
        .description("enable additional server features")
        .action((feature) => {
            Instance.debug = true;

            let results: { [key: string]: any } = {};

            switch (feature) {
                case "ffmpeg":
                    results = Ffmpeg.enable();
                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }

            if (results.error) {
                console.log(results.error);
            }

            console.table([{
                feature: "ffmpeg",
                description: "enables ffmpeg camera support",
                enabled: findCommand("ffmpeg"),
            }]);
        });

    Program.command("disable [feature]")
        .description("disables additional server features")
        .action((feature) => {
            Instance.debug = true;

            let results: { [key: string]: any } = {};

            switch (feature) {
                case "ffmpeg":
                    results = Ffmpeg.disable();
                    break;

                default:
                    console.log(Program.helpInformation());
                    break;
            }

            if (results.error) {
                console.log(results.error);
            }

            console.table([{
                feature: "ffmpeg",
                description: "enables ffmpeg camera support",
                enabled: findCommand("ffmpeg"),
            }]);
        });

    Program.command("system <action> [file]")
        .description("reboot, reset and upgrade this device")
        .option("-i, --instance <name>", "set the instance name")
        .action((action, file, command) => {
            const options = command;

            if (options.instance === "api") {
                options.instance = null;
            }

            Instance.id = sanitize(options.instance || "default");
            Instance.debug = true;

            switch (action) {
                case "upgrade":
                    execSync("npm install -g --unsafe-perm @hoobs/server@latest");
                    break;

                case "backup":
                    Paths.backup().then((filename) => {
                        copyFileSync(
                            join(Paths.backupPath(), filename),
                            join(process.cwd(), filename),
                        );

                        console.log("backup complete");
                    }).catch((error) => {
                        console.log(error.message || "unable to create backup");
                    });

                    break;

                case "restore":
                    if (file && existsSync(file)) {
                        Paths.restore(file).finally(() => {
                            console.log("restore complete");
                        });
                    } else {
                        console.log("invalid restore file");
                    }

                    break;

                case "clean":
                    Paths.clean();

                    console.log("bridge caches cleaned");

                    break;

                case "reset":
                    Paths.reset();

                    console.log("configuration and plugins removed");

                    break;

                default:
                    console.log("unsupported");
                    break;
            }
        });

    Program.command("remote")
        .description("start a remote support session")
        .action(() => {
            Instance.debug = true;
            Instance.id = sanitize("api");

            const client = new Cockpit();

            client.start(true).then((registration) => {
                console.log(`access code ${registration}`);
            }).catch(() => {
                console.log("unable to connect");
            });
        });

    Program.parse(process.argv);
};
