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

import { spawn, execSync } from "child_process";
import { join } from "path";

import {
    existsSync,
    readFileSync,
    realpathSync,
    unlinkSync,
    removeSync,
    ensureSymlinkSync,
} from "fs-extra";

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
import Config from "./config";
import { Console, NotificationType } from "./logger";
import { loadJson } from "./formatters";

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
                const pjson = Plugins.loadPackage(directory);

                if (existsSync(directory) && pjson) {
                    const identifier: string = pjson.name;
                    const name: string = PluginManager.extractPluginName(identifier);
                    const scope: string = PluginManager.extractPluginScope(identifier);
                    const library: string = pjson.main || "./index.js";

                    callback(identifier, name, scope, directory, pjson, library);
                }
            }
        }
    }

    static linkLibs() {
        ensureSymlinkSync(join(Paths.applicationPath(), "node_modules", "hap-nodejs"), join(Paths.storagePath(Instance.id), "node_modules", "hap-nodejs"));
    }

    static unlinkLibs() {
        if (existsSync(join(Paths.storagePath(Instance.id), "node_modules", "hap-nodejs"))) {
            try {
                unlinkSync(join(Paths.storagePath(Instance.id), "node_modules", "hap-nodejs"));
            } catch (_error) {
                removeSync(join(Paths.storagePath(Instance.id), "node_modules", "hap-nodejs"));
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

            Plugins.unlinkLibs();

            const proc = spawn(Instance.manager || "npm", flags, {
                cwd: Paths.storagePath(Instance.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", async () => {
                Plugins.linkLibs();

                const path = join(Plugins.directory, name);

                if (existsSync(path) && existsSync(join(path, "package.json"))) {
                    const pjson = Plugins.loadPackage(path);
                    const config = Config.configuration();

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

                    Config.saveConfig(config);

                    Console.notify(
                        Instance.id,
                        "Plugin Installed",
                        `${tag !== "latest" ? `${PluginManager.extractPluginName(name)} ${tag}` : PluginManager.extractPluginName(name)} has been installed.`,
                        NotificationType.SUCCESS,
                        "extension",
                    );

                    return resolve();
                }

                Console.notify(
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

            Plugins.unlinkLibs();

            const proc = spawn(Instance.manager || "npm", flags, {
                cwd: Paths.storagePath(Instance.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", () => {
                Plugins.linkLibs();

                if (!existsSync(join(Plugins.directory, name, "package.json"))) {
                    const config = Config.configuration();
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

                    Config.saveConfig(config);

                    Console.notify(
                        Instance.id,
                        "Plugin Uninstalled",
                        `${PluginManager.extractPluginName(name)} has been removed.`,
                        NotificationType.WARN,
                        "extension",
                    );

                    return resolve();
                }

                Console.notify(
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

            Plugins.unlinkLibs();

            const proc = spawn(Instance.manager || "npm", flags, {
                cwd: Paths.storagePath(Instance.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", () => {
                Plugins.linkLibs();
                Config.touchConfig();

                Console.notify(
                    Instance.id,
                    name ? "Plugin Upgraded" : "Plugins Upgraded",
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
        const schema = Plugins.loadSchema(path);

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
        const pjson: PackageJSON = Plugins.loadPackage(path);

        if (!pjson) throw new Error(`Plugin ${path} does not contain a proper package.json.`);

        return pjson;
    }

    static verifyModule(path: string, name: string): string | undefined {
        if (existsSync(path) && existsSync(join(path, "package.json"))) {
            try {
                if (JSON.parse(readFileSync(join(path, "package.json")).toString())?.name === name) return path;
            } catch (_error) {
                return undefined;
            }
        }

        return undefined;
    }

    static findModule(name: string): string | undefined {
        let path: string | undefined;
        let prefix: string | undefined;

        if (process.platform === "linux" || process.platform === "darwin") {
            prefix = undefined;

            try {
                prefix = (`${execSync("npm config get prefix") || ""}`).trim();
            } catch (error) {
                prefix = undefined;
            }

            if (prefix && prefix !== "") path = Plugins.verifyModule(join(join(prefix, "lib", "node_modules"), name), name);

            if (!path) {
                prefix = undefined;

                try {
                    prefix = (`${execSync("yarn global dir")}`).trim();
                } catch (error) {
                    prefix = undefined;
                }

                if (prefix && prefix !== "") path = Plugins.verifyModule(join(join(prefix, "node_modules"), name), name);
            }

            if (path) {
                try {
                    path = realpathSync(path);
                } catch (_error) {
                    return undefined;
                }
            }
        }

        return path;
    }

    static loadPackage(directory: string): any {
        const filename: string = join(directory, "package.json");

        let results: any;

        if (existsSync(filename)) {
            try {
                results = JSON.parse(readFileSync(filename).toString());
            } catch (error) {
                Console.error(`Plugin ${filename} contains an invalid package`);
                Console.error(error.stack);
            }
        }

        return results;
    }

    static loadSchema(directory: string): any {
        const filename = join(directory, "config.schema.json");

        let results: any;

        if (existsSync(filename)) {
            try {
                results = JSON.parse(readFileSync(filename).toString());
            } catch (error) {
                Console.error(`Plugin ${filename} contains an invalid config schema`);
                Console.error(error.stack);
            }
        }

        return results;
    }
}
