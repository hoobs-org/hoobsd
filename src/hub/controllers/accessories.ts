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

import _ from "lodash";
import { Request, Response } from "express-serve-static-core";
import { writeFileSync } from "fs-extra";
import State from "../../state";
import Socket from "../services/socket";
import Paths from "../../services/paths";

import {
    loadJson,
    jsonEquals,
    formatJson,
    sanitize,
} from "../../services/formatters";

export default class AccessoriesController {
    constructor() {
        State.app?.get("/api/accessories", (request, response) => this.list(request, response));
        State.app?.get("/api/accessories/:bridge", (request, response) => this.list(request, response));
        State.app?.get("/api/accessory/:bridge/:id", (request, response) => this.get(request, response));
        State.app?.get("/api/accessory/:bridge/:id/characteristics", (request, response) => this.characteristics(request, response));
        State.app?.put("/api/accessory/:bridge/:id/:service", (request, response) => this.set(request, response));
        State.app?.get("/api/rooms", (request, response) => this.rooms(request, response));
        State.app?.get("/api/room/:id", (request, response) => this.room(request, response));
        State.app?.delete("/api/room/:id", (request, response) => this.remove(request, response));
        State.app?.put("/api/room/:id/:service", (request, response) => this.update(request, response));
        State.app?.put("/api/room", (request, response) => this.add(request, response));
    }

    get layout(): { [key: string]: any } {
        const key = "accessories/layout";
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        const results: { [key: string]: any } = loadJson<{ [key: string]: any }>(Paths.layout, {});

        results.rooms = results.rooms || [];
        results.accessories = results.accessories || {};

        results.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;

            return 0;
        });

        results.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.sequence < b.sequence) return -1;
            if (a.sequence > b.sequence) return 1;

            return 0;
        });

        State.cache?.set(key, results, 720);

        return results;
    }

    set layout(value: { [key: string]: any }) {
        value.rooms = value.rooms || [];
        value.accessories = value.accessories || {};

        const current: { [key: string]: any } = loadJson<{ [key: string]: any }>(Paths.layout, {});
        const keys = _.keys(value.accessories);

        for (let i = 0; i < keys.length; i += 1) {
            if (value.accessories[keys[i]] === null || value.accessories[keys[i]] === "") {
                delete value.accessories[keys[i]];
            } else if (Object.prototype.toString.call(value.accessories[keys[i]]) === "[object Object]" && Object.entries(value.accessories[keys[i]]).length === 0) {
                delete value.accessories[keys[i]];
            }
        }

        if (!jsonEquals(current, value)) {
            State.cache?.remove("accessories/layout");
            writeFileSync(Paths.layout, formatJson(value));
        }
    }

    async list(request: Request, response: Response): Promise<void> {
        if (request.params.bridge && request.params.bridge !== "") {
            response.send(await Socket.fetch(request.params.bridge, "accessories:list"));
        } else {
            const working = this.layout;
            const accessories = (await this.accessories()).filter((item) => item.type !== "bridge");

            for (let i = 0; i < working.rooms.length; i += 1) {
                working.rooms[i] = this.properties(working.rooms[i], accessories, true, false);
            }

            const unassigned = accessories.filter((item) => !item.room || item.room === "" || item.room === "default");

            if (unassigned.length > 0) {
                working.rooms.push(this.properties({
                    id: "default",
                    sequence: working.rooms.length + 1,
                }, accessories, true, false));
            }

            response.send(working.rooms);
        }
    }

    async get(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.bridge, "accessory:get", { id: request.params.id }));
    }

    async set(request: Request, response: Response): Promise<void> {
        const working = this.layout;

        let room;
        let { value } = request.body;

        if (typeof request.body.value === "boolean") value = request.body.value ? 1 : 0;

        switch (request.params.service) {
            case "room":
                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = [];

                if (typeof value === "string" && value && sanitize(value) !== "default") {
                    room = working.rooms.find((item: { [key: string]: any }) => item.id === sanitize(value));

                    if (!room) {
                        working.rooms.unshift({
                            id: sanitize(value),
                            name: value,
                            sequence: 1,
                        });

                        for (let i = 0; i < working.rooms.length; i += 1) {
                            working.rooms[i].sequence = i + 1;
                        }
                    }

                    working.accessories[request.params.id].room = room.id;
                } else {
                    delete working.accessories[request.params.id].room;
                }

                this.layout = working;
                this.get(request, response);
                break;

            case "sequence":
                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = [];

                if (!Number.isNaN(parseInt(value, 10))) {
                    working.accessories[request.params.id].sequence = parseInt(value, 10);
                } else {
                    delete working.accessories[request.params.id].sequence;
                }

                this.layout = working;
                this.get(request, response);
                break;

            case "hidden":
                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = [];

                if ((typeof value === "boolean" || typeof value === "number") && value) {
                    working.accessories[request.params.id].hidden = true;
                } else {
                    delete working.accessories[request.params.id].hidden;
                }

                this.layout = working;
                this.get(request, response);
                break;

            case "name":
                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = [];

                if (typeof value === "string" && value && value !== "") {
                    working.accessories[request.params.id].name = value;
                } else {
                    delete working.accessories[request.params.id].name;
                }

                this.layout = working;
                this.get(request, response);
                break;

            case "icon":
                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = [];

                if (typeof value === "string" && value && value !== "") {
                    working.accessories[request.params.id].icon = value;
                } else {
                    delete working.accessories[request.params.id].icon;
                }

                this.layout = working;
                this.get(request, response);
                break;

            default:
                response.send(await Socket.fetch(request.params.bridge, "accessory:set", { id: request.params.id, service: request.params.service }, request.body));
                break;
        }
    }

    async characteristics(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.bridge, "accessory:characteristics", { id: request.params.id }));
    }

    async rooms(_request: Request, response: Response): Promise<Response> {
        const working = this.layout;
        const accessories = (await this.accessories()).filter((item) => item.type !== "bridge");

        for (let i = 0; i < working.rooms.length; i += 1) {
            working.rooms[i] = this.properties(working.rooms[i], accessories, false, true);
        }

        const unassigned = accessories.filter((item) => !item.room || item.room === "" || item.room === "default");

        if (unassigned.length > 0) {
            working.rooms.push(this.properties({
                id: "default",
                sequence: working.rooms.length + 1,
            }, accessories, false, true));
        }

        return response.send(working.rooms);
    }

    async room(request: Request, response: Response): Promise<Response> {
        const id = sanitize(request.params.id);
        const working = this.layout;

        let room: { [key: string]: any } | undefined = { id, sequence: working.rooms.length };

        if (id !== "default") room = working.rooms.find((item: { [key: string]: any }) => item.id === id);
        if (!room) return response.send({ error: "room not found" });

        return response.send(this.properties(room, (await this.accessories()).filter((item: { [key: string]: any }) => item.type !== "bridge"), true, true));
    }

    private properties(room: { [key: string]: any }, accessories: { [key: string]: any }[], devices?: boolean, capabilities?: boolean): { [key: string]: any } {
        const assigned = accessories.filter((item: { [key: string]: any }) => {
            if (room.id === "default" && (!item.room || item.room === "" || item.room === "default")) return true;
            if (item.room === room.id) return true;

            return false;
        });

        if (devices) {
            assigned.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;

                return 0;
            });

            assigned.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                if (a.sequence < b.sequence) return -1;
                if (a.sequence > b.sequence) return 1;

                return 0;
            });
        }

        let types: string[] = [];
        let characteristics: string[] = [];

        if (capabilities) {
            types = [...new Set(assigned.map((item: { [key: string]: any }) => item.type))];

            types.sort((a: string, b: string) => {
                if (a < b) return -1;
                if (a > b) return 1;

                return 0;
            });

            for (let i = 0; i < assigned.length; i += 1) {
                characteristics.push(...assigned[i].characteristics.map((item: { [key: string]: any }) => item.type));
            }

            characteristics = [...new Set(characteristics)];

            if (characteristics.indexOf("on") >= 0 && characteristics.indexOf("off") === -1) characteristics.push("off");

            characteristics.sort((a: string, b: string) => {
                if (a < b) return -1;
                if (a > b) return 1;

                return 0;
            });
        }

        if (devices) room.accessories = assigned;
        if (capabilities) room.types = types;
        if (capabilities) room.characteristics = characteristics;

        return room;
    }

    async remove(request: Request, response: Response): Promise<Response> {
        const id = sanitize(request.params.id);
        const working = this.layout;

        const index = working.rooms.findIndex((item: { [key: string]: any }) => item.id === id);

        if (index === -1) return response.send({ error: "room not found" });

        for (let i = 0; i < working.rooms[index].accessories.length; i += 1) {
            if (working.accessories[working.rooms[index].accessories[i].accessory_identifier]) delete working.accessories[working.rooms[index].accessories[i].accessory_identifier].room;
        }

        for (let i = 0; i < working.rooms.length; i += 1) {
            working.rooms[i].sequence = i + 1;
        }

        working.rooms.splice(index!, 1);
        this.layout = working;

        return this.rooms(request, response);
    }

    add(request: Request, response: Response): Response {
        const id = sanitize(request.body.name);
        const working = this.layout;
        const sequence = parseInt(request.body.sequence, 10) || 1;

        if (id === "" || id === "default") return response.send({ error: "invalid room name" });
        if (working.rooms.findIndex((item: { [key: string]: any }) => item.id === id) >= 0) return response.send({ error: "room already exists" });

        for (let i = 0; i < working.rooms.length; i += 1) {
            if (working.rooms[i].sequence >= sequence) working.rooms[i].sequence += 1;
        }

        working.rooms.push({ id, name: request.body.name, sequence });

        working.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;

            return 0;
        });

        working.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.sequence < b.sequence) return -1;
            if (a.sequence > b.sequence) return 1;

            return 0;
        });

        this.layout = working;

        return response.send(working.rooms.find((item: { [key: string]: any }) => item.id === id));
    }

    async update(request: Request, response: Response): Promise<Response> {
        const id = sanitize(request.params.id);
        const working = this.layout;
        const index = working.rooms.findIndex((item: { [key: string]: any }) => item.id === id);

        if (index === -1) return response.send({ error: "room not found" });

        let room: { [key: string]: any } = {};
        let value: any;

        switch (request.params.service) {
            case "name":
                value = request.body.value;

                if (typeof value === "string" && value !== "") working.rooms[index].name = value;

                working.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                    if (a.name < b.name) return -1;
                    if (a.name > b.name) return 1;

                    return 0;
                });

                working.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                    if (a.sequence < b.sequence) return -1;
                    if (a.sequence > b.sequence) return 1;

                    return 0;
                });

                this.layout = working;

                break;

            case "sequence":
                value = parseInt(request.body.value, 10);

                if (!Number.isNaN(value)) {
                    for (let i = 0; i < working.rooms.length; i += 1) {
                        if (working.rooms[i].sequence >= value) working.rooms[i].sequence += 1;
                    }

                    working.rooms[index].sequence = value;
                }

                working.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                    if (a.name < b.name) return -1;
                    if (a.name > b.name) return 1;

                    return 0;
                });

                working.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                    if (a.sequence < b.sequence) return -1;
                    if (a.sequence > b.sequence) return 1;

                    return 0;
                });

                this.layout = working;

                break;

            case "off":
                room = this.properties(working.rooms[index], (await this.accessories()).filter((item) => item.type !== "bridge"), true, true);

                for (let i = 0; i < room.accessories.length; i += 1) {
                    if (this.controllable(room, room.accessories[i], "off")) {
                        response.send(await Socket.fetch(room.accessories[i].bridge, "accessory:set", { id: room.accessories[i].accessory_identifier, service: "on" }, { value: 0 }));
                    }
                }

                break;

            default:
                room = this.properties(working.rooms[index], (await this.accessories()).filter((item) => item.type !== "bridge"), true, true);
                value = request.body.value;

                if (typeof request.body.value === "boolean") value = request.body.value ? 1 : 0;

                for (let i = 0; i < room.accessories.length; i += 1) {
                    if (this.controllable(room, room.accessories[i], request.params.service)) {
                        response.send(await Socket.fetch(room.accessories[i].bridge, "accessory:set", { id: room.accessories[i].accessory_identifier, service: request.params.service }, { value }));
                    }
                }

                break;
        }

        return response.send(working.rooms.find((item: { [key: string]: any }) => item.id === id));
    }

    private controllable(room: { [key: string]: any }, accessory: { [key: string]: any }, service: string): boolean {
        if (room.characteristics.indexOf(service) >= 0) {
            let index = -1;

            switch (service) {
                case "brightness":
                case "saturation":
                case "hue":
                case "on":
                    index = accessory.characteristics.findIndex((item: { [key: string]: any }) => item.type === service);

                    if (index >= 0 && accessory.characteristics[index].write && accessory.type === "lightbulb") return true;

                    break;

                case "off":
                    index = accessory.characteristics.findIndex((item: { [key: string]: any }) => item.type === "on");

                    if (index >= 0 && accessory.characteristics[index].write && (accessory.type === "lightbulb" || accessory.type === "switch")) return true;

                    break;
            }
        }

        return false;
    }

    private async accessories(): Promise<any[]> {
        const working = this.layout;

        let results: any[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type === "bridge") {
                const accessories = await Socket.fetch(State.bridges[i].id, "accessories:list");

                if (accessories) {
                    results = [...results, ...accessories];
                }
            }
        }

        for (let i = 0; i < results.length; i += 1) {
            if (working.accessories[results[i].accessory_identifier]) {
                _.extend(results[i], working.accessories[results[i].accessory_identifier]);
            }
        }

        return results;
    }
}
