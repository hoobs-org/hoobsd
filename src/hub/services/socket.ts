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

import { ChildProcess } from "child_process";
import IPC from "./ipc";
import Bridges from "../../services/bridges";

export default class Socket {
    private ipc: IPC;

    private forked: ChildProcess;

    constructor(ipc: IPC, forked: ChildProcess) {
        this.ipc = ipc;
        this.forked = forked;

        this.forked.removeAllListeners("message");
        this.forked.on("message", (data) => this.payload(data));
    }

    public get up(): boolean {
        try {
            return process.kill(this.forked.pid, 0) || false;
        } catch (_error) {
            return false;
        }
    }

    public emit(event: string, data?: any): boolean {
        if (!this.up) return false;

        return this.forked.send(this.format(event, data));
    }

    public fetch(path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (this.up) {
                let timeout: NodeJS.Timeout | undefined;

                this.ipc.removeAllListeners(session);

                this.ipc.on(session, (data) => {
                    if (timeout) clearTimeout(timeout);

                    resolve(data);
                });

                if (Bridges.running(this.forked.pid)) {
                    this.forked.send(this.format("fetch", {
                        path,
                        session,
                        params,
                        body,
                    }));

                    timeout = setTimeout(() => resolve(undefined), 10 * 1000);
                } else {
                    if (timeout) clearTimeout(timeout);

                    resolve(undefined);
                }
            } else {
                resolve(undefined);
            }
        });
    }

    private payload(data: any): void {
        let message: { [key: string]: any } | undefined;

        try {
            message = JSON.parse(data.toString());
        } catch (error) {
            message = undefined;
        }

        if (message) this.ipc.emit(message.event, message.data);
    }

    private format(event: string | symbol, data?: any): string {
        try {
            return JSON.stringify({ event, data: (data || data === false || data === 0) ? data : undefined });
        } catch (_error) {
            return JSON.stringify({ event });
        }
    }
}
