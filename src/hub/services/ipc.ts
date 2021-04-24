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
import { BridgeProcess } from "../../services/bridges";
import { IPC } from "../../services/ipc";

export default class HubIPC extends EventEmitter implements IPC {
    declare private bridges: { [key: string]: BridgeProcess };

    constructor(bridges: { [key: string]: BridgeProcess }) {
        super();

        this.bridges = bridges;
    }

    public route(): void { }

    public fetch(id: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            if (!this.bridges || !this.bridges[id]) {
                resolve(undefined);
            } else {
                this.bridges[id].socket.fetch(path, params, body).then((response) => resolve(response));
            }
        });
    }
}
