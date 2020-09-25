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
import Paths from "../shared/paths";
import { Print } from "../shared/logger";

export default class Socket extends EventEmitter {
    declare private pipe: any;

    declare private terminating: boolean;

    constructor() {
        super();

        this.pipe = new RawIPC.IPC();
        this.pipe.config.logInColor = true;
        this.pipe.config.logger = Print;
        this.pipe.config.appspace = "/";
        this.pipe.config.socketRoot = Paths.storagePath();
        this.pipe.config.id = "api.sock";

        Print("Starting IPC Socket");

        this.pipe.serve(() => {
            this.pipe.server.on("ping", (_payload: any, socket: any) => {
                this.pipe.server.emit(socket, "pong");
            });

            this.pipe.server.on("log", (payload: any, socket: any) => {
                this.emit("log", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.pipe.server.on("bridge_start", (payload: any, socket: any) => {
                this.emit("bridge_start", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.pipe.server.on("bridge_stop", (payload: any, socket: any) => {
                this.emit("bridge_stop", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.pipe.server.on("accessory_change", (payload: any, socket: any) => {
                this.emit("accessory_change", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.pipe.server.on("heartbeat", (payload: any, socket: any) => {
                this.emit("heartbeat", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.pipe.server.on("plugin_install", (payload: any, socket: any) => {
                this.emit("plugin_install", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.pipe.server.on("plugin_uninstall", (payload: any, socket: any) => {
                this.emit("plugin_install", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.pipe.server.on("plugin_upgrade", (payload: any, socket: any) => {
                this.emit("plugin_uninstall", payload.body);
                this.pipe.server.emit(socket, payload.socket, "complete");
            });

            this.heartbeat();
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

        pipe.connectTo("api.sock", () => {
            pipe.of["api.sock"].on("pong", () => {
                pipe.of["api.sock"].off("pong", "*");
            });

            pipe.of["api.sock"].on("error", () => {
                pipe.of["api.sock"].off("pong", "*");
                pipe.disconnect("api.sock");

                Print("Restarting IPC Socket");

                this.pipe.server.stop();
                this.pipe.server.start();
            });

            pipe.of["api.sock"].emit("ping");

            if (!this.terminating) {
                setTimeout(() => {
                    this.heartbeat();
                }, 5 * 1000);
            }
        });
    }

    start(): void {
        this.terminating = false;
        this.pipe.server.start();
    }

    stop() {
        this.terminating = true;
        this.pipe.server.stop();
    }

    static fetch(instance: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;
            const pipe = new RawIPC.IPC();

            pipe.config.appspace = "/";
            pipe.config.socketRoot = Paths.storagePath();
            pipe.config.logInColor = true;
            pipe.config.logger = Print;
            pipe.config.maxRetries = 0;
            pipe.config.stopRetrying = true;

            pipe.connectTo(`${instance}.sock`, () => {
                pipe.of[`${instance}.sock`].on(session, (data: any) => {
                    pipe.of[`${instance}.sock`].off(session, "*");

                    resolve(data);
                });

                pipe.of[`${instance}.sock`].on("error", () => {
                    pipe.of[`${instance}.sock`].off(session, "*");
                    pipe.disconnect(`${instance}.sock`);

                    resolve();
                });

                pipe.of[`${instance}.sock`].emit("request", {
                    path,
                    session,
                    params,
                    body,
                });
            });
        });
    }
}
