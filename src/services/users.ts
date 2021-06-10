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
import { existsSync } from "fs-extra";
import State from "../state";
import Paths from "./paths";
import { parseJson } from "./json";

export interface UserRecord {
    id: number;
    name: string;
    permissions: { [key: string]: boolean };
    username: string;
    password: string;
    salt: string;
}

export default class Users {
    static list() {
        if (!existsSync(join(Paths.data(), "access"))) Paths.saveJson(join(Paths.data(), "access"), [], false, "tGXnkdWOnl@p817684zOB7qUs!A2t!$1");

        return Paths.loadJson<UserRecord[]>(join(Paths.data(), "access"), [], "tGXnkdWOnl@p817684zOB7qUs!A2t!$1");
    }

    static count(): number {
        return State.users.length;
    }

    static generateSalt(): Promise<string> {
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

    static hashValue(value: string, salt: string): Promise<string> {
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

    static async generateToken(id: number, remember?: boolean): Promise<string | boolean> {
        const user: UserRecord = State.users.filter((u) => u.id === id)[0];
        const key: string = await Users.generateSalt();

        if (user) {
            const token = {
                key,
                id: user.id,
                name: user.name,
                username: user.username,
                permissions: user.permissions,
                token: await Users.hashValue(user.password, key),
            };

            return State.cache?.set(
                Buffer.from(JSON.stringify(token), "utf8").toString("base64"),
                remember ? 525600 : State.hub?.settings.inactive_logoff || 30,
                remember ? 525600 : State.hub?.settings.inactive_logoff || 30,
            );
        }

        return false;
    }

    static decodeToken(token: string | undefined): { [key: string]: any } {
        if (State.hub?.settings.disable_auth) {
            return {
                permissions: {
                    accessories: true,
                    controller: true,
                    bridges: true,
                    terminal: true,
                    plugins: true,
                    users: false,
                    reboot: true,
                    config: true,
                },
                username: "unavailable",
            };
        }

        if (!token || token === "") return {};

        const data = parseJson<any>(Buffer.from(token, "base64").toString("utf8"), undefined);

        if (data) {
            const user: UserRecord = State.users.filter((u) => u.id === data.id)[0];

            if (!user) return {};

            return user;
        }

        return {};
    }

    static async validateToken(token: string | undefined): Promise<boolean> {
        if (State.hub?.settings.disable_auth) return true;
        if (!token || token === "") return false;

        const server = State.cache?.get<number>(token);

        if (!server || server <= 0) return false;

        const data = parseJson<any>(Buffer.from(token, "base64").toString("utf8"), undefined);

        if (data) {
            const user = State.users.filter((u) => u.id === data.id)[0];

            if (!user) return false;

            const challenge = await this.hashValue(user.password, data.key);

            if (challenge === data.token) {
                State.cache?.touch(token, server);

                return true;
            }
        }

        State.cache?.remove(token);

        return false;
    }

    static get(username: string): UserRecord | undefined {
        return State.users.filter((u) => u.username.toLowerCase() === username.toLowerCase())[0];
    }

    static async create(name: string, username: string, password: string, permissions: { [key: string]: boolean }): Promise<UserRecord> {
        const user = {
            id: 1,
            name,
            permissions,
            username,
            password,
            salt: await Users.generateSalt(),
        };

        user.password = await this.hashValue(user.password, user.salt);

        if (State.users.length > 0) user.id = State.users[State.users.length - 1].id + 1;

        State.users.push(user);

        Paths.saveJson(join(Paths.data(), "access"), State.users, false, "tGXnkdWOnl@p817684zOB7qUs!A2t!$1");

        return user;
    }

    static async update(id: number, name: string, username: string, password?: string, permissions?: { [key: string]: boolean }): Promise<UserRecord | boolean> {
        const index = State.users.findIndex((u) => u.id === id);

        if (index >= 0) {
            State.users[index].name = name;
            State.users[index].username = username;

            if (permissions) State.users[index].permissions = permissions;
            if (password) State.users[index].password = await this.hashValue(password, State.users[index].salt);

            Paths.saveJson(join(Paths.data(), "access"), State.users, false, "tGXnkdWOnl@p817684zOB7qUs!A2t!$1");

            return State.users[index];
        }

        return false;
    }

    static delete(id: number): boolean {
        const index = State.users.findIndex((u) => u.id === id);

        if (index >= 0) {
            State.users.splice(index, 1);

            Paths.saveJson(join(Paths.data(), "access"), State.users, false, "tGXnkdWOnl@p817684zOB7qUs!A2t!$1");

            return true;
        }

        return false;
    }
}
