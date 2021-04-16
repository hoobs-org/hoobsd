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

import { IPCRequest, IPCResponse } from "@hoobs/ipc";
import State from "../../state";
import { Console } from "../../services/logger";

export default class AccessoriesController {
    declare rooms: any[];

    constructor() {
        this.rooms = [];

        State.socket?.route("accessories:list", (request, response) => this.list(request, response));
        State.socket?.route("accessory:get", (request, response) => this.get(request, response));
        State.socket?.route("accessory:set", (request, response) => this.set(request, response));
        State.socket?.route("accessory:characteristics", (request, response) => this.characteristics(request, response));
    }

    list(_request: IPCRequest, response: IPCResponse): void {
        this.services().then((accessories) => {
            response.send(accessories);
        });
    }

    get(request: IPCRequest, response: IPCResponse): void {
        let accessory = {};

        this.service(request.params?.id).then((results) => {
            accessory = results;
        }).finally(() => response.send(accessory));
    }

    set(request: IPCRequest, response: IPCResponse): void {
        let accessory: { [key: string]: any } = {};

        this.service(request.params?.id).then((service) => {
            Console.debug(`Update - ${request.params?.service}: ${request.body.value} (${typeof request.body.value})`);

            service.set(request.params?.service, request.body.value).then((results: any) => {
                accessory = results;
            }).finally(() => {
                accessory.refresh().finally(() => response.send(accessory));
            });
        }).catch(() => response.send(accessory));
    }

    characteristics(request: IPCRequest, response: IPCResponse): void {
        let results: string[] = [];

        this.service(request.params?.id).then((service) => {
            results = service.characteristics.map((characteristic: any) => characteristic.type);

            results.sort((a: string, b: string) => {
                if (a < b) return -1;
                if (a > b) return 1;

                return 0;
            });
        }).finally(() => response.send(results));
    }

    service(id: string): Promise<any> {
        return new Promise((resolve) => {
            State.homebridge?.client.accessory(State.id, id).then((response: any) => {
                if (!response) {
                    resolve(undefined);

                    return;
                }

                resolve(response);
            });
        });
    }

    services(): Promise<{ [key: string]: any }[]> {
        return new Promise((resolve) => {
            State.homebridge?.client.accessories(State.id).then((services: { [key: string]: any }[]) => {
                if (!services) {
                    resolve([]);

                    return;
                }

                if (!Array.isArray(services)) services = [services];

                resolve(<{ [key: string]: any }[]> services);
            });
        });
    }
}
