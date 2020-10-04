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

export function colorize(value: string): string {
    let hash = 0;

    const sample = (`${value.replace(/ /gi, "_")}________________`).substring(0, 16);

    for (let i = 0; i < sample.length; i += 1) {
        hash = sample.charCodeAt(i) + ((hash << 5) - hash); // eslint-disable-line no-bitwise
    }

    const hex = (hash & 0x00FFFFFF).toString(16).toLowerCase(); // eslint-disable-line no-bitwise
    const color = `#${"000000".substring(0, 6 - hex.length) + hex}`;

    return color;
}

export function contrast(hex: string): string {
    if (hex.indexOf("#") === 0) {
        hex = hex.slice(1);
    }

    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return "#FFFFFF";

    return (parseInt(hex.slice(0, 2), 16) * 0.299 + parseInt(hex.slice(2, 4), 16) * 0.587 + parseInt(hex.slice(4, 6), 16) * 0.114) > 186 ? "#000000" : "#FFFFFF";
}
