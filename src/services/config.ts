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

import _ from "lodash";
import { HomebridgeConfig } from "homebridge/lib/bridgeService";
import { join } from "path";
import { existsSync, writeFileSync } from "fs-extra";
import State from "../state";
import { BridgeRecord } from "./bridges";
import Paths from "./paths";

import {
    loadJson,
    formatJson,
    jsonEquals,
} from "./formatters";

export default class Config {
    declare readonly name: string;

    declare readonly display: string;

    declare private config: any;

    constructor(name: string) {
        this.config = Config.configuration();

        const platform = this.config.platforms.find((p: any) => (p.plugin_map || {}).plugin_name === name);
        const accessory = this.config.accessories.find((p: any) => (p.plugin_map || {}).plugin_name === name);

        this.name = name;
        this.display = platform?.name || accessory?.name || name;
    }

    static generateUsername(): string {
        let value = "";

        for (let i = 0; i < 6; i += 1) {
            if (value !== "") value += ":";

            const hex = `00${Math.floor(Math.random() * 255).toString(16).toUpperCase()}`;

            value += hex.substring(hex.length - 2, hex.length);
        }

        return value;
    }

    static configuration(): HomebridgeConfig {
        let pjson = {
            name: "plugins",
            description: "HOOBS Plugins",
            dependencies: {},
        };

        if (existsSync(join(Paths.data(State.id), "package.json"))) pjson = _.extend(pjson, loadJson<any>(join(Paths.data(State.id), "package.json"), {}));

        Config.savePackage(pjson);

        let config: any = {};

        if (State.id === "hub") {
            config = {
                api: {
                    origin: "*",
                },
            };
        } else {
            config = {
                plugins: [],
                accessories: [],
                platforms: [],
            };
        }

        if (existsSync(Paths.config)) config = _.extend(config, loadJson<any>(Paths.config, {}, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML"));

        if (State.id !== "hub") {
            let bridges: any = [];

            if (existsSync(Paths.bridges)) bridges = loadJson<BridgeRecord[]>(Paths.bridges, []);

            const index = bridges.findIndex((n: any) => n.id === State.id);

            if (index >= 0) State.display = bridges[index].display;
        }

        Config.saveConfig(config);

        return config;
    }

    static saveConfig(config: any, touch?: boolean): void {
        let current: any = {};

        if (existsSync(Paths.config)) current = loadJson<any>(Paths.config, {}, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML");

        if (State.id !== "hub") {
            config.accessories = config?.accessories || [];
            config.platforms = config?.platforms || [];

            Config.filterConfig(config?.accessories);
            Config.filterConfig(config?.platforms);
        }

        if (!jsonEquals(current, config)) {
            writeFileSync(Paths.config, formatJson(config, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML"));
        } else if (touch) {
            Config.touchConfig();
        }
    }

    static touchConfig(): void {
        let config: any = {};

        if (existsSync(Paths.config)) config = loadJson<any>(Paths.config, {}, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML");

        writeFileSync(Paths.config, formatJson(config, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML"));
    }

    static filterConfig(value: any): void {
        if (value) {
            const keys = _.keys(value);

            for (let i = 0; i < keys.length; i += 1) {
                if (value[keys[i]] === null || value[keys[i]] === "") {
                    delete value[keys[i]];
                } else if (Object.prototype.toString.call(value[keys[i]]) === "[object Object]" && Object.entries(value[keys[i]]).length === 0) {
                    delete value[keys[i]];
                } else if (Object.prototype.toString.call(value[keys[i]]) === "[object Object]") {
                    Config.filterConfig(value[keys[i]]);
                } else if (Array.isArray(value[keys[i]]) && value[keys[i]].length === 0) {
                    delete value[keys[i]];
                } else if (Array.isArray(value[keys[i]])) {
                    Config.filterConfig(value[keys[i]]);
                }
            }
        }
    }

    static savePackage(pjson: any): void {
        let current: any = {};

        if (existsSync(join(Paths.data(State.id), "package.json"))) {
            current = loadJson<any>(join(Paths.data(State.id), "package.json"), {});
        }

        if (!jsonEquals(current, pjson)) {
            writeFileSync(join(Paths.data(State.id), "package.json"), formatJson(pjson));
        }
    }

    accessories(): any {
        return {
            add: (data: any) => {
                data.name = data.name || this.display;

                data.plugin_map = {
                    plugin_name: this.name,
                };

                this.config.accessories.push(data);

                Config.saveConfig(this.config);
            },

            list: (): number[] => {
                const indexes: number[] = [];

                for (let i = 0; (this.config.accessories || []).length; i += 1) {
                    if ((this.config.accessories[i].plugin_map || {}).plugin_name === this.name) {
                        indexes.push(i);
                    }
                }

                return indexes;
            },
        };
    }

    accessory(index: number): any {
        if (this.accessories().indexOf(index) === -1) {
            return undefined;
        }

        return {
            get: (key: string): any => this.config.accessories[index][key],

            set: (key: string, value: any): void => {
                this.config.accessories[index][key] = value;

                this.config.accessories[index].plugin_map = {
                    plugin_name: this.name,
                };

                Config.saveConfig(this.config);
            },
        };
    }

    get(key: string): any {
        const index = this.config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === this.name);

        if (index === -1) {
            return undefined;
        }

        return this.config.platforms[index][key];
    }

    set(key: string, value: any) {
        const index = this.config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === this.name);

        if (index >= 0) {
            this.config.platforms[index][key] = value;

            this.config.platforms[index].plugin_map = {
                plugin_name: this.name,
            };

            Config.saveConfig(this.config);
        }
    }
}
