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
import Unzip from "unzipper";
import Archiver from "archiver";

import {
    existsSync,
    createWriteStream,
    createReadStream,
    readFileSync,
    readdirSync,
    lstatSync,
    renameSync,
    copyFileSync,
    unlinkSync,
    ensureDirSync,
    appendFileSync,
    removeSync,
} from "fs-extra";

import { HomebridgeConfig } from "homebridge/lib/server";
import { join } from "path";
import Instance from "./instance";

import {
    generateUsername,
    parseJson,
    formatJson,
    jsonEquals,
} from "./helpers";

export default class Paths {
    static configuration(): HomebridgeConfig {
        let pjson = {
            name: "plugins",
            description: "HOOBS Plugins",
            dependencies: {},
        };

        if (existsSync(join(Paths.storagePath(Instance.id), "package.json"))) {
            pjson = _.extend(pjson, parseJson(readFileSync(join(Paths.storagePath(Instance.id), "package.json")).toString(), {}));
        }

        Paths.savePackage(pjson);

        let config: any = {};

        if (Instance.id === "console") {
            config = {
                console: {
                    origin: "*",
                },
                description: "",
            };
        } else {
            config = {
                server: {
                    origin: "*",
                },
                bridge: {
                    name: "HOOBS",
                    pin: "031-45-154",
                },
                description: "",
                ports: {},
                plugins: [],
                accessories: [],
                platforms: [],
            };
        }

        if (existsSync(Paths.configPath())) {
            config = _.extend(config, parseJson(readFileSync(Paths.configPath()).toString(), {}));
        }

        if (Instance.id !== "console" && config?.ports !== undefined) {
            if (config?.ports?.start > config?.ports?.end) {
                delete config?.ports;
            }
        }

        if (Instance.id !== "console" && (!config?.bridge?.username || !(/^([0-9A-F]{2}:){5}([0-9A-F]{2})$/).test(config?.bridge?.username))) {
            config.bridge.username = generateUsername();
        }

        if (Instance.id !== "console") {
            let instances: any = [];

            if (existsSync(Paths.instancesPath())) {
                instances = parseJson(readFileSync(Paths.instancesPath()).toString(), []);
            }

            const index = instances.findIndex((n: any) => n.id === Instance.id);

            if (index >= 0) {
                Instance.display = instances[index].display;
            }
        }

        Paths.saveConfig(config);

        return config;
    }

    static savePackage(pjson: any): void {
        let current: any = {};

        if (existsSync(join(Paths.storagePath(Instance.id), "package.json"))) {
            current = parseJson(readFileSync(join(Paths.storagePath(Instance.id), "package.json")).toString(), {});
        }

        if (!jsonEquals(current, pjson)) {
            if (existsSync(join(Paths.storagePath(Instance.id), "package.json"))) {
                unlinkSync(join(Paths.storagePath(Instance.id), "package.json"));
            }

            appendFileSync(join(Paths.storagePath(Instance.id), "package.json"), formatJson(pjson));
        }
    }

    static saveConfig(config: any): void {
        let current: any = {};

        if (existsSync(Paths.configPath())) {
            current = parseJson(readFileSync(Paths.configPath()).toString(), {});
        }

        if (Instance.id !== "console") {
            config.accessories = config?.accessories || [];
            config.platforms = config?.platforms || [];

            Paths.filterConfig(config?.accessories);
            Paths.filterConfig(config?.platforms);
        }

        if (!jsonEquals(current, config)) {
            if (existsSync(Paths.configPath())) {
                unlinkSync(Paths.configPath());
            }

            appendFileSync(Paths.configPath(), formatJson(config));
        }
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
                    Paths.filterConfig(value[keys[i]]);
                } else if (Array.isArray(value[keys[i]]) && value[keys[i]].length === 0) {
                    delete value[keys[i]];
                } else if (Array.isArray(value[keys[i]])) {
                    Paths.filterConfig(value[keys[i]]);
                }
            }
        }
    }

    static storagePath(instance?: string): string {
        let path = "";

        if (Instance.container) {
            path = "/hoobs";
        } else if (process.env.APPDATA) {
            path = join(process.env.APPDATA, "HOOBS");
        } else if (process.platform === "darwin") {
            path = join(process.env.HOME || "", "/Library/Preferences/HOOBS");
        } else {
            path = join(process.env.HOME || "", ".hoobs");
        }

        if (instance && instance !== "") {
            path = join(path, instance);
        }

        ensureDirSync(path);

        return path;
    }

    static instancesPath(): string {
        return join(Paths.storagePath(), "instances.json");
    }

    static configPath(): string {
        return join(Paths.storagePath(), `${Instance.id}.config.json`);
    }

    static staticPath(): string {
        ensureDirSync(join(Paths.storagePath(), "static"));

        return join(Paths.storagePath(), "static");
    }

    static backupPath(): string {
        ensureDirSync(join(Paths.storagePath(), "backups"));

        return join(Paths.storagePath(), "backups");
    }

    static persistPath(): string {
        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.persist`));

        return join(Paths.storagePath(), `${Instance.id}.persist`);
    }

    static cachedAccessoryPath(): string {
        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.accessories`));

        return join(Paths.storagePath(), `${Instance.id}.accessories`);
    }

    static clean(): void {
        if (existsSync(join(Paths.storagePath(), `${Instance.id}.persist`))) {
            removeSync(join(Paths.storagePath(), `${Instance.id}.persist`));
        }

        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.persist`));

        if (existsSync(join(Paths.storagePath(), `${Instance.id}.accessories`))) {
            removeSync(join(Paths.storagePath(), `${Instance.id}.accessories`));
        }

        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.accessories`));
    }

    static reset(): void {
        const entries = readdirSync(Paths.storagePath());

        for (let i = 0; i < entries.length; i += 1) {
            const path = join(Paths.storagePath(), entries[i]);

            if (path !== Paths.backupPath()) {
                if (lstatSync(path).isDirectory()) {
                    removeSync(path);
                } else {
                    unlinkSync(path);
                }
            }
        }
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            const filename = `backup-${new Date().getTime()}`;
            const entries = readdirSync(Paths.storagePath());
            const output = createWriteStream(join(Paths.backupPath(), `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backupPath(), `${filename}.zip`), join(Paths.backupPath(), `${filename}.hbf`));
                resolve(`${filename}.hbf`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.storagePath(), entries[i]);

                if (path !== Paths.backupPath()) {
                    if (lstatSync(path).isDirectory()) {
                        archive.directory(path, entries[i]);
                    } else {
                        archive.file(path, { name: entries[i] });
                    }
                }
            }

            archive.finalize();
        });
    }

    static restore(file: string, remove?: boolean): Promise<void> {
        return new Promise((resolve) => {
            const filename = join(Paths.storagePath(), `restore-${new Date().getTime()}.zip`);
            const entries = readdirSync(Paths.storagePath());

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.storagePath(), entries[i]);

                if (path !== Paths.backupPath()) {
                    if (lstatSync(path).isDirectory()) {
                        removeSync(path);
                    } else {
                        unlinkSync(path);
                    }
                }
            }

            if (remove) {
                renameSync(file, filename);
            } else {
                copyFileSync(file, filename);
            }

            createReadStream(filename).pipe(Unzip.Extract({
                path: Paths.storagePath(),
            })).on("finish", () => {
                unlinkSync(filename);
                resolve();
            });
        });
    }
}
