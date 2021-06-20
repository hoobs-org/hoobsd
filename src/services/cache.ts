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

import ServerCache from "node-cache";
import { join } from "path";
import { existsSync } from "fs-extra";
import Paths from "./paths";

export default class Cache {
    declare client: ServerCache;

    constructor() {
        this.client = new ServerCache();
    }

    get<T>(key: string): T {
        const value = this.client.get(key);

        return <T>value;
    }

    set(key: string, value: unknown, age: number): any {
        this.client.del(key);
        this.client.set(key, value, (age || 30) * 60);

        return value;
    }

    touch(key: string, age: number): boolean {
        return this.client.ttl(key, (age || 30) * 60);
    }

    remove(key: string): number {
        return this.client.del(key);
    }

    filter(value: string, clear?: boolean): boolean {
        if (
            value.indexOf("system/") === 0
         || value.indexOf("accessories/") === 0
         || value.indexOf("plugin/") === 0
         || value.indexOf("bridge/") === 0
        ) {
            return false;
        }

        if (clear && value.indexOf("release/") === 0) return false;

        return true;
    }

    clear() {
        const keys = this.client.keys();
        const filtered = keys.filter((item) => !this.filter(item, true));

        for (let i = 0; i < filtered.length; i += 1) {
            this.client.del(filtered[i]);
        }
    }

    load(path: string) {
        const now = (new Date()).getTime();

        if (existsSync(join(path, "cache"))) {
            const cache = Paths.loadJson<any>(join(path, "cache"), [], "jB862gBM2dk3!^0XY@xIwM1631Ue7zqo", true).filter((item: any) => this.filter(item.key));

            for (let i = 0; i < cache.length; i += 1) {
                const ttl = (cache[i].ttl - now) / 1000;

                if (ttl > 0) {
                    this.client.set(cache[i].key, cache[i].value, ttl);
                }
            }
        }
    }

    save(path: string) {
        if (existsSync(path)) {
            const cache = [];
            const keys = this.client.keys();
            const filtered = keys.filter((item) => this.filter(item));

            for (let i = 0; i < filtered.length; i += 1) {
                cache.push({
                    key: filtered[i],
                    value: this.client.get(filtered[i]),
                    ttl: this.client.getTtl(filtered[i]),
                });
            }

            Paths.saveJson(join(path, "cache"), cache, false, "jB862gBM2dk3!^0XY@xIwM1631Ue7zqo", true);
        }
    }
}
