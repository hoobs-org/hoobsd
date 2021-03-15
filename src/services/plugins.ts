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

import { join } from "path";
import { existsSync, readFileSync } from "fs-extra";

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
import State from "../state";
import Paths from "./paths";
import Config from "./config";
import System from "./system";
import { Console, NotificationType } from "./logger";

export default class Plugins {
    static get directory(): string {
        return join(Paths.data(State.id), "node_modules");
    }

    static installed(bridge?: string, development?: boolean): Plugin[] {
        return Plugins.load(bridge || State.id, development).map((item) => new Plugin(item.name, item.directory, item.pjson, item.scope));
    }

    static load(bridge: string, development?: boolean): { [key: string]: any }[] {
        const results: { [key: string]: any }[] = [];

        if (development) {
            const pjson = Plugins.loadPackage(State.project || "") || {};

            results.push({
                identifier: pjson.name,
                name: PluginManager.extractPluginName(pjson.name),
                scope: PluginManager.extractPluginScope(pjson.name),
                directory: State.project,
                pjson,
                library: pjson.main || "./index.js",
            });
        } else if (existsSync(join(Paths.data(bridge), "package.json"))) {
            const plugins = Object.keys(Paths.loadJson<any>(join(Paths.data(bridge), "package.json"), {}).dependencies || {});

            for (let i = 0; i < plugins.length; i += 1) {
                if (plugins[i] !== "hap-nodejs") {
                    const directory = join(Paths.data(bridge), "node_modules", plugins[i]);
                    const pjson = Plugins.loadPackage(directory);

                    if (existsSync(directory) && pjson) {
                        results.push({
                            identifier: pjson.name,
                            name: PluginManager.extractPluginName(pjson.name),
                            scope: PluginManager.extractPluginScope(pjson.name),
                            directory,
                            pjson,
                            library: pjson.main || "./index.js",
                        });
                    }
                }
            }
        }

        return results;
    }

    static async linkLibs(bridge?: string): Promise<void> {
        if (!existsSync(join(Paths.data(bridge), "node_modules", "hap-nodejs"))) {
            await System.execute(`${Paths.yarn} add --unsafe-perm --ignore-engines hap-nodejs`, { cwd: Paths.data(bridge) });
        }
    }

    static install(bridge: string, name: string, version?: string): Promise<void> {
        const tag = version || "latest";

        return new Promise((resolve, reject) => {
            System.execute(`${Paths.yarn} add --unsafe-perm --ignore-engines ${name}@${tag}`, { cwd: Paths.data(bridge) }).then(() => {
                const path = join(Paths.data(bridge), "node_modules", name);

                setTimeout(() => {
                    if (existsSync(path) && existsSync(join(path, "package.json"))) {
                        const pjson = Plugins.loadPackage(path);
                        const config = Config.configuration(bridge);

                        if (config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name) === -1) {
                            Plugins.getPluginType(bridge, name, path, pjson).then((details: any[]) => {
                                let found = false;
                                let alias = "";

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
                            }).finally(() => {
                                Config.saveConfig(config, bridge, true);

                                Console.notify(
                                    bridge,
                                    "Plugin Installed",
                                    `${tag !== "latest" ? `${PluginManager.extractPluginName(name)} ${tag}` : PluginManager.extractPluginName(name)} has been installed.`,
                                    NotificationType.SUCCESS,
                                    "puzzle",
                                );

                                resolve();
                            });
                        } else {
                            Config.saveConfig(config, bridge, true);

                            Console.notify(
                                bridge,
                                "Plugin Installed",
                                `${tag !== "latest" ? `${PluginManager.extractPluginName(name)} ${tag}` : PluginManager.extractPluginName(name)} has been installed.`,
                                NotificationType.SUCCESS,
                                "puzzle",
                            );

                            resolve();
                        }
                    } else {
                        Console.notify(
                            bridge,
                            "Plugin Not Installed",
                            `Unable to install ${PluginManager.extractPluginName(name)}.`,
                            NotificationType.ERROR,
                        );

                        reject();
                    }
                }, 2 * 1000);
            });
        });
    }

    static uninstall(bridge: string, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            System.execute(`${Paths.yarn} remove ${name}`, { cwd: Paths.data(bridge) }).then(() => {
                if (!existsSync(join(Paths.data(bridge), "node_modules", name, "package.json"))) {
                    const config = Config.configuration(bridge);

                    let index = config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name);

                    while (index >= 0) {
                        config.platforms.splice(index, 1);
                        index = config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name);
                    }

                    index = config.accessories.findIndex((a: any) => (a.plugin_map || {}).plugin_name === name);

                    while (index >= 0) {
                        config.accessories.splice(index, 1);
                        index = config.accessories.findIndex((a: any) => (a.plugin_map || {}).plugin_name === name);
                    }

                    Config.saveConfig(config, bridge);

                    Console.notify(
                        bridge,
                        "Plugin Uninstalled",
                        `${PluginManager.extractPluginName(name)} has been removed.`,
                        NotificationType.WARN,
                        "puzzle",
                    );

                    resolve();
                } else {
                    Console.notify(
                        bridge,
                        "Plugin Not Uninstalled",
                        `Unable to uninstall ${PluginManager.extractPluginName(name)}.`,
                        NotificationType.ERROR,
                    );

                    reject();
                }
            });
        });
    }

    static upgrade(bridge: string, name?: string, version?: string): Promise<void> {
        const tag = version || "latest";

        return new Promise((resolve) => {
            const flags = [];

            flags.push("upgrade");
            flags.push("--ignore-engines");

            if (name) flags.push(`${name}@${tag}`);

            System.execute(`${Paths.yarn} ${flags.join(" ")}`, { cwd: Paths.data(bridge) }).then(() => {
                Config.touchConfig(bridge);

                Console.notify(
                    State.id,
                    name ? "Plugin Upgraded" : "Plugins Upgraded",
                    name ? `${tag !== "latest" ? `${PluginManager.extractPluginName(name)} ${tag}` : PluginManager.extractPluginName(name)} has been upgraded.` : "All plugins have been upgraded",
                    NotificationType.SUCCESS,
                    "puzzle",
                );

                resolve();
            });
        });
    }

    static async getPluginType(bridge: string, name: string, path: string, pjson: any): Promise<any[]> {
        if (State.plugins[name] && Array.isArray(State.plugins[name]) && State.plugins[name].length > 0) return State.plugins[name];

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
                const plugin = await import(join(Paths.data(bridge), "node_modules", main));

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
                    serverVersion: State.version,

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
                            return Paths.config;
                        },

                        storagePath() {
                            return Paths.data();
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

            delete require.cache[require.resolve(join(Paths.data(bridge), "node_modules", main))];
        }

        if (registered.length > 0) State.plugins[name] = registered;

        return registered;
    }

    static getPluginPackage(path: string): PackageJSON {
        const pjson: PackageJSON = Plugins.loadPackage(path);

        if (!pjson) throw new Error(`Plugin ${path} does not contain a proper package.json.`);

        return pjson;
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
