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

import Axios from "axios";
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
import Request from "../request";
import State from "../state";
import Paths from "./paths";
import Config from "./config";
import System from "./system";
import { BridgeRecord } from "./bridges";
import { Console, NotificationType } from "./logger";

const REQUEST_TIMEOUT = 15 * 1000;

export default class Plugins {
    static get directory(): string {
        return join(Paths.data(State.id), "node_modules");
    }

    static installed(bridge?: string, development?: boolean): Plugin[] {
        return Plugins.load(bridge || State.id, development).map((item) => new Plugin(item.name, item.directory, item.pjson, item.scope));
    }

    static load(bridge: string, development?: boolean): { [key: string]: any }[] {
        const key = `plugin/installed:${bridge}:${development ? "development" : "production"}`;
        const cached = State.cache?.get<{ [key: string]: any }[]>(key);

        if (cached) return cached;

        const results: { [key: string]: any }[] = [];
        const record = development ? State.bridges.find((item) => item.id === bridge) : undefined;

        if (development && record) {
            const pjson = Plugins.loadPackage(record.project || "") || {};

            results.push({
                identifier: pjson.name,
                name: PluginManager.extractPluginName(pjson.name),
                scope: PluginManager.extractPluginScope(pjson.name),
                directory: record.project,
                pjson,
                library: pjson.main || "./index.js",
            });
        } else if (existsSync(join(Paths.data(bridge), "package.json"))) {
            const plugins = Object.keys(Paths.loadJson<any>(join(Paths.data(bridge), "package.json"), {}).dependencies || {});

            for (let i = 0; i < plugins.length; i += 1) {
                if (plugins[i] !== "hap-nodejs") {
                    const directory = join(Paths.data(bridge), "node_modules", plugins[i]);
                    const pjson = Plugins.loadPackage(directory);
                    const keywords: string[] = (pjson || {}).keywords || [];

                    if (existsSync(directory) && pjson && (keywords.indexOf("homebridge-plugin") >= 0 || keywords.indexOf("hoobs-plugin") >= 0)) {
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

        return State.cache?.set(key, results, 720);
    }

    static async linkLibs(bridge?: string): Promise<void> {
        if (!existsSync(join(Paths.data(bridge), "node_modules", "hap-nodejs"))) {
            await System.execute(`${Paths.yarn} add --unsafe-perm --ignore-engines hap-nodejs`, { cwd: Paths.data(bridge) });
        }
    }

    static install(bridge: string, name: string, version?: string): Promise<void> {
        const tag = version || "latest";

        return new Promise((resolve, reject) => {
            Plugins.definition(name).then((definition) => {
                const identifiers = [];

                identifiers.push(`${name}@${tag}`);

                if ((definition || {}).sidecar) {
                    identifiers.push(definition?.sidecar);
                }

                System.execute(`${Paths.yarn} add --unsafe-perm --ignore-engines ${identifiers.join(" ")}`, { cwd: Paths.data(bridge) }).then(() => {
                    const path = join(Paths.data(bridge), "node_modules", name);

                    if ((definition || {}).sidecar) {
                        const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(bridge), "sidecars.json"), {});

                        sidecars[name] = definition?.sidecar;

                        Paths.saveJson(join(Paths.data(bridge), "sidecars.json"), sidecars, true);
                    }

                    State.cache?.remove(`plugin/installed:${bridge}:development`);
                    State.cache?.remove(`plugin/installed:${bridge}:production`);

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
        });
    }

    static uninstall(bridge: string, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            Plugins.definition(name).then((definition) => {
                const identifiers = [];

                identifiers.push(name);

                if ((definition || {}).sidecar) {
                    identifiers.push(definition?.sidecar);
                }

                System.execute(`${Paths.yarn} remove ${identifiers.join(" ")}`, { cwd: Paths.data(bridge) }).then(() => {
                    if (!existsSync(join(Paths.data(bridge), "node_modules", name, "package.json"))) {
                        if ((definition || {}).sidecar) {
                            const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(bridge), "sidecars.json"), {});

                            delete sidecars[name];

                            Paths.saveJson(join(Paths.data(bridge), "sidecars.json"), sidecars, true);
                        }

                        State.cache?.remove(`plugin/installed:${bridge}:development`);
                        State.cache?.remove(`plugin/installed:${bridge}:production`);

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
        });
    }

    static upgrade(bridge: string, name?: string, version?: string): Promise<void> {
        const tag = version || "latest";

        return new Promise((resolve) => {
            if (name) {
                const flags: string[] = [];

                flags.push("add");
                flags.push("--unsafe-perm");
                flags.push("--ignore-engines");
                flags.push(`${name}@${tag}`);

                Plugins.definition(name).then((definition) => {
                    if ((definition || {}).sidecar) {
                        flags.push(definition?.sidecar);
                    }

                    System.execute(`${Paths.yarn} ${flags.join(" ")}`, { cwd: Paths.data(bridge) }).then(() => {
                        if ((definition || {}).sidecar) {
                            const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(bridge), "sidecars.json"), {});

                            sidecars[name] = definition?.sidecar;

                            Paths.saveJson(join(Paths.data(bridge), "sidecars.json"), sidecars, true);
                        }

                        State.cache?.remove(`plugin/installed:${bridge}:development`);
                        State.cache?.remove(`plugin/installed:${bridge}:production`);

                        Config.touchConfig(bridge);

                        Console.notify(
                            State.id,
                            "Plugin Upgraded",
                            `${tag !== "latest" ? `${PluginManager.extractPluginName(name)} ${tag}` : PluginManager.extractPluginName(name)} has been upgraded.`,
                            NotificationType.SUCCESS,
                            "puzzle",
                        );

                        resolve();
                    });
                });
            } else {
                System.execute(`${Paths.yarn} upgrade --ignore-engines --network-timeout 100000`, { cwd: Paths.data(bridge) }).then(() => {
                    Config.touchConfig(bridge);

                    Console.notify(
                        State.id,
                        "Plugins Upgraded",
                        "All plugins have been upgraded",
                        NotificationType.SUCCESS,
                        "puzzle",
                    );

                    resolve();
                });
            }
        });
    }

    static async getPluginType(bridge: string, name: string, path: string, pjson: any): Promise<any[]> {
        const key = `plugin/interrogation:${name}`;
        const cached = State.cache?.get<any[]>(key);

        if (cached) return cached;

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
            } catch (error: any) {
                Console.error(`Unable to determine plugin type for "${name}"`);
                Console.error(error.stack);
            }

            delete require.cache[require.resolve(join(Paths.data(bridge), "node_modules", main))];
        }

        if (registered.length > 0) State.cache?.set(key, registered, 720);

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
            } catch (error: any) {
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
            } catch (error: any) {
                Console.error(`Plugin ${filename} contains an invalid config schema`);
                Console.error(error.stack);
            }
        }

        return results;
    }

    static development(bridge: BridgeRecord | undefined, identifier: string): { [key: string]: any } {
        if (bridge && existsSync(join(bridge?.project || "", "config.schema.json"))) {
            const raw: { [key: string]: any } = Paths.loadJson(join(bridge?.project || "", "config.schema.json"), {});

            return {
                schema: {
                    name: identifier,
                    alias: raw.alias || raw.pluginAlias || identifier,
                    accessory: raw.pluginType === "accessory",
                    config: {
                        type: "object",
                        properties: (raw.schema || raw.config).properties || raw.config || raw.schema || {},
                    },
                },
            };
        }

        return {
            schema: {},
        };
    }

    static schema(bridge: BridgeRecord | undefined, identifier: string): { [key: string]: any } {
        const key = `plugin/schema:${identifier}`;
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        if (bridge && existsSync(join(Paths.data(bridge.id), "node_modules", identifier, "config.schema.json"))) {
            const raw: { [key: string]: any } = Paths.loadJson(join(Paths.data(bridge.id), "node_modules", identifier, "config.schema.json"), {});

            return {
                schema: {
                    name: identifier,
                    alias: raw.alias || raw.pluginAlias || identifier,
                    accessory: raw.pluginType === "accessory",
                    config: {
                        type: "object",
                        properties: (raw.schema || raw.config).properties || raw.config || raw.schema || {},
                    },
                },
            };
        }

        return {
            schema: {},
        };
    }

    static async schemas(identifiers: string[]): Promise<{ [key: string]: any }> {
        const results: { [key: string]: any } = await Plugins.definitions(identifiers) || {};
        const uncached: string[] = [];

        for (let i = 0; i < identifiers.length; i += 1) {
            const key = `plugin/schema:${identifiers[i]}`;
            const cached = State.cache?.get<{ [key: string]: any }>(key);

            if (!results[identifiers[i]]) results[identifiers[i]] = {};

            if (cached && cached.schema && Object.keys(cached.schema).length > 0) {
                results[identifiers[i]].schema = cached.schema;
            } else if (results[identifiers[i]].definition) {
                uncached.push(identifiers[i]);
            }
        }

        if (uncached.length > 0) {
            let response: { [key: string]: any } = {};
            const source = Axios.CancelToken.source();

            setTimeout(() => source.cancel(), REQUEST_TIMEOUT);

            try {
                response = (<{ [key: string]: any }>(await Request({
                    method: "get",
                    url: `https://plugins.hoobs.org/api/list/schemas?identifier=${uncached.map((item) => encodeURIComponent(item)).join(",")}`,
                    timeout: REQUEST_TIMEOUT,
                    cancelToken: source.token,
                })).data || {}).results;
            } catch (_error) {
                Console.warn("plugin site unavailable");
            }

            if (response) {
                const items = Object.keys(response);

                for (let i = 0; i < items.length; i += 1) {
                    if (!results[items[i]]) results[items[i]] = {};

                    results[items[i]].schema = response[items[i]];

                    State.cache?.set(`plugin/schema:${items[i]}`, results[items[i]], 720);
                }
            }
        }

        return results;
    }

    static async definitions(identifiers: string[]): Promise<{ [key: string]: any } | undefined> {
        const results: { [key: string]: any } = {};
        const uncached: string[] = [];

        for (let i = 0; i < identifiers.length; i += 1) {
            const key = `plugin/definition:${identifiers[i]}`;
            const cached = State.cache?.get<{ [key: string]: any }>(key);

            if (cached) {
                if (!results[identifiers[i]]) results[identifiers[i]] = {};

                results[identifiers[i]].definition = cached;
            } else {
                uncached.push(identifiers[i]);
            }
        }

        if (uncached.length > 0) {
            let response: { [key: string]: any } = {};
            const source = Axios.CancelToken.source();

            setTimeout(() => source.cancel(), REQUEST_TIMEOUT);

            try {
                response = (<{ [key: string]: any }>(await Request({
                    method: "get",
                    url: `https://plugins.hoobs.org/api/list/plugins?identifier=${uncached.map((item) => encodeURIComponent(item)).join(",")}`,
                    timeout: REQUEST_TIMEOUT,
                    cancelToken: source.token,
                })).data || {}).results;
            } catch (_error) {
                Console.warn("plugin site unavailable");
            }

            if (response) {
                const items = Object.keys(response);

                for (let i = 0; i < items.length; i += 1) {
                    if (!results[items[i]]) results[items[i]] = {};

                    results[items[i]].definition = response[items[i]];

                    State.cache?.set(`plugin/definition:${items[i]}`, response[items[i]], 720);
                }
            }
        }

        return results;
    }

    static async definition(identifier: string): Promise<{ [key: string]: any } | undefined> {
        return (((await Plugins.definitions([identifier])) || {})[identifier] || {}).definition;
    }
}
