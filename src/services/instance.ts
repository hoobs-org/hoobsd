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

import IO from "socket.io";
import { join } from "path";
import { existsSync } from "fs-extra";
import { Express } from "express-serve-static-core";
import Cache from "./cache";
import Socket from "../server/services/socket";
import Server from "../server";
import Bridge from "../bridge";
import API from "../api";
import { Loggers } from "./logger";
import { InstanceRecord } from "./instances";
import { UserRecord } from "./users";
import { loadJson } from "./formatters";

export interface Application {
    app: Express | undefined;
    io: IO.Server | undefined;
    socket: Socket | undefined;
    cache: Cache | undefined;
    server: Server | undefined;
    bridge: Bridge | undefined;
    api: API | undefined;

    id: string;
    display: string;

    debug: boolean;
    verbose: boolean;
    timestamps: boolean;
    orphans: boolean;
    container: boolean;
    terminating: boolean;

    version: string;
    manager: string;
    instances: InstanceRecord[];
    users: UserRecord[];
    loggers: Loggers;

    plugins: { [key: string]: any };
}

const instance: Application = {
    app: undefined,
    io: undefined,
    socket: undefined,
    cache: undefined,
    server: undefined,
    bridge: undefined,
    api: undefined,

    id: "default",
    display: "Default",

    debug: false,
    verbose: false,
    timestamps: true,
    orphans: true,
    container: false,
    terminating: false,

    version: loadJson<any>(join(__dirname, "../../package.json"), {}).version,
    manager: existsSync("/usr/local/bin/yarn") || existsSync("/usr/bin/yarn") ? "yarn" : "npm",
    instances: [],
    users: [],
    loggers: {},

    plugins: {},
};

export default instance;
