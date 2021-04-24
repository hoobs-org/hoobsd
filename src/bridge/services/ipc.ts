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

import { EventEmitter } from "events";
import { IPC, IPCRequest, IPCResponse } from "../../services/ipc";

export default class BridgeIPC extends EventEmitter implements IPC {
    private routes: { [key: string]: (request: IPCRequest, response: IPCResponse) => any } = {};

    constructor() {
        super();

        process.removeAllListeners("message");
        process.on("message", (data) => this.payload(data));
    }

    public route(path: string, next: (request: IPCRequest, response: IPCResponse) => any): void {
        this.routes[path] = next;
    }

    public fetch(): Promise<any> {
        return new Promise((resolve) => resolve(undefined));
    }

    public emit(event: string, data?: any): boolean {
        return process.send ? process.send(this.format(event, data)) : false;
    }

    private payload(data: any): void {
        let message: { [key: string]: any } | undefined;

        try {
            message = JSON.parse(data.toString());
        } catch (error) {
            message = undefined;
        }

        if (message && message.event === "fetch") {
            if (this.routes[message.data.path]) {
                this.routes[message.data.path]({ params: message.data.params, body: message.data.body }, {
                    send: (body: any) => {
                        if (process.send) process.send(this.format(message?.data.session, body));
                    },
                });
            }
        }
    }

    private format(event: string | symbol, data?: any): string {
        try {
            return JSON.stringify({ event, data: (data || data === false || data === 0) ? data : undefined });
        } catch (_error) {
            return JSON.stringify({ event });
        }
    }
}
