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
import { existsSync, unlinkSync } from "fs-extra";
import { join } from "path";
import Paths from "../../services/paths";
import { Print, Events } from "../../services/logger";

const sockets: { [key: string]: any } = {};

export interface SocketRequest {
    params?: { [key: string]: any };
    body?: any;
}

export interface SocketResponse {
    send: (body: any) => void;
}

export default class Socket {
    declare private pipe: any;

    declare private name: string;

    declare private server: any;

    declare private routes: { [key: string]: (request: SocketRequest, response: SocketResponse) => any };

    declare private defined: boolean;

    declare public running: boolean;

    constructor(name: string) {
        this.name = name;
        this.routes = {};
        this.defined = false;

        this.running = false;
        this.pipe = new RawIPC.IPC();
        this.pipe.config.logInColor = true;
        this.pipe.config.logger = Print;
        this.pipe.config.appspace = "/";
        this.pipe.config.socketRoot = Paths.storagePath();
        this.pipe.config.id = `${this.name}.sock`;

        this.pipe.serve(() => {
            if (!this.defined) {
                this.pipe.server.on(Events.PING, (_payload: any, socket: any) => {
                    this.pipe.server.emit(socket, Events.PONG);
                });

                this.pipe.server.on(Events.REQUEST, (payload: any, socket: any) => {
                    if (this.routes[payload.path]) {
                        this.routes[payload.path]({
                            params: payload.params,
                            body: payload.body,
                        }, {
                            send: (body: any) => {
                                this.pipe.server.emit(socket, payload.session, body);
                            },
                        });
                    } else {
                        this.pipe.server.emit(socket, payload.session);
                    }
                });
            }

            this.heartbeat();
            this.defined = true;
        });
    }

    heartbeat() {
        if (!sockets[`${this.name}.sock`]) {
            sockets[`${this.name}.sock`] = new RawIPC.IPC();

            sockets[`${this.name}.sock`].config.appspace = "/";
            sockets[`${this.name}.sock`].config.socketRoot = Paths.storagePath();
            sockets[`${this.name}.sock`].config.logInColor = true;
            sockets[`${this.name}.sock`].config.logger = () => {};
            sockets[`${this.name}.sock`].config.maxRetries = 0;
            sockets[`${this.name}.sock`].config.stopRetrying = true;
            sockets[`${this.name}.sock`].config.id = `${this.name}.sock`;
        }

        sockets[`${this.name}.sock`].connectTo(`${this.name}.sock`, () => {
            sockets[`${this.name}.sock`].of[`${this.name}.sock`].on(Events.PONG, () => {
                sockets[`${this.name}.sock`].of[`${this.name}.sock`].off(Events.PONG, "*");
                sockets[`${this.name}.sock`].disconnect();

                setTimeout(() => {
                    this.heartbeat();
                }, 5 * 1000);
            });

            sockets[`${this.name}.sock`].of[`${this.name}.sock`].on("error", () => {
                sockets[`${this.name}.sock`].of[`${this.name}.sock`].off(Events.PONG, "*");
                sockets[`${this.name}.sock`].disconnect();

                Print("Restarting IPC Socket");

                this.stop();
                this.start();
            });

            sockets[`${this.name}.sock`].of[`${this.name}.sock`].emit(Events.PING);
        });
    }

    route(path: string, controller: (request: SocketRequest, response: SocketResponse) => any) {
        this.routes[path] = controller;
    }

    start(): void {
        if (!this.running) {
            Print("Starting IPC Socket");

            this.pipe.server.start();
            this.running = true;
        }
    }

    stop() {
        if (this.running) {
            this.running = false;
            this.pipe.server.stop();

            if (existsSync(join(Paths.storagePath(), `${this.name}.sock`))) unlinkSync(join(Paths.storagePath(), `${this.name}.sock`));
        }
    }

    static up() {
        return existsSync(join(Paths.storagePath(), "api.sock"));
    }

    static fetch(event: Events, body: any): Promise<void> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (!existsSync(join(Paths.storagePath(), "api.sock"))) {
                resolve();

                return;
            }

            if (!sockets["api.sock"]) {
                sockets["api.sock"] = new RawIPC.IPC();

                sockets["api.sock"].config.appspace = "/";
                sockets["api.sock"].config.socketRoot = Paths.storagePath();
                sockets["api.sock"].config.logInColor = true;
                sockets["api.sock"].config.logger = Print;
                sockets["api.sock"].config.maxRetries = 0;
                sockets["api.sock"].config.stopRetrying = true;
            }

            sockets["api.sock"].connectTo("api.sock", () => {
                sockets["api.sock"].of["api.sock"].on(session, () => {
                    sockets["api.sock"].of["api.sock"].off(session, "*");
                    sockets["api.sock"].disconnect();

                    resolve();
                });

                sockets["api.sock"].of["api.sock"].on("error", () => {
                    sockets["api.sock"].of["api.sock"].off(session, "*");
                    sockets["api.sock"].disconnect();

                    resolve();
                });

                sockets["api.sock"].of["api.sock"].emit(event, {
                    session,
                    body,
                });
            });
        });
    }
}
