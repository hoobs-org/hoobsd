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
import { Events } from "../../services/logger";

const PING_INTERVAL = 5000;
const SOCKETS: { [key: string]: any } = {};

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
        this.pipe.config.logger = () => {};
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
        const socket = Socket.connect(`${this.name}.sock`);

        socket.connectTo(`${this.name}.sock`, () => {
            socket.of[`${this.name}.sock`].on(Events.PONG, () => {
                socket.of[`${this.name}.sock`].off(Events.PONG, "*");
                socket.disconnect();

                setTimeout(() => {
                    this.heartbeat();
                }, PING_INTERVAL);
            });

            socket.of[`${this.name}.sock`].on("error", () => {
                socket.of[`${this.name}.sock`].off(Events.PONG, "*");
                socket.disconnect();

                this.stop();
                this.start();
            });

            socket.of[`${this.name}.sock`].emit(Events.PING);
        });
    }

    route(path: string, controller: (request: SocketRequest, response: SocketResponse) => any) {
        this.routes[path] = controller;
    }

    start(): void {
        if (!this.running) {
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

    static connect(name: string): any {
        if (!SOCKETS[name]) {
            SOCKETS[name] = new RawIPC.IPC();

            SOCKETS[name].config.appspace = "/";
            SOCKETS[name].config.socketRoot = Paths.data();
            SOCKETS[name].config.logInColor = true;
            SOCKETS[name].config.logger = () => {};
            SOCKETS[name].config.maxRetries = 0;
            SOCKETS[name].config.stopRetrying = true;
            SOCKETS[name].config.id = name;
        }

        return SOCKETS[name];
    }

    static up() {
        return existsSync(join(Paths.data(), "api.sock"));
    }

    static emit(event: Events, body: any): void {
        if (!existsSync(join(Paths.data(), "api.sock"))) return;

        const session = `${new Date().getTime()}:${Math.random()}`;
        const socket = Socket.connect("api.sock");

        socket.connectTo("api.sock", () => {
            socket.of["api.sock"].emit(event, {
                session,
                body,
            });
        });
    }

    static fetch(event: Events, body: any): Promise<void> {
        return new Promise((resolve) => {
            if (!existsSync(join(Paths.data(), "api.sock"))) {
                resolve();

                return;
            }

            const session = `${new Date().getTime()}:${Math.random()}`;
            const socket = Socket.connect("api.sock");

            socket.connectTo("api.sock", () => {
                socket.of["api.sock"].on(session, () => {
                    socket.of["api.sock"].off(session, "*");
                    socket.disconnect();

                    resolve();
                });

                socket.of["api.sock"].on("error", () => {
                    socket.of["api.sock"].off(session, "*");
                    socket.disconnect();

                    resolve();
                });

                socket.of["api.sock"].emit(event, {
                    session,
                    body,
                });
            });
        });
    }
}
