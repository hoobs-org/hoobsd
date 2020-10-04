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
import { existsSync, readFileSync } from "fs-extra";
import { createCipheriv, createDecipheriv } from "crypto";
import Chalk from "chalk";

export function sanitize(value: string, prevent?: string): string {
    if (!value || value === "") return "default";
    if (prevent && prevent !== "" && prevent.toLowerCase() === value.toLowerCase()) return "default";

    return Sanitize(value).toLowerCase().replace(/ /gi, "-");
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

export function loadJson<T>(file: string, replacement: T, key?: string): T {
    if (!existsSync(file)) return replacement;

    if (key) {
        const cipher = createDecipheriv("aes-256-cbc", key, "XT2IN0SK62F1DK5G");
        const decrypted = cipher.update(readFileSync(file).toString(), "hex", "utf8") + cipher.final("utf8");

        return parseJson<T>(decrypted, replacement);
    }

    return parseJson<T>(readFileSync(file).toString(), replacement);
}

export function jsonEquals(source: any, value: any): boolean {
    if (JSON.stringify(source) === JSON.stringify(value)) return true;

    return false;
}

export function cloneJson(object: any): any {
    return JSON.parse(JSON.stringify(object));
}

export function formatJson(object: any, key?: string): string {
    if (key) {
        const cipher = createCipheriv("aes-256-cbc", key, "XT2IN0SK62F1DK5G");
        const encrypted = cipher.update(JSON.stringify(object, null, 4), "utf8", "hex") + cipher.final("hex");

        return encrypted;
    }

    return JSON.stringify(object, null, 4);
}

export function colorize(value: number | string, bright?: boolean): any {
    let index = 0;

    if (typeof value === "string") {
        index = parseInt(`${Number(Buffer.from(value.replace(/hoobs/gi, "").replace(/homebridge/gi, ""), "utf-8").toString("hex"))}`, 10) % 6;
    } else if (typeof value === "number") {
        index = value % 6;
    }

    switch (index) {
        case 1:
            return bright ? Chalk.cyanBright : Chalk.cyan;

        case 2:
            return bright ? Chalk.blueBright : Chalk.blue;

        case 3:
            return bright ? Chalk.magentaBright : Chalk.magenta;

        case 4:
            return bright ? Chalk.greenBright : Chalk.green;

        case 5:
            return bright ? Chalk.yellowBright : Chalk.yellow;

        default:
            return bright ? Chalk.redBright : Chalk.red;
    }
}
