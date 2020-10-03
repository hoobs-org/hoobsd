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

import { existsSync } from "fs-extra";
import { spawn } from "child_process";
import { join, dirname } from "path";

import {
    uuid,
    Bridge,
    Accessory,
    Service,
    Characteristic,
    AccessoryLoader,
} from "hap-nodejs";

import { Plugin } from "homebridge/lib/plugin";
import { PluginManager, PackageJSON } from "homebridge/lib/pluginManager";
import Instance from "./instance";
import Paths from "./paths";
import { Console, NotificationType } from "./logger";
import { loadPackage, loadSchema, loadJson } from "./formatters";

export default class Plugins {
    static get directory(): string {
        return join(Paths.storagePath(Instance.id), "node_modules");
    }

    static installed(instance?: string): Plugin[] {
        const results: Plugin[] = [];

        Plugins.load(instance || Instance.id, (_identifier, name, scope, directory, pjson) => {
            results.push(new Plugin(name, directory, pjson, scope));
        });

        return results;
    }

    static load(instance: string, callback: (identifier: string, name: string, scope: string, directory: string, pjson: PackageJSON, library: string) => void): void {
        if (existsSync(join(Paths.storagePath(instance), "package.json"))) {
            const plugins = Object.keys(loadJson<any>(join(Paths.storagePath(instance), "package.json"), {}).dependencies || {});

            for (let i = 0; i < plugins.length; i += 1) {
                const directory = join(Plugins.directory, plugins[i]);
                const pjson = loadPackage(directory);

                if (existsSync(directory) && pjson) {
                    const identifier: string = pjson.name;
                    const name: string = PluginManager.extractPluginName(identifier);
                    const scope: string = PluginManager.extractPluginScope(identifier);
                    const library: string = dirname(pjson.main || "./index.js");

                    callback(identifier, name, scope, directory, pjson, library);
                }
            }
        }
    }

    static install(name: string, version?: string): Promise<void> {
        const tag = version || "latest";

        return new Promise((resolve, reject) => {
            const flags = [];

            if (Instance.manager === "yarn") {
                flags.push("add");
                flags.push("--unsafe-perm");
                flags.push("--ignore-engines");
            } else {
                flags.push("install");
                flags.push("--unsafe-perm");
            }

            flags.push(`${name}@${tag}`);

            const proc = spawn(Instance.manager || "npm", flags, {
                cwd: Paths.storagePath(Instance.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", async () => {
                const path = join(Plugins.directory, name);

                if (existsSync(path) && existsSync(join(path, "package.json"))) {
                    const pjson = loadPackage(path);
                    const config = Paths.configuration();

                    config.plugins?.push(name);
                    config.plugins = [...new Set(config.plugins)];

                    if (config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name) === -1) {
                        let found = false;
                        let alias = "";

                        const details: any[] = await Plugins.getPluginType(name, path, pjson) || [];

                        for (let i = 0; i < details.length; i += 1) {
                            if (details[i].type === "platform") {
                                const index = config.platforms.findIndex((p: any) => p.platform === details[i].alias);

                                if (index >= 0) {
                                    config.platforms[index].plugin_map = {
                                        plugin_name: name,
                                    };

                                    found = true;
                                } else if (alias === "") {
                                    alias = details[i].alias;
                                }
                            }
                        }

                        if (!found && alias !== "") {
                            config.platforms.push({
                                platform: alias,
                                plugin_map: {
                                    plugin_name: name,
                                },
                            });
                        }
                    }

                    Paths.saveConfig(config);

                    Console.notify(
                        "plugin_install",
                        Instance.id,
                        "Plugin Installed",
                        `${tag !== "latest" ? `${PluginManager.extractPluginName(name)} ${tag}` : PluginManager.extractPluginName(name)} has been installed.`,
                        NotificationType.SUCCESS,
                        "extension",
                    );

                    return resolve();
                }

                Console.notify(
                    "plugin_install",
                    Instance.id,
                    "Plugin Not Installed",
                    `Unable to install ${PluginManager.extractPluginName(name)}.`,
                    NotificationType.ERROR,
                );

                return reject();
            });
        });
    }

    static uninstall(name: string) {
        return new Promise((resolve, reject) => {
            const flags = [];

            if (Instance.manager === "yarn") {
                flags.push("remove");
            } else {
                flags.push("uninstall");
            }

            flags.push(name);

            const proc = spawn(Instance.manager || "npm", flags, {
                cwd: Paths.storagePath(Instance.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", () => {
                if (!existsSync(join(Plugins.directory, name, "package.json"))) {
                    const config = Paths.configuration();
                    let index = config.plugins?.indexOf(name);

                    if (index! > -1) config.plugins?.splice(index!, 1);

                    index = config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name);

                    while (index >= 0) {
                        config.platforms.splice(index, 1);
                        index = config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name);
                    }

                    index = config.accessories.findIndex((a: any) => (a.plugin_map || {}).plugin_name === name);

                    while (index >= 0) {
                        config.accessories.splice(index, 1);
                        index = config.accessories.findIndex((a: any) => (a.plugin_map || {}).plugin_name === name);
                    }

                    Paths.saveConfig(config);

                    Console.notify(
                        "plugin_uninstall",
                        Instance.id,
                        "Plugin Uninstalled",
                        `${PluginManager.extractPluginName(name)} has been removed.`,
                        NotificationType.WARN,
                        "extension",
                    );

                    return resolve();
                }

                Console.notify(
                    "plugin_uninstall",
                    Instance.id,
                    "Plugin Not Uninstalled",
                    `Unable to uninstall ${PluginManager.extractPluginName(name)}.`,
                    NotificationType.ERROR,
                );

                return reject();
            });
        });
    }

    static upgrade(name?: string, version?: string) {
        const tag = version || "latest";

        return new Promise((resolve) => {
            const flags = [];

            if (Instance.manager === "yarn") {
                flags.push("upgrade");
                flags.push("--ignore-engines");
            } else {
                flags.push("update");
            }

            if (name) flags.push(`${name}@${tag}`);

            const proc = spawn(Instance.manager || "npm", flags, {
                cwd: Paths.storagePath(Instance.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", () => {
                Paths.touchConfig();

                Console.notify(
                    "plugin_upgrade",
                    Instance.id, name ? "Plugin Upgraded" : "Plugins Upgraded",
                    name ? `${tag !== "latest" ? `${PluginManager.extractPluginName(name)} ${tag}` : PluginManager.extractPluginName(name)} has been upgraded.` : "All plugins have been upgraded",
                    NotificationType.SUCCESS,
                    "extension",
                );

                return resolve();
            });
        });
    }

    static async getPluginType(name: string, path: string, pjson: any): Promise<any[]> {
        if (
            Instance.plugins[name]
         && Array.isArray(Instance.plugins[name])
         && Instance.plugins[name].length > 0
        ) {
            return Instance.plugins[name];
        }

        const registered: any[] = [];
        const schema = loadSchema(path);

        if (schema) {
            const alias = schema.plugin_alias || schema.pluginAlias || name;

            let type = "platform";

            if (schema.pluginType === "accessory") type = "accessory";

            const idx = registered.findIndex((p) => p.alias === alias && p.type === type);

            if (idx === -1) registered.push({ name, alias, type });
        } else {
            let main = ((pjson || {}).main || "") !== "" ? join(name, pjson.main) : name;

            if (main.toLowerCase() === "index.js") main = name;
            if (main.toLowerCase().endsWith("/index.js")) main = main.replace(/\/index.js/gi, "");
            if (main.toLowerCase().endsWith(".js")) main = main.replace(/.js/gi, "");

            try {
                const plugin = await import(join(Plugins.directory, main));

                const options = {
                    hap: {
                        uuid,
                        Bridge,
                        Accessory,
                        Service,
                        Characteristic,
                        AccessoryLoader,
                    },
                    platformAccessory: {},
                    version: 2.4,
                    serverVersion: Instance.version,

                    registerPlatform: (_p: string, a: string) => {
                        const idx = registered.findIndex((p) => p.alias === a && p.type === "platform");

                        if (idx === -1) registered.push({ name, alias: a, type: "platform" });
                    },

                    registerAccessory: (_p: string, a: string) => {
                        const idx = registered.findIndex((p) => p.alias === a && p.type === "accessory");

                        if (idx === -1) registered.push({ name, alias: a, type: "accessory" });
                    },

                    user: {
                        configPath() {
                            return Paths.configPath();
                        },

                        storagePath() {
                            return Paths.storagePath();
                        },
                    },
                };

                if (typeof plugin === "function") {
                    plugin(options);
                } else if (plugin && typeof plugin.default === "function") {
                    plugin.default(options);
                }
            } catch (error) {
                Console.error(`Unable to determine plugin type for "${name}"`);
                Console.error(error.stack);
            }

            delete require.cache[require.resolve(join(Plugins.directory, main))];
        }

        if (registered.length > 0) Instance.plugins[name] = registered;

        return registered;
    }

    static getPluginPackage(path: string): PackageJSON {
        const pjson: PackageJSON = loadPackage(path);

        if (!pjson) throw new Error(`Plugin ${path} does not contain a proper package.json.`);

        return pjson;
    }
}