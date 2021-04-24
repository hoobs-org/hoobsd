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

export interface IPCRequest {
    params?: { [key: string]: any };
    body?: any;
}

export interface IPCResponse {
    send: (body: any) => void;
}

export interface IPC extends EventEmitter {
    route: (path: string, next: (request: IPCRequest, response: IPCResponse) => any) => void;
    fetch: (id: string, path: string, params?: { [key: string]: any }, body?: { [key: string]: any }) => Promise<any>;
}
