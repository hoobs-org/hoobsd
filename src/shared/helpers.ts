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

import Sanitize from "sanitize-filename";
import Os from "os";

import {
    existsSync,
    readFileSync,
    realpathSync,
    unlinkSync,
    removeSync,
    readdirSync,
} from "fs-extra";

import { execSync } from "child_process";
import { join } from "path";
import { Console } from "./logger";

export function sanitize(value: string, prevent?: string): string {
    if (!value || value === "") return "default";
    if (prevent && prevent !== "" && prevent.toLowerCase() === value.toLowerCase()) return "default";

    return Sanitize(value).toLowerCase().replace(/ /gi, ".");
}

export function ordinal(value: number | string): string {
    const parsed = parseInt(`${value}`, 10);

    if (Number.isNaN(parsed) || parsed <= 0) return `${value}`;
    if (parsed % 10 === 1 && parsed % 100 !== 11) return `${parsed}st`;
    if (parsed % 10 === 2 && parsed % 100 !== 12) return `${parsed}nd`;
    if (parsed % 10 === 3 && parsed % 100 !== 13) return `${parsed}rd`;

    return `${parsed}th`;
}

export function format(value: number | string): string | undefined {
    const parsed = parseFloat(`${value}`);

    if (Number.isNaN(parsed) || parsed <= 0) return undefined;

    return parsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function parseJson<T>(value: string, replacement: T): T {
    try {
        return <T>JSON.parse(value);
    } catch (_error) {
        return replacement;
    }
}

export function loadJson<T>(file: string, replacement: T): T {
    if (!existsSync(file)) return replacement;

    return parseJson<T>(readFileSync(file).toString(), replacement);
}

export function jsonEquals(source: any, value: any): boolean {
    if (JSON.stringify(source) === JSON.stringify(value)) return true;

    return false;
}

export function cloneJson(object: any): any {
    return JSON.parse(JSON.stringify(object));
}

export function formatJson(object: any): string {
    return JSON.stringify(object, null, 4);
}

export function tryUnlink(filename: string): boolean {
    if (existsSync(filename)) {
        try {
            unlinkSync(filename);
        } catch (_fail) {
            try {
                removeSync(filename);
            } catch (_error) {
                return false;
            }
        }
    }

    return true;
}

export function isDirectoryEmpty(path: string): boolean {
    if (existsSync(path)) {
        try {
            return (!(readdirSync(path)).length);
        } catch (_error) {
            return false;
        }
    }

    return false;
}

export function findCommand(command: string): boolean {
    const paths = (process.env.PATH || "").split(":");

    for (let i = 0; i < paths.length; i += 1) {
        if (existsSync(join(paths[i], command))) return true;
    }

    return false;
}

export function verifyModule(path: string, name: string): string | undefined {
    if (existsSync(path) && existsSync(join(path, "package.json"))) {
        try {
            if (JSON.parse(readFileSync(join(path, "package.json")).toString())?.name === name) return path;
        } catch (_error) {
            return undefined;
        }
    }

    return undefined;
}

export function findModule(name: string): string | undefined {
    let path: string | undefined;
    let prefix: string | undefined;

    if (process.platform === "linux" || process.platform === "darwin") {
        prefix = undefined;

        try {
            prefix = (`${execSync("npm config get prefix") || ""}`).trim();
        } catch (error) {
            prefix = undefined;
        }

        if (prefix && prefix !== "") path = verifyModule(join(join(prefix, "lib", "node_modules"), name), name);

        if (!path) {
            prefix = undefined;

            try {
                prefix = (`${execSync("yarn global dir")}`).trim();
            } catch (error) {
                prefix = undefined;
            }

            if (prefix && prefix !== "") path = verifyModule(join(join(prefix, "node_modules"), name), name);
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

export function loadPackage(directory: string): any {
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

export function loadSchema(directory: string): any {
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

export function generateUsername(): string {
    let value = "";

    for (let i = 0; i < 6; i += 1) {
        if (value !== "") value += ":";

        const hex = `00${Math.floor(Math.random() * 255).toString(16).toUpperCase()}`;

        value += hex.substring(hex.length - 2, hex.length);
    }

    return value;
}

export function network(): string[] {
    const ifaces: NodeJS.Dict<Os.NetworkInterfaceInfo[]> = Os.networkInterfaces();
    const results: string[] = [];

    Object.keys(ifaces).forEach((ifname: string) => {
        ifaces[ifname]!.forEach((iface: Os.NetworkInterfaceInfo) => {
            if (iface.family !== "IPv4" || iface.internal !== false) return;
            if (results.indexOf(iface.address) === -1) results.push(`${iface.address}`);
        });
    });

    return results;
}
