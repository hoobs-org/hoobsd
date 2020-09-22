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
import { Print } from "../shared/logger";

export function command(instance: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
    return new Promise((resolve) => {
        const session = `${new Date().getTime()}:${Math.random()}`;
        const pipe = new RawIPC.IPC();

        pipe.config.logInColor = false;
        pipe.config.logger = Print;
        pipe.config.maxRetries = 3;
        pipe.config.stopRetrying = true;
        pipe.config.retry = 1000;

        pipe.connectTo(`${instance}.hoobs.bridge`, () => {
            pipe.of[`${instance}.hoobs.bridge`].on(session, (data: any) => {
                pipe.disconnect(`${instance}.hoobs.bridge`);

                resolve(data);
            });

            pipe.of[`${instance}.hoobs.bridge`].on("error", () => {
                resolve();
            });

            pipe.of[`${instance}.hoobs.bridge`].emit("request", {
                path,
                session,
                params,
                body,
            });
        });
    });
}

export default class Socket extends EventEmitter {
    declare private pipe: any;

    constructor() {
        super();

        this.pipe = new RawIPC.IPC();
        this.pipe.config.logInColor = false;
        this.pipe.config.logger = Print;
        this.pipe.config.id = "api.hoobs.bridge";

        this.pipe.serve("/tmp/app.api.hoobs.bridge", () => {
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
        });

        this.pipe.config.retry = 1500;
    }

    start(): void {
        this.pipe.server.start();
    }

    stop() {
        this.pipe.server.stop();
    }
}
