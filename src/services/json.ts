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

import { gzipSync, gunzipSync } from "zlib";

export function parseJson<T>(value: string, replacement: T): T {
    try {
        return <T>JSON.parse(value);
    } catch (_error) {
        return replacement;
    }
}

export function jsonEquals(source: any, value: any): boolean {
    if (JSON.stringify(source) === JSON.stringify(value)) return true;

    return false;
}

export function cloneJson(object: any): any {
    return JSON.parse(JSON.stringify(object));
}

export function formatJson(object: any, pretty?: boolean): string {
    if (pretty) return JSON.stringify(object, null, 4);

    return JSON.stringify(object);
}

export function compressJson(value: { [key: string]: any }): Uint8Array {
    const buffer = gzipSync(Buffer.from(JSON.stringify(value)));
    const content = new ArrayBuffer(buffer.length);
    const results = new Uint8Array(content);

    for (let i = 0; i < buffer.length; i += 1) {
        results[i] = buffer[i];
    }

    return results;
}

export function decompressJson(value: Uint8Array): { [key: string]: any } {
    const buffer = Buffer.alloc(value.byteLength);
    const view = new Uint8Array(value);

    for (let i = 0; i < buffer.length; i += 1) {
        buffer[i] = view[i];
    }

    try {
        return JSON.parse(gunzipSync(buffer).toString());
    } catch (_error) {
        return {};
    }
}
