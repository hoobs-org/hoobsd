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
import { DotenvParseOutput } from "dotenv";
import { Loggers } from "./services/logger";
import Cache from "./services/cache";
import Socket from "./bridge/services/socket";
import Bridge from "./bridge";
import Homebridge from "./bridge/server";
import Hub from "./hub";
import { BridgeRecord } from "./services/bridges";
import { UserRecord } from "./services/users";
import { loadJson } from "./services/formatters";

export interface Application {
    version: string;
    mode: string;
    enviornment: DotenvParseOutput | undefined;

    app: Express | undefined;
    io: IO.Server | undefined;
    socket: Socket | undefined;
    cache: Cache | undefined;
    hub: Hub | undefined;
    bridge: Bridge | undefined;
    homebridge: Homebridge | undefined;

    id: string;
    display: string;

    debug: boolean;
    verbose: boolean;
    timestamps: boolean;
    orphans: boolean;
    container: boolean;
    terminating: boolean;

    bridges: BridgeRecord[];
    users: UserRecord[];
    loggers: Loggers;

    plugins: { [key: string]: any };
    restoring: boolean;
    project: string | undefined;
}

const state: Application = {
    version: loadJson<any>(existsSync(join(__dirname, "./package.json")) ? join(__dirname, "./package.json") : join(__dirname, "../../package.json"), {}).version,
    mode: "production",
    enviornment: {},

    app: undefined,
    io: undefined,
    socket: undefined,
    cache: undefined,
    hub: undefined,
    bridge: undefined,
    homebridge: undefined,

    id: "default",
    display: "Default",

    debug: false,
    verbose: false,
    timestamps: true,
    orphans: true,
    container: false,
    terminating: false,

    bridges: [],
    users: [],
    loggers: {},

    plugins: {},
    restoring: false,
    project: undefined,
};

export default state;
