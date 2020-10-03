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
import Paths from "../services/paths";
import { Print, Events } from "../services/logger";

const sockets: { [key: string]: any } = [];

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
        if (!sockets["api.sock"]) {
            sockets["api.sock"] = new RawIPC.IPC();

            sockets["api.sock"].config.appspace = "/";
            sockets["api.sock"].config.socketRoot = Paths.storagePath();
            sockets["api.sock"].config.logInColor = true;
            sockets["api.sock"].config.logger = () => {};
            sockets["api.sock"].config.maxRetries = 0;
            sockets["api.sock"].config.stopRetrying = true;
        }

        sockets["api.sock"].connectTo("api.sock", () => {
            sockets["api.sock"].of["api.sock"].on(Events.PONG, () => {
                sockets["api.sock"].of["api.sock"].off(Events.PONG, "*");
                sockets["api.sock"].disconnect();

                setTimeout(() => {
                    this.heartbeat();
                }, 5 * 1000);
            });

            sockets["api.sock"].of["api.sock"].on("error", () => {
                sockets["api.sock"].of["api.sock"].off(Events.PONG, "*");
                sockets["api.sock"].disconnect();

                Print("Restarting IPC Socket");

                this.stop();
                this.start();
            });

            sockets["api.sock"].of["api.sock"].emit(Events.PING);
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
                resolve();

                return;
            }

            if (!sockets[`${instance}.sock`]) {
                sockets[`${instance}.sock`] = new RawIPC.IPC();

                sockets[`${instance}.sock`].config.appspace = "/";
                sockets[`${instance}.sock`].config.socketRoot = Paths.storagePath();
                sockets[`${instance}.sock`].config.logInColor = true;
                sockets[`${instance}.sock`].config.logger = Print;
                sockets[`${instance}.sock`].config.maxRetries = 0;
                sockets[`${instance}.sock`].config.stopRetrying = true;
            }

            sockets[`${instance}.sock`].connectTo(`${instance}.sock`, () => {
                sockets[`${instance}.sock`].of[`${instance}.sock`].on(session, (data: any) => {
                    sockets[`${instance}.sock`].of[`${instance}.sock`].off(session, "*");
                    sockets[`${instance}.sock`].disconnect();

                    resolve(data);
                });

                sockets[`${instance}.sock`].of[`${instance}.sock`].on("error", () => {
                    sockets[`${instance}.sock`].of[`${instance}.sock`].off(session, "*");
                    sockets[`${instance}.sock`].disconnect();

                    resolve();
                });

                sockets[`${instance}.sock`].of[`${instance}.sock`].emit(Events.REQUEST, {
                    path,
                    session,
                    params,
                    body,
                });
            });
        });
    }
}
