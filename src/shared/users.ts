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

import Crypto from "crypto";
import { join } from "path";

import {
    readFileSync,
    existsSync,
    unlinkSync,
    appendFileSync,
} from "fs-extra";

import Instance from "./instance";
import Paths from "./paths";
import { parseJson, formatJson } from "./helpers";

export interface UserRecord {
    id: number,
    name: string,
    admin: boolean,
    username: string,
    password: string,
    salt: string
}

export default class Users {
    declare private users: UserRecord[];

    constructor() {
        if (!existsSync(join(Paths.storagePath(), "access.json"))) {
            appendFileSync(join(Paths.storagePath(), "access.json"), formatJson([]));
        }

        this.users = parseJson(readFileSync(join(Paths.storagePath(), "access.json")).toString(), []);
    }

    count(): number {
        return this.users.length;
    }

    generateSalt(): Promise<string> {
        return new Promise((resolve, reject) => {
            Crypto.randomBytes(32, (error, buffer) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(buffer.toString("hex"));
                }
            });
        });
    }

    hashValue(value: string, salt: string): Promise<string> {
        return new Promise((resolve, reject) => {
            Crypto.pbkdf2(value, salt, 1000, 64, "sha512", (error, key) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(key.toString("hex"));
                }
            });
        });
    }

    async generateToken(id: number, remember?: boolean): Promise<string | boolean> {
        const user: UserRecord = this.users.filter((u) => u.id === id)[0];
        const key: string = await this.generateSalt();

        if (user) {
            const token = {
                key,
                id: user.id,
                name: user.name,
                username: user.username,
                admin: user.admin,
                ttl: remember ? 525600 : Instance.api?.settings.inactive_logoff || 30,
                token: await this.hashValue(user.password, key),
            };

            Instance.cache?.set(Buffer.from(JSON.stringify(token), "utf8").toString("base64"), true, token.ttl);

            return Buffer.from(JSON.stringify(token), "utf8").toString("base64");
        }

        return false;
    }

    decodeToken(token: string): { [key: string]: any } | boolean {
        if (!token || token === "") {
            return {};
        }

        const data = parseJson(Buffer.from(token, "base64").toString(), undefined);

        if (data) {
            const user: UserRecord = this.users.filter((u) => u.id === data.id)[0];

            if (!user) {
                return {};
            }

            return user;
        }

        return false;
    }

    async validateToken(token: string | undefined): Promise<boolean> {
        if (!token || token === "") {
            return false;
        }

        const server = Instance.cache?.get(token);

        if (!server) {
            return false;
        }

        const data = parseJson(Buffer.from(token, "base64").toString(), undefined);

        if (data) {
            const user = this.users.filter((u) => u.id === data.id)[0];

            if (!user) {
                return false;
            }

            const challenge = await this.hashValue(user.password, data.key);

            if (challenge === data.token) {
                Instance.cache?.set(token, true, data.ttl || Instance.api?.settings.inactive_logoff || 30);

                return true;
            }
        }

        return false;
    }

    get(username: string): UserRecord | undefined {
        return this.users.filter((u) => u.username.toLowerCase() === username.toLowerCase())[0];
    }

    async create(name: string, username: string, password: string, admin: boolean): Promise<UserRecord> {
        const user = {
            id: 1,
            name,
            admin,
            username,
            password,
            salt: await this.generateSalt(),
        };

        user.admin = admin;
        user.password = await this.hashValue(user.password, user.salt);

        if (this.users.length > 0) {
            user.id = this.users[this.users.length - 1].id + 1;
        }

        this.users.push(user);

        if (existsSync(join(Paths.storagePath(), "access.json"))) {
            unlinkSync(join(Paths.storagePath(), "access.json"));
        }

        appendFileSync(join(Paths.storagePath(), "access.json"), formatJson(this.users));

        return user;
    }

    async update(id: number, name: string, username: string, password?: string, admin?: boolean): Promise<UserRecord | boolean> {
        const index = this.users.findIndex((u) => u.id === id);

        if (index >= 0) {
            this.users[index].name = name;
            this.users[index].username = username;
            this.users[index].admin = admin!;

            if (password) {
                this.users[index].password = await this.hashValue(password, this.users[index].salt);
            }

            if (existsSync(join(Paths.storagePath(), "access.json"))) {
                unlinkSync(join(Paths.storagePath(), "access.json"));
            }

            appendFileSync(join(Paths.storagePath(), "access.json"), formatJson(this.users));

            return this.users[index];
        }

        return false;
    }

    delete(id: number): boolean {
        const index = this.users.findIndex((u) => u.id === id);

        if (index >= 0) {
            this.users.splice(index, 1);

            if (existsSync(join(Paths.storagePath(), "access.json"))) {
                unlinkSync(join(Paths.storagePath(), "access.json"));
            }

            appendFileSync(join(Paths.storagePath(), "access.json"), formatJson(this.users));

            return true;
        }

        return false;
    }
}
