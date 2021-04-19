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
import ffmpeg from "fluent-ffmpeg";
import { Request, Response } from "express-serve-static-core";
import State from "../../state";
import Security from "../../services/security";
import Paths from "../../services/paths";
import { Console, Events } from "../../services/logger";
import { jsonEquals } from "../../services/json";
import { sanitize } from "../../services/formatters";

export default class AccessoriesController {
    constructor() {
        State.app?.get("/api/accessories", Security, (request, response) => this.list(request, response));
        State.app?.get("/api/accessories/hidden", Security, (request, response) => this.hidden(request, response));
        State.app?.get("/api/accessories/:bridge", Security, (request, response) => this.list(request, response));
        State.app?.get("/api/accessory/:bridge/:id", Security, (request, response) => this.get(request, response));
        State.app?.get("/api/accessory/:bridge/:id/stream", (request, response) => this.stream(request, response));
        State.app?.get("/api/accessory/:bridge/:id/snapshot", Security, (request, response) => this.snapshot(request, response));
        State.app?.get("/api/accessory/:bridge/:id/characteristics", Security, (request, response) => this.characteristics(request, response));
        State.app?.put("/api/accessory/:bridge/:id/:service", Security, (request, response) => this.set(request, response));
        State.app?.get("/api/rooms", Security, (request, response) => this.rooms(request, response));
        State.app?.get("/api/room/:id", Security, (request, response) => this.room(request, response));
        State.app?.delete("/api/room/:id", Security, (request, response) => this.remove(request, response));
        State.app?.put("/api/room/:id/:service", Security, (request, response) => this.update(request, response));
        State.app?.put("/api/room", Security, (request, response) => this.add(request, response));
    }

    static get layout(): { [key: string]: any } {
        const key = "accessories/layout";
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        const results: { [key: string]: any } = Paths.loadJson<{ [key: string]: any }>(Paths.layout, {});

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

    static set layout(value: { [key: string]: any }) {
        value.rooms = value.rooms || [];
        value.accessories = value.accessories || {};

        const current: { [key: string]: any } = Paths.loadJson<{ [key: string]: any }>(Paths.layout, {});
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
            Paths.saveJson(Paths.layout, value);
        }
    }

    async list(request: Request, response: Response): Promise<void> {
        if (request.params.bridge && request.params.bridge !== "") {
            const assigned = (await this.accessories(request.params.bridge)).filter((item) => item.type !== "bridge" && !item.hidden);

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

            response.send(assigned);
        } else {
            const working = AccessoriesController.layout;
            const accessories = (await this.accessories()).filter((item) => item.type !== "bridge");

            for (let i = 0; i < working.rooms.length; i += 1) {
                working.rooms[i] = this.properties(working.rooms[i], accessories, true, false);
            }

            const unassigned = accessories.filter((item) => !item.room || item.room === "" || item.room === "default");

            if (unassigned.length > 0) working.rooms.push(this.properties({ id: "default", sequence: working.rooms.length + 1 }, accessories, true, false));

            const index = working.rooms.findIndex((item: { [key: string]: any }) => item.id === "default");

            if (index >= 0 && working.rooms[index].devices === 0) working.rooms.splice(index, 1);

            response.send(working.rooms);
        }
    }

    async hidden(_request: Request, response: Response): Promise<void> {
        const assigned = (await this.accessories()).filter((item) => item.type !== "bridge" && item.hidden);

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

        response.send(assigned);
    }

    async get(request: Request, response: Response, push?: boolean, value?: any): Promise<void> {
        const working = AccessoriesController.layout;
        const accessory = await State.socket?.fetch(request.params.bridge, "accessory:get", { id: request.params.id });

        if (accessory) {
            if (working.accessories[accessory.accessory_identifier]) _.extend(accessory, working.accessories[accessory.accessory_identifier]);
            if (push) Console.emit(Events.ACCESSORY_CHANGE, request.params.bridge, { accessory, value });
        }

        response.send(accessory);
    }

    async stream(request: Request, response: Response): Promise<void> {
        const source = await State.socket?.fetch(request.params.bridge, "accessory:stream", { id: request.params.id });

        if (source) {
            const stream = ffmpeg(source, { timeout: 432000 });

            stream.addOutputOptions("-movflags +frag_keyframe+separate_moof+omit_tfhd_offset+empty_moov");
            stream.addOptions("-preset veryfast");
            stream.format("mp4");

            stream.audioCodec("aac");
            stream.audioBitrate("160000");
            stream.audioChannels(2);

            stream.size("640x360");
            stream.videoCodec("libx264");
            stream.videoBitrate(1024);

            stream.on("end", () => {
                stream.kill("SIGTERM");
            });

            stream.on("error", (error) => {
                Console.info(error.message);
                stream.kill("SIGTERM");
            });

            Console.info("Output stream opened");

            stream.pipe(response, { end: true });
        } else {
            response.send(undefined);
        }
    }

    async snapshot(request: Request, response: Response): Promise<void> {
        response.send({ image: await State.socket?.fetch(request.params.bridge, "accessory:snapshot", { id: request.params.id }) });
    }

    async set(request: Request, response: Response): Promise<void> {
        const working = AccessoriesController.layout;

        let room;

        switch (request.params.service) {
            case "room":
                Console.debug(`Update - room: ${request.body.value} (${typeof request.body.value})`);

                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = {};

                if (typeof request.body.value === "string" && request.body.value && sanitize(request.body.value) !== "default") {
                    room = working.rooms.find((item: { [key: string]: any }) => item.id === sanitize(request.body.value));

                    if (!room) {
                        working.rooms.unshift({
                            id: sanitize(request.body.value),
                            name: request.body.value,
                            sequence: 1,
                        });

                        for (let i = 0; i < working.rooms.length; i += 1) {
                            working.rooms[i].sequence = i + 1;
                        }
                    }

                    Console.emit(Events.ROOM_CHANGE, "hub", {
                        room,
                        action: "update",
                        field: "room",
                        value: request.body.value,
                    });

                    working.accessories[request.params.id].room = room.id;
                } else {
                    Console.emit(Events.ROOM_CHANGE, "hub", {
                        room,
                        action: "update",
                        field: "room",
                        value: request.body.value,
                    });

                    delete working.accessories[request.params.id].room;
                }

                AccessoriesController.layout = working;

                this.get(request, response, true, request.body.value);
                break;

            case "sequence":
                Console.debug(`Update - sequence: ${request.body.value} (${typeof request.body.value})`);

                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = {};

                if (!Number.isNaN(parseInt(request.body.value, 10))) {
                    working.accessories[request.params.id].sequence = parseInt(request.body.value, 10);
                } else {
                    delete working.accessories[request.params.id].sequence;
                }

                AccessoriesController.layout = working;
                this.get(request, response, true, request.body.value);
                break;

            case "hidden":
                Console.debug(`Update - hidden: ${request.body.value} (${typeof request.body.value})`);

                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = {};

                if ((typeof request.body.value === "boolean" || typeof request.body.value === "number") && request.body.value) {
                    working.accessories[request.params.id].hidden = true;
                } else {
                    delete working.accessories[request.params.id].hidden;
                }

                AccessoriesController.layout = working;

                Console.emit(Events.ROOM_CHANGE, "hub", {
                    room,
                    action: "update",
                    field: "hidden",
                    value: request.params.id,
                });

                this.get(request, response, true, request.body.value);
                break;

            case "name":
                Console.debug(`Update - name: ${request.body.value} (${typeof request.body.value})`);

                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = {};

                if (typeof request.body.value === "string" && request.body.value && request.body.value !== "") {
                    working.accessories[request.params.id].name = request.body.value;
                } else {
                    delete working.accessories[request.params.id].name;
                }

                AccessoriesController.layout = working;
                this.get(request, response, true, request.body.value);
                break;

            case "icon":
                Console.debug(`Update - icon: ${request.body.value} (${typeof request.body.value})`);

                if (!working.accessories[request.params.id]) working.accessories[request.params.id] = {};

                if (typeof request.body.value === "string" && request.body.value && request.body.value !== "") {
                    working.accessories[request.params.id].icon = request.body.value;
                } else {
                    delete working.accessories[request.params.id].icon;
                }

                AccessoriesController.layout = working;
                this.get(request, response, true, request.body.value);
                break;

            default:
                response.send(await State.socket?.fetch(request.params.bridge, "accessory:set", { id: request.params.id, service: request.params.service }, request.body));
                break;
        }
    }

    async characteristics(request: Request, response: Response): Promise<void> {
        response.send(await State.socket?.fetch(request.params.bridge, "accessory:characteristics", { id: request.params.id }));
    }

    async rooms(_request: Request, response: Response): Promise<Response> {
        const working = AccessoriesController.layout;
        const accessories = (await this.accessories()).filter((item) => item.type !== "bridge");

        for (let i = 0; i < working.rooms.length; i += 1) {
            working.rooms[i] = this.properties(working.rooms[i], accessories, false, true);
        }

        const unassigned = accessories.filter((item) => !item.room || item.room === "" || item.room === "default");

        if (unassigned.length > 0) working.rooms.push(this.properties({ id: "default", sequence: working.rooms.length + 1 }, accessories, false, true));

        const index = working.rooms.findIndex((item: { [key: string]: any }) => item.id === "default");

        if (index >= 0 && working.rooms[index].devices === 0) working.rooms.splice(index, 1);

        return response.send(working.rooms);
    }

    async room(request: Request, response: Response): Promise<Response> {
        const id = sanitize(request.params.id);
        const working = AccessoriesController.layout;

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

        room.devices = assigned.filter((item) => !item.hidden).length;

        if (devices) room.accessories = assigned.filter((item) => !item.hidden);
        if (capabilities) room.types = types;
        if (capabilities) room.characteristics = characteristics;

        return room;
    }

    async remove(request: Request, response: Response): Promise<Response> {
        const id = sanitize(request.params.id);
        const working = AccessoriesController.layout;
        const index = working.rooms.findIndex((item: { [key: string]: any }) => item.id === id);
        const accessories = Object.keys(working.accessories);

        if (index === -1) return response.send({ error: "room not found" });

        for (let i = 0; i < accessories.length; i += 1) {
            if (working.accessories[accessories[i]].room === working.rooms[index].id) delete working.accessories[accessories[i]].room;
        }

        for (let i = 0; i < working.rooms.length; i += 1) {
            working.rooms[i].sequence = i + 1;
        }

        working.rooms.splice(index!, 1);
        AccessoriesController.layout = working;

        Console.emit(Events.ROOM_CHANGE, "hub", {
            room: { id },
            action: "remove",
        });

        return this.rooms(request, response);
    }

    add(request: Request, response: Response): Response {
        const id = sanitize(request.body.name);
        const working = AccessoriesController.layout;
        const sequence = parseInt(request.body.sequence, 10) || 1;

        if (id === "" || id === "default" || id === "add" || id === "hidden") return response.send({ error: "invalid room name" });
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

        AccessoriesController.layout = working;

        const index = working.rooms.findIndex((item: { [key: string]: any }) => item.id === id);

        Console.emit(Events.ROOM_CHANGE, "hub", {
            room: working.rooms[index],
            action: "add",
        });

        return response.send(working.rooms[index]);
    }

    async update(request: Request, response: Response): Promise<Response> {
        const id = sanitize(request.params.id);
        const working = AccessoriesController.layout;
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

                AccessoriesController.layout = working;

                Console.emit(Events.ROOM_CHANGE, "hub", {
                    room: working.rooms[index],
                    action: "update",
                    field: "name",
                    value,
                });

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

                AccessoriesController.layout = working;

                Console.emit(Events.ROOM_CHANGE, "hub", {
                    room: working.rooms[index],
                    action: "update",
                    field: "sequence",
                    value,
                });

                break;

            case "off":
                room = this.properties(working.rooms[index], (await this.accessories()).filter((item) => item.type !== "bridge"), true, true);
                room.accessories = room.accessories || [];

                for (let i = 0; i < room.accessories.length; i += 1) {
                    if (this.controllable(room, room.accessories[i], "off")) {
                        Console.emit(Events.ROOM_CHANGE, "hub", {
                            room: working.rooms[index],
                            action: "control",
                            service: "off",
                            value: 0,
                        });

                        await State.socket?.fetch(room.accessories[i].bridge, "accessory:set", { id: room.accessories[i].accessory_identifier, service: "on" }, { value: 0 });
                    }
                }

                break;

            default:
                room = this.properties(working.rooms[index], (await this.accessories()).filter((item) => item.type !== "bridge"), true, true);
                room.accessories = room.accessories || [];
                value = request.body.value;

                for (let i = 0; i < room.accessories.length; i += 1) {
                    if (this.controllable(room, room.accessories[i], request.params.service)) {
                        Console.emit(Events.ROOM_CHANGE, "hub", {
                            room: working.rooms[index],
                            action: "control",
                            service: request.params.service,
                            value,
                        });

                        await State.socket?.fetch(room.accessories[i].bridge, "accessory:set", { id: room.accessories[i].accessory_identifier, service: request.params.service }, { value });
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

                    if (index >= 0 && accessory.characteristics[index].write && accessory.type === "light") return true;

                    break;

                case "off":
                    index = accessory.characteristics.findIndex((item: { [key: string]: any }) => item.type === "on");

                    if (index >= 0 && accessory.characteristics[index].write && (accessory.type === "light" || accessory.type === "switch" || accessory.type === "television" || accessory.type === "fan")) return true;

                    break;
            }
        }

        return false;
    }

    private async accessories(bridge?: string): Promise<any[]> {
        const working = AccessoriesController.layout;

        let results: any[] = [];

        if (bridge) {
            results = results.concat((await State.socket?.fetch(bridge, "accessories:list")) || []);
        } else {
            for (let i = 0; i < State.bridges.length; i += 1) {
                if (State.bridges[i].type !== "hub") {
                    results = results.concat((await State.socket?.fetch(State.bridges[i].id, "accessories:list")) || []);
                }
            }
        }

        for (let i = 0; i < results.length; i += 1) {
            if (working.accessories[results[i].accessory_identifier]) _.extend(results[i], working.accessories[results[i].accessory_identifier]);
        }

        return results;
    }
}
