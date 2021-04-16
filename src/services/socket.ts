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

import {
    IPCServer,
    IPCClient,
    IPCRequest,
    IPCResponse,
} from "@hoobs/ipc";

import { existsSync } from "fs-extra";
import { join } from "path";
import Paths from "./paths";
import { Events } from "./logger";

export default class Socket {
    declare private server: IPCServer;

    declare private clients: { [key: string]: IPCClient };

    constructor(id: string) {
        this.clients = {};

        this.server = new IPCServer({
            id,
            root: `${Paths.data()}/`,
            maxConnections: 200,
        });
    }

    public on(event: Events, listener: (...args: any[]) => void): void {
        this.server.on(event, listener);
    }

    public start() {
        this.server.start();
    }

    public stop() {
        this.server.stop();
    }

    public route(path: string, next: (request: IPCRequest, response: IPCResponse) => any): void {
        this.server.route(path, next);
    }

    public emit(id: string, event: string, data?: any): Promise<void> {
        return new Promise((resolve) => {
            const socket = this.connect(id);

            if (!socket) {
                resolve();
            } else {
                socket.emit(event, data).then(() => {
                    resolve();
                });
            }
        });
    }

    public fetch(id: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            const socket = this.connect(id);

            if (!socket) {
                resolve(undefined);
            } else {
                socket.fetch(path, params, body).then((response) => {
                    resolve(response);
                });
            }
        });
    }

    private connect(id: string): IPCClient | undefined {
        if (!existsSync(join(Paths.data(), `${id}.sock`))) return undefined;
        if (!this.clients[id]) this.clients[id] = new IPCClient({ id, root: `${Paths.data()}/` });

        return this.clients[id];
    }
}
