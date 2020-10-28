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

export default class Cache {
    declare client: ServerCache;

    constructor() {
        this.client = new ServerCache();
    }

    get<T>(key: string): T {
        const value = this.client.get(key);

        return <T>value;
    }

    set(key: string, value: unknown, age: number): boolean {
        return this.client.set(key, value, (age || 30) * 60);
    }

    touch(key: string, age: number): boolean {
        return this.client.ttl(key, (age || 30) * 60);
    }

    remove(key: string): number {
        return this.client.del(key);
    }
}
