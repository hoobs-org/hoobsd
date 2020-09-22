/**************************************************************************************************
 * HOOBSD                                                                                         *
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

import HTTP from "http";
import IO from "socket.io";
import { join } from "path";
import { readFileSync } from "fs-extra";
import { Express } from "express-serve-static-core";
import Cache from "./cache";
import Pipe from "../server/pipe";
import Server from "../server";
import Bridge from "../bridge";
import Console from "../console";
import Socket from "../console/socket";
import { Loggers } from "./logger";

export interface Application {
    app: Express | undefined,
    listner: HTTP.Server | undefined,
    io: IO.Server | undefined,
    socket: Pipe | undefined,
    cache: Cache | undefined,
    server: Server | undefined,
    bridge: Bridge | undefined,
    console: Console | undefined,

    id: string,
    display: string,

    debug: boolean,
    verbose: boolean,
    orphans: boolean,
    container: boolean,
    terminating: boolean,

    version: string,
    manager: string,
    loggers: Loggers,

    plugins: { [key: string]: any },
    connections: Socket[],
}

const instance: Application = {
    app: undefined,
    listner: undefined,
    io: undefined,
    socket: undefined,
    cache: undefined,
    server: undefined,
    bridge: undefined,
    console: undefined,

    id: "default",
    display: "Default",

    debug: false,
    verbose: false,
    orphans: true,
    container: false,
    terminating: false,

    version: (JSON.parse(readFileSync(join(__dirname, "../../package.json")).toString()))?.version,
    manager: "npm",
    loggers: {},

    plugins: {},
    connections: [],
};

export default instance;
