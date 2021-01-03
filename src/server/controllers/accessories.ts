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

import State from "../../state";
import { Console } from "../../services/logger";
import { SocketRequest, SocketResponse } from "../services/socket";

export default class AccessoriesController {
    declare rooms: any[];

    declare accessories: any[];

    constructor() {
        this.rooms = [];
        this.accessories = [];

        State.socket?.route("accessories:list", (request: SocketRequest, response: SocketResponse) => this.list(request, response));
        State.socket?.route("accessory:get", (request: SocketRequest, response: SocketResponse) => this.get(request, response));
        State.socket?.route("accessory:service", (request: SocketRequest, response: SocketResponse) => this.set(request, response));
    }

    list(_request: SocketRequest, response: SocketResponse): void {
        this.services().then((accessories) => {
            this.accessories = accessories;
        }).finally(() => response.send(this.accessories));
    }

    get(request: SocketRequest, response: SocketResponse): void {
        let accessory = {};

        this.service(`${parseInt((`${request.params?.id}`).split(".")[0], 10)}`).then((results) => {
            accessory = results;
        }).finally(() => response.send(accessory));
    }

    set(request: SocketRequest, response: SocketResponse): void {
        let accessory = {};

        this.service(`${parseInt((`${request.params?.id}`).split(".")[0], 10)}`).then((service) => {
            let { value } = request.body;

            if (typeof request.body.value === "boolean") value = request.body.value ? 1 : 0;

            Console.debug(`Update - ${request.params?.service}: ${value} (${typeof value})`);

            service.set(parseInt(request.params?.service, 10), value).then((results: any) => {
                accessory = results;
            }).finally(() => response.send(accessory));
        }).catch(() => response.send(accessory));
    }

    service(id: string): Promise<any> {
        return new Promise((resolve, reject) => {
            State.homebridge?.client.accessory(id).then((response: any) => {
                const service = response;

                service.refresh((results: any) => {
                    service.values = results.values;
                }).finally(() => resolve(service));
            }).catch((error: Error) => reject(error));
        });
    }

    uuid(services: any[]) {
        const lookup: { [key: string]: number } = {};

        const results: any[] = services;

        for (let i = 0; i < results.length; i += 1) {
            const { aid } = results[i];

            if (lookup[aid]) results[i].aid = parseFloat(`${aid}.${lookup[aid]}`);

            if (!lookup[aid]) {
                lookup[aid] = 1;
            } else {
                lookup[aid] += 1;
            }
        }

        return results;
    }

    services(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            let services: any[] = [];

            State.homebridge?.client.accessories().then((results: any) => {
                services = results;
            }).finally(() => {
                if (!services) resolve([]);
                if (!Array.isArray(services)) services = [services];

                const queue: boolean[] = [];

                for (let i = 0; i < services.length; i += 1) {
                    queue.push(true);

                    services[i].refresh((results: any) => {
                        services[i].values = results.values;
                    }).finally(() => {
                        queue.pop();

                        if (queue.length === 0) resolve(this.uuid(services));
                    });
                }

                if (queue.length === 0) resolve(this.uuid(services));
            }).catch((error: Error) => reject(error));
        });
    }
}
