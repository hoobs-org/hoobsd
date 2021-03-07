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
import { Print, Events } from "../../services/logger";

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
        this.pipe.config.logger = Print;
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
        if (!SOCKETS["api.sock"]) {
            SOCKETS["api.sock"] = new RawIPC.IPC();

            SOCKETS["api.sock"].config.appspace = "/";
            SOCKETS["api.sock"].config.socketRoot = Paths.data();
            SOCKETS["api.sock"].config.logInColor = true;
            SOCKETS["api.sock"].config.logger = () => {};
            SOCKETS["api.sock"].config.maxRetries = 0;
            SOCKETS["api.sock"].config.stopRetrying = true;
        }

        SOCKETS["api.sock"].connectTo("api.sock", () => {
            SOCKETS["api.sock"].of["api.sock"].on(Events.PONG, () => {
                SOCKETS["api.sock"].of["api.sock"].off(Events.PONG, "*");
                SOCKETS["api.sock"].disconnect();

                setTimeout(() => {
                    this.heartbeat();
                }, PING_INTERVAL);
            });

            SOCKETS["api.sock"].of["api.sock"].on("error", () => {
                SOCKETS["api.sock"].of["api.sock"].off(Events.PONG, "*");
                SOCKETS["api.sock"].disconnect();

                Print("Restarting IPC Socket");

                this.stop();
                this.start();
            });

            SOCKETS["api.sock"].of["api.sock"].emit(Events.PING);
        });
    }

    start(): void {
        Print("Starting IPC Socket");

        this.pipe.server.start();
    }

    stop() {
        this.pipe.server.stop();

        if (existsSync(join(Paths.data(), "api.sock"))) unlinkSync(join(Paths.data(), "api.sock"));
    }

    static fetch(bridge: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (!existsSync(join(Paths.data(), `${bridge}.sock`))) {
                resolve(null);

                return;
            }

            if (!SOCKETS[`${bridge}.sock`]) {
                SOCKETS[`${bridge}.sock`] = new RawIPC.IPC();

                SOCKETS[`${bridge}.sock`].config.appspace = "/";
                SOCKETS[`${bridge}.sock`].config.socketRoot = Paths.data();
                SOCKETS[`${bridge}.sock`].config.logInColor = true;
                SOCKETS[`${bridge}.sock`].config.logger = Print;
                SOCKETS[`${bridge}.sock`].config.maxRetries = 0;
                SOCKETS[`${bridge}.sock`].config.stopRetrying = true;
            }

            SOCKETS[`${bridge}.sock`].connectTo(`${bridge}.sock`, () => {
                SOCKETS[`${bridge}.sock`].of[`${bridge}.sock`].on(session, (data: any) => {
                    SOCKETS[`${bridge}.sock`].of[`${bridge}.sock`].off(session, "*");
                    SOCKETS[`${bridge}.sock`].disconnect();

                    resolve(data);
                });

                SOCKETS[`${bridge}.sock`].of[`${bridge}.sock`].on("error", () => {
                    SOCKETS[`${bridge}.sock`].of[`${bridge}.sock`].off(session, "*");
                    SOCKETS[`${bridge}.sock`].disconnect();

                    resolve(null);
                });

                SOCKETS[`${bridge}.sock`].of[`${bridge}.sock`].emit(Events.REQUEST, {
                    path,
                    session,
                    params,
                    body,
                });
            });
        });
    }
}
