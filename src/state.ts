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
import { Express, Request, Response } from "express-serve-static-core";
import { DotenvParseOutput } from "dotenv";
import { FSWatcher } from "chokidar";
import { IPC } from "./services/ipc";
import { Loggers } from "./services/logger";
import Cache from "./services/cache";
import Bridge from "./bridge";
import Homebridge from "./bridge/server";
import Hub from "./hub";
import Paths from "./services/paths";
import { BridgeRecord } from "./services/bridges";
import { UserRecord } from "./services/users";

const pjson = existsSync(join(__dirname, "./package.json")) ? join(__dirname, "./package.json") : join(__dirname, "../../package.json");
const ejson = existsSync(join(__dirname, "./node_modules/homebridge/package.json")) ? join(__dirname, "./node_modules/homebridge/package.json") : join(__dirname, "../../node_modules/homebridge/package.json");

export interface Application {
    version: string;
    engine: string;
    mode: string;
    enviornment: DotenvParseOutput | undefined;
    watchers: FSWatcher[];

    app: Express | undefined;
    io: IO.Server | undefined;
    ipc: IPC | undefined;
    cache: Cache | undefined;
    hub: Hub | undefined;
    bridge: Bridge | undefined;
    homebridge: Homebridge | undefined;
    setup: string | undefined;

    id: string;
    display: string;

    debug: boolean;
    verbose: boolean;
    timestamps: boolean;
    orphans: boolean;
    terminating: boolean;
    restoring: boolean;
    saving: boolean;

    bridges: BridgeRecord[];
    users: UserRecord[];
    loggers: Loggers;

    project: string | undefined;
    plugins: { [key: string]: (request: Request, response: Response) => any }
}

const state: Application = {
    version: Paths.loadJson<any>(pjson, {}).version,
    engine: Paths.loadJson<any>(ejson, {}).version,
    mode: "production",
    enviornment: {},
    watchers: [],

    app: undefined,
    io: undefined,
    ipc: undefined,
    cache: undefined,
    hub: undefined,
    bridge: undefined,
    homebridge: undefined,
    setup: undefined,

    id: "default",
    display: "Default",

    debug: false,
    verbose: false,
    timestamps: true,
    orphans: true,
    terminating: false,
    restoring: false,
    saving: false,

    bridges: [],
    users: [],
    loggers: {},

    project: undefined,
    plugins: {},
};

export default state;
