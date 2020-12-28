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
        this.pipe.config.socketRoot = Paths.storagePath();
        this.pipe.config.id = "api.sock";

        this.pipe.serve(() => {
            if (!this.defined) {
                this.pipe.server.on(Events.PING, (_payload: any, socket: any) => {
                    this.pipe.server.emit(socket, Events.PONG);
                });

                this.pipe.server.on(Events.LOG, (payload: any, socket: any) => {
                    this.emit(Events.LOG, payload.body);
                    this.pipe.server.emit(socket, payload.socket, Events.COMPLETE);
                });

                this.pipe.server.on(Events.NOTIFICATION, (payload: any, socket: any) => {
                    this.emit(Events.NOTIFICATION, payload.body);
                    this.pipe.server.emit(socket, payload.socket, Events.COMPLETE);
                });

                this.pipe.server.on(Events.ACCESSORY_CHANGE, (payload: any, socket: any) => {
                    this.emit(Events.ACCESSORY_CHANGE, payload.body);
                    this.pipe.server.emit(socket, payload.socket, Events.COMPLETE);
                });

                this.pipe.server.on(Events.HEARTBEAT, (payload: any, socket: any) => {
                    this.emit(Events.HEARTBEAT, payload.body);
                    this.pipe.server.emit(socket, payload.socket, Events.COMPLETE);
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
            SOCKETS["api.sock"].config.socketRoot = Paths.storagePath();
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

        if (existsSync(join(Paths.storagePath(), "api.sock"))) unlinkSync(join(Paths.storagePath(), "api.sock"));
    }

    static fetch(instance: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (!existsSync(join(Paths.storagePath(), `${instance}.sock`))) {
                resolve(null);

                return;
            }

            if (!SOCKETS[`${instance}.sock`]) {
                SOCKETS[`${instance}.sock`] = new RawIPC.IPC();

                SOCKETS[`${instance}.sock`].config.appspace = "/";
                SOCKETS[`${instance}.sock`].config.socketRoot = Paths.storagePath();
                SOCKETS[`${instance}.sock`].config.logInColor = true;
                SOCKETS[`${instance}.sock`].config.logger = Print;
                SOCKETS[`${instance}.sock`].config.maxRetries = 0;
                SOCKETS[`${instance}.sock`].config.stopRetrying = true;
            }

            SOCKETS[`${instance}.sock`].connectTo(`${instance}.sock`, () => {
                SOCKETS[`${instance}.sock`].of[`${instance}.sock`].on(session, (data: any) => {
                    SOCKETS[`${instance}.sock`].of[`${instance}.sock`].off(session, "*");
                    SOCKETS[`${instance}.sock`].disconnect();

                    resolve(data);
                });

                SOCKETS[`${instance}.sock`].of[`${instance}.sock`].on("error", () => {
                    SOCKETS[`${instance}.sock`].of[`${instance}.sock`].off(session, "*");
                    SOCKETS[`${instance}.sock`].disconnect();

                    resolve(null);
                });

                SOCKETS[`${instance}.sock`].of[`${instance}.sock`].emit(Events.REQUEST, {
                    path,
                    session,
                    params,
                    body,
                });
            });
        });
    }
}
