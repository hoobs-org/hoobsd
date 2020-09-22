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

import RawIPC from "node-ipc";
import { Print } from "../shared/logger";

export interface SocketRequest {
    params?: { [key: string]: any },
    body?: any,
}

export interface SocketResponse {
    send: (body: any) => void
}

export function broadcast(event: string, body: any): Promise<any> {
    return new Promise((resolve) => {
        const session = `${new Date().getTime()}:${Math.random()}`;
        const pipe = new RawIPC.IPC();

        pipe.config.logInColor = false;
        pipe.config.logger = Print;
        pipe.config.maxRetries = 3;
        pipe.config.stopRetrying = true;
        pipe.config.retry = 1000;

        pipe.connectTo("console.hoobs.bridge", () => {
            pipe.of["console.hoobs.bridge"].on(session, () => {
                pipe.disconnect("console.hoobs.bridge");

                resolve();
            });

            pipe.of["console.hoobs.bridge"].on("error", () => {
                resolve();
            });

            pipe.of["console.hoobs.bridge"].emit(event, {
                session,
                body,
            });
        });
    });
}

export default class Pipe {
    declare private pipe: any;

    declare private name: string;

    declare private server: any;

    declare private routes: { [key: string]: (request: SocketRequest, response: SocketResponse) => any };

    constructor(name: string) {
        this.name = name;
        this.routes = {};
        this.pipe = new RawIPC.IPC();
        this.pipe.config.logInColor = false;
        this.pipe.config.logger = Print;
        this.pipe.config.id = `${this.name}.hoobs.bridge`;

        this.pipe.serve(`/tmp/app.${this.name}.hoobs.bridge`, () => {
            this.pipe.server.on("request", (payload: any, socket: any) => {
                this.routes[payload.path]({
                    params: payload.params,
                    body: payload.body,
                }, {
                    send: (body: any) => {
                        this.pipe.server.emit(socket, payload.session, body);
                    },
                });
            });
        });
    }

    route(path: string, controller: (request: SocketRequest, response: SocketResponse) => any) {
        this.routes[path] = controller;
    }

    start(): void {
        this.pipe.server.start();
    }

    stop() {
        this.pipe.server.stop();
    }
}
