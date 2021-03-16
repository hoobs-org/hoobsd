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

const PING_INTERVAL = 5000;
const SOCKETS: { [key: string]: any } = {};

const VOID_EVENTS = [
    Events.LOG,
    Events.RESTART,
    Events.NOTIFICATION,
    Events.ACCESSORY_CHANGE,
    Events.CONFIG_CHANGE,
    Events.ROOM_CHANGE,
    Events.MONITOR,
];

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
        this.pipe.config.socketRoot = Paths.data();
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
        if (!SOCKETS[`${this.name}.sock`]) {
            SOCKETS[`${this.name}.sock`] = new RawIPC.IPC();

            SOCKETS[`${this.name}.sock`].config.appspace = "/";
            SOCKETS[`${this.name}.sock`].config.socketRoot = Paths.data();
            SOCKETS[`${this.name}.sock`].config.logInColor = true;
            SOCKETS[`${this.name}.sock`].config.logger = () => {};
            SOCKETS[`${this.name}.sock`].config.maxRetries = 0;
            SOCKETS[`${this.name}.sock`].config.stopRetrying = true;
            SOCKETS[`${this.name}.sock`].config.id = `${this.name}.sock`;
        }

        SOCKETS[`${this.name}.sock`].connectTo(`${this.name}.sock`, () => {
            SOCKETS[`${this.name}.sock`].of[`${this.name}.sock`].on(Events.PONG, () => {
                SOCKETS[`${this.name}.sock`].of[`${this.name}.sock`].off(Events.PONG, "*");
                SOCKETS[`${this.name}.sock`].disconnect();

                setTimeout(() => {
                    this.heartbeat();
                }, PING_INTERVAL);
            });

            SOCKETS[`${this.name}.sock`].of[`${this.name}.sock`].on("error", () => {
                SOCKETS[`${this.name}.sock`].of[`${this.name}.sock`].off(Events.PONG, "*");
                SOCKETS[`${this.name}.sock`].disconnect();

                Print("Restarting IPC Socket");

                this.stop();
                this.start();
            });

            SOCKETS[`${this.name}.sock`].of[`${this.name}.sock`].emit(Events.PING);
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

            if (existsSync(join(Paths.data(), `${this.name}.sock`))) unlinkSync(join(Paths.data(), `${this.name}.sock`));
        }
    }

    static up() {
        return existsSync(join(Paths.data(), "api.sock"));
    }

    static fetch(event: Events, body: any): Promise<void> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (!existsSync(join(Paths.data(), "api.sock"))) {
                resolve();

                return;
            }

            if (!SOCKETS["api.sock"]) {
                SOCKETS["api.sock"] = new RawIPC.IPC();

                SOCKETS["api.sock"].config.appspace = "/";
                SOCKETS["api.sock"].config.socketRoot = Paths.data();
                SOCKETS["api.sock"].config.logInColor = true;
                SOCKETS["api.sock"].config.logger = Print;
                SOCKETS["api.sock"].config.maxRetries = 0;
                SOCKETS["api.sock"].config.stopRetrying = true;
            }

            SOCKETS["api.sock"].connectTo("api.sock", () => {
                if (VOID_EVENTS.indexOf(event) === -1) {
                    SOCKETS["api.sock"].of["api.sock"].on(session, () => {
                        SOCKETS["api.sock"].of["api.sock"].off(session, "*");
                        SOCKETS["api.sock"].disconnect();

                        resolve();
                    });

                    SOCKETS["api.sock"].of["api.sock"].on("error", () => {
                        SOCKETS["api.sock"].of["api.sock"].off(session, "*");
                        SOCKETS["api.sock"].disconnect();

                        resolve();
                    });
                }

                SOCKETS["api.sock"].of["api.sock"].emit(event, {
                    session,
                    body,
                });

                if (VOID_EVENTS.indexOf(event) >= 0) {
                    resolve();
                }
            });
        });
    }
}
