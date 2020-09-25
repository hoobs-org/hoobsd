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

import RawIPC from "node-ipc";
import { existsSync } from "fs-extra";
import { join } from "path";
import Paths from "../shared/paths";
import { Print } from "../shared/logger";

export interface SocketRequest {
    params?: { [key: string]: any },
    body?: any,
}

export interface SocketResponse {
    send: (body: any) => void
}

export default class Socket {
    declare private pipe: any;

    declare private name: string;

    declare private server: any;

    declare private routes: { [key: string]: (request: SocketRequest, response: SocketResponse) => any };

    declare private defined: boolean;

    constructor(name: string) {
        this.name = name;
        this.routes = {};
        this.defined = false;

        this.pipe = new RawIPC.IPC();
        this.pipe.config.logInColor = true;
        this.pipe.config.logger = Print;
        this.pipe.config.appspace = "/";
        this.pipe.config.socketRoot = Paths.storagePath();
        this.pipe.config.id = `${this.name}.sock`;

        this.pipe.serve(() => {
            if (!this.defined) {
                this.pipe.server.on("ping", (_payload: any, socket: any) => {
                    this.pipe.server.emit(socket, "pong");
                });

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
            }

            this.heartbeat();
            this.defined = true;
        });
    }

    heartbeat() {
        const pipe = new RawIPC.IPC();

        pipe.config.appspace = "/";
        pipe.config.socketRoot = Paths.storagePath();
        pipe.config.logInColor = true;
        pipe.config.logger = () => {};
        pipe.config.maxRetries = 0;
        pipe.config.stopRetrying = true;

        pipe.connectTo(`${this.name}.sock`, () => {
            pipe.of[`${this.name}.sock`].on("pong", () => {
                pipe.of[`${this.name}.sock`].off("pong", "*");

                setTimeout(() => {
                    this.heartbeat();
                }, 5 * 1000);
            });

            pipe.of[`${this.name}.sock`].on("error", () => {
                pipe.of[`${this.name}.sock`].off("pong", "*");
                pipe.disconnect(`${this.name}.sock`);

                Print("Restarting IPC Socket");

                this.stop();
                this.start();
            });

            pipe.of[`${this.name}.sock`].emit("ping");
        });
    }

    route(path: string, controller: (request: SocketRequest, response: SocketResponse) => any) {
        this.routes[path] = controller;
    }

    start(): void {
        Print("Starting IPC Socket");

        this.pipe.server.start();
    }

    stop() {
        this.pipe.server.stop();
    }

    static fetch(event: string, body: any): Promise<any> {
        return new Promise((resolve) => {
            if (!existsSync(join(Paths.storagePath(), "api.sock"))) {
                resolve();

                return;
            }

            const session = `${new Date().getTime()}:${Math.random()}`;
            const pipe = new RawIPC.IPC();

            pipe.config.appspace = "/";
            pipe.config.socketRoot = Paths.storagePath();
            pipe.config.logInColor = true;
            pipe.config.logger = Print;
            pipe.config.maxRetries = 0;
            pipe.config.stopRetrying = true;

            pipe.connectTo("api.sock", () => {
                pipe.of["api.sock"].on(session, () => {
                    pipe.of["api.sock"].off(session, "*");

                    resolve();
                });

                pipe.of["api.sock"].on("error", () => {
                    pipe.of["api.sock"].off(session, "*");
                    pipe.disconnect("api.sock");

                    resolve();
                });

                pipe.of["api.sock"].emit(event, {
                    session,
                    body,
                });
            });
        });
    }
}
