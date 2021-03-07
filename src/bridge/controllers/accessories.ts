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

    constructor() {
        this.rooms = [];

        State.socket?.route("accessories:list", (request: SocketRequest, response: SocketResponse) => this.list(request, response));
        State.socket?.route("accessory:get", (request: SocketRequest, response: SocketResponse) => this.get(request, response));
        State.socket?.route("accessory:set", (request: SocketRequest, response: SocketResponse) => this.set(request, response));
        State.socket?.route("accessory:characteristics", (request: SocketRequest, response: SocketResponse) => this.characteristics(request, response));
    }

    list(_request: SocketRequest, response: SocketResponse): void {
        this.services().then((accessories) => {
            response.send(accessories);
        });
    }

    get(request: SocketRequest, response: SocketResponse): void {
        let accessory = {};

        this.service(request.params?.id).then((results) => {
            accessory = results;
        }).finally(() => response.send(accessory));
    }

    set(request: SocketRequest, response: SocketResponse): void {
        let accessory = {};

        this.service(request.params?.id).then((service) => {
            Console.debug(`Update - ${request.params?.service}: ${request.body.value} (${typeof request.body.value})`);

            service.set(request.params?.service, request.body.value).then((results: any) => {
                accessory = results;
            }).finally(() => response.send(accessory));
        }).catch(() => response.send(accessory));
    }

    characteristics(request: SocketRequest, response: SocketResponse): void {
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
                if (response) {
                    response.refresh((results: any) => {
                        response.values = results.values;
                    }).finally(() => resolve(<{ [key: string]: any }> this.cleanse(response)));
                } else {
                    resolve(undefined);
                }
            });
        });
    }

    cleanse(value: { [key: string]: any } | { [key: string]: any }[]): { [key: string]: any } | { [key: string]: any }[] {
        if (Array.isArray(value)) {
            const results: { [key: string]: any }[] = [];

            for (let i = 0; i < value.length; i += 1) {
                results.push(<{ [key: string]: any }> this.cleanse(value[i]));
            }

            return results;
        }

        return { ...value };
    }

    services(): Promise<{ [key: string]: any }[]> {
        return new Promise((resolve) => {
            State.homebridge?.client.accessories(State.id).then((services: { [key: string]: any }[]) => {
                if (!services) resolve([]);
                if (!Array.isArray(services)) services = [services];

                const queue: Promise<void>[] = [];

                for (let i = 0; i < services.length; i += 1) {
                    queue.push(new Promise((complete) => {
                        services[i].refresh((results: { [key: string]: any }) => {
                            services[i].values = results.values;
                        }).finally(() => {
                            complete();
                        });
                    }));
                }

                Promise.all(queue).then(() => {
                    services = [...services];

                    resolve(<{ [key: string]: any }[]> this.cleanse(services));
                });
            });
        });
    }
}
