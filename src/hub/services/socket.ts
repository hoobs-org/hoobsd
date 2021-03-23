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
import { EventEmitter } from "events";
import { existsSync, unlinkSync } from "fs-extra";
import { join } from "path";
import Paths from "../../services/paths";
import { Events } from "../../services/logger";

const SOCKETS: { [key: string]: any } = {};
const PING_INTERVAL = 5000;

export default class Socket extends EventEmitter {
    declare private pipe: any;

    declare private defined: boolean;

    constructor() {
        super();

        this.defined = false;

        this.pipe = new RawIPC.IPC();
        this.pipe.config.logInColor = true;
        this.pipe.config.logger = () => {};
        this.pipe.config.appspace = "/";
        this.pipe.config.socketRoot = Paths.data();
        this.pipe.config.id = "api.sock";

        this.pipe.serve(() => {
            if (!this.defined) {
                this.pipe.server.on(Events.PING, (_payload: any, socket: any) => {
                    this.pipe.server.emit(socket, Events.PONG);
                });

                this.pipe.server.on(Events.LOG, (payload: any, socket: any) => {
                    this.emit(Events.LOG, payload.body);
                    this.pipe.server.emit(socket, payload.session, Events.COMPLETE);
                });

                this.pipe.server.on(Events.NOTIFICATION, (payload: any, socket: any) => {
                    this.emit(Events.NOTIFICATION, payload.body);
                    this.pipe.server.emit(socket, payload.session, Events.COMPLETE);
                });

                this.pipe.server.on(Events.ACCESSORY_CHANGE, (payload: any, socket: any) => {
                    this.emit(Events.ACCESSORY_CHANGE, payload.body);
                    this.pipe.server.emit(socket, payload.session, Events.COMPLETE);
                });

                this.pipe.server.on(Events.HEARTBEAT, (payload: any, socket: any) => {
                    this.emit(Events.HEARTBEAT, payload.body);
                    this.pipe.server.emit(socket, payload.session, Events.COMPLETE);
                });

                this.pipe.server.on(Events.RESTART, (payload: any, socket: any) => {
                    this.emit(Events.RESTART, payload.body);
                    this.pipe.server.emit(socket, payload.session, Events.COMPLETE);
                });
            }

            this.heartbeat();
            this.defined = true;
        });
    }

    heartbeat() {
        const socket = Socket.connect("api.sock");

        socket.connectTo("api.sock", () => {
            socket.of["api.sock"].on(Events.PONG, () => {
                socket.of["api.sock"].off(Events.PONG, "*");
                socket.disconnect();

                setTimeout(() => {
                    this.heartbeat();
                }, PING_INTERVAL);
            });

            socket.of["api.sock"].on("error", () => {
                socket.of["api.sock"].off(Events.PONG, "*");
                socket.disconnect();

                this.stop();
                this.start();
            });

            socket.of["api.sock"].emit(Events.PING);
        });
    }

    start(): void {
        this.pipe.server.start();
    }

    stop() {
        this.pipe.server.stop();

        if (existsSync(join(Paths.data(), "api.sock"))) unlinkSync(join(Paths.data(), "api.sock"));
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

    static emit(bridge: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): void {
        if (!existsSync(join(Paths.data(), `${bridge}.sock`))) return;

        const session = `${new Date().getTime()}:${Math.random()}`;
        const socket = Socket.connect(`${bridge}.sock`);

        socket.connectTo(`${bridge}.sock`, () => {
            socket.of[`${bridge}.sock`].emit(Events.REQUEST, {
                path,
                session,
                params,
                body,
            });
        });
    }

    static fetch(bridge: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            if (!existsSync(join(Paths.data(), `${bridge}.sock`))) {
                resolve(null);

                return;
            }

            const session = `${new Date().getTime()}:${Math.random()}`;
            const socket = Socket.connect(`${bridge}.sock`);

            socket.connectTo(`${bridge}.sock`, () => {
                socket.of[`${bridge}.sock`].on(session, (data: any) => {
                    socket.of[`${bridge}.sock`].off(session, "*");
                    socket.disconnect();

                    resolve(data);
                });

                socket.of[`${bridge}.sock`].on("error", () => {
                    socket.of[`${bridge}.sock`].off(session, "*");
                    socket.disconnect();

                    resolve(null);
                });

                socket.of[`${bridge}.sock`].emit(Events.REQUEST, {
                    path,
                    session,
                    params,
                    body,
                });
            });
        });
    }
}
