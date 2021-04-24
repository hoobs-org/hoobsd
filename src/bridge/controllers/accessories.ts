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
import { IPCRequest, IPCResponse } from "../../services/ipc";

export default class AccessoriesController {
    declare rooms: any[];

    constructor() {
        this.rooms = [];

        State.ipc?.route("accessories:list", (request, response) => this.list(request, response));
        State.ipc?.route("accessory:get", (request, response) => this.get(request, response));
        State.ipc?.route("accessory:set", (request, response) => this.set(request, response));
        State.ipc?.route("accessory:stream", (request, response) => this.stream(request, response));
        State.ipc?.route("accessory:snapshot", (request, response) => this.snapshot(request, response));
        State.ipc?.route("accessory:characteristics", (request, response) => this.characteristics(request, response));
    }

    list(_request: IPCRequest, response: IPCResponse): void {
        response.send(State.homebridge?.accessories.list() || []);
    }

    get(request: IPCRequest, response: IPCResponse): void {
        response.send(State.homebridge?.accessories.get(request.params?.id));
    }

    set(request: IPCRequest, response: IPCResponse): void {
        const service = State.homebridge?.accessories.get(request.params?.id);

        if (service) {
            Console.debug(`Update - ${request.params?.service}: ${request.body.value} (${typeof request.body.value})`);

            service.set(request.params?.service, request.body.value);
            response.send(service.refresh());
        } else {
            response.send(undefined);
        }
    }

    stream(request: IPCRequest, response: IPCResponse): void {
        const accessory = State.homebridge?.accessories.get(request.params?.id);

        if (!accessory || accessory.type !== "camera") {
            response.send(undefined);
        } else {
            response.send(accessory.stream());
        }
    }

    snapshot(request: IPCRequest, response: IPCResponse): void {
        const accessory = State.homebridge?.accessories.get(request.params?.id);

        if (!accessory || accessory.type !== "camera") {
            response.send(undefined);
        } else {
            accessory.snapshot().then((data: string) => response.send(data));
        }
    }

    characteristics(request: IPCRequest, response: IPCResponse): void {
        const service = State.homebridge?.accessories.get(request.params?.id);
        const results = service?.characteristics.map((characteristic: any) => characteristic.type);

        results.sort((a: string, b: string) => {
            if (a < b) return -1;
            if (a > b) return 1;

            return 0;
        });

        response.send(results);
    }
}
