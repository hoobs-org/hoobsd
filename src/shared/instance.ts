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

import HTTP from "http";
import IO from "socket.io";
import { join } from "path";
import { readFileSync } from "fs-extra";
import { Express } from "express-serve-static-core";
import Cache from "./cache";
import Pipe from "../server/pipe";
import Server from "../server";
import Bridge from "../bridge";
import API from "../api";
import Socket from "../api/socket";
import { Loggers } from "./logger";

interface Status {
    id: number,
    instance: string,
    running: boolean,
    status: string,
    uptime: number,
    bridge_name: string,
    product: string,
    version: string,
    node_version: string,
    username: string,
    bridge_port: number,
    setup_pin: string,
    setup_id: string,
    storage_path: string,
}

export interface Application {
    app: Express | undefined,
    listner: HTTP.Server | undefined,
    io: IO.Server | undefined,
    socket: Pipe | undefined,
    cache: Cache | undefined,
    server: Server | undefined,
    bridge: Bridge | undefined,
    api: API | undefined,

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
    status: { [key: string]: Status }

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
    api: undefined,

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
    status: {},

    plugins: {},
    connections: [],
};

export default instance;
