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
        State.app?.post("/api/room/:id", (request, response) => this.update(request, response));
        State.app?.put("/api/room", (request, response) => this.add(request, response));
    }

    async list(request: Request, response: Response): Promise<void> {
        if (request.params.bridge && request.params.bridge !== "") {
            response.send(await Socket.fetch(request.params.bridge, "accessories:list"));
        } else {
            response.send(await this.accessories());
        }
    }

    async get(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.bridge, "accessory:get", { id: request.params.id }));
    }

    async set(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.bridge, "accessory:set", { id: request.params.id, service: request.params.service }, request.body));
    }

    async characteristics(request: Request, response: Response): Promise<void> {
        response.send(await Socket.fetch(request.params.bridge, "accessory:characteristics", { id: request.params.id }));
    }

    async rooms(_request: Request, response: Response): Promise<void> {
        const rooms: { [key: string]: any }[] = (loadJson<{ [key: string]: any }>(Paths.layout, {})).rooms || [];
        const accessories = (await this.accessories()).filter((item) => item.type !== "bridge");

        rooms.sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;

            return 0;
        });

        rooms.sort((a, b) => {
            if (a.sequence < b.sequence) return -1;
            if (a.sequence > b.sequence) return 1;

            return 0;
        });

        for (let i = 0; i < rooms.length; i += 1) {
            rooms[i].accessories = accessories.filter((item) => item.room === rooms[i].id);

            rooms[i].accessories.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;

                return 0;
            });

            rooms[i].accessories.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
                if (a.sequence < b.sequence) return -1;
                if (a.sequence > b.sequence) return 1;

                return 0;
            });
        }

        const unassigned = accessories.filter((item) => !item.room || item.room === "" || item.room === "default");

        if (unassigned.length > 0) rooms.push({ id: "default", sequence: rooms.length, accessories: unassigned });

        response.send(rooms);
    }

    async room(request: Request, response: Response): Promise<Response> {
        const id = sanitize(request.params.id);
        const accessories = (await this.accessories()).filter((item) => item.type !== "bridge");
        const rooms: { [key: string]: any }[] = (loadJson<{ [key: string]: any }>(Paths.layout, {})).rooms || [];

        let room: { [key: string]: any } | undefined = { id, sequence: rooms.length };

        if (id !== "default") room = rooms.find((item) => item.id === id);
        if (!room) return response.send({ error: "room not found"});

        room.accessories = accessories.filter((item) => !item.room || item.room === "" || item.room === id);

        room.accessories.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;

            return 0;
        });

        room.accessories.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.sequence < b.sequence) return -1;
            if (a.sequence > b.sequence) return 1;

            return 0;
        });

        return response.send(room);
    }

    add(request: Request, response: Response): Response {
        const id = sanitize(request.body.name);
        const layout: { [key: string]: any } = loadJson<{ [key: string]: any }>(Paths.layout, {});
        const sequence = parseInt(request.body.sequence, 10) || 1;

        if (id === "" || id === "default") return response.send({ error: "invalid room name" });
        if (layout.rooms.findIndex((item: { [key: string]: any }) => item.id === id) >= 0) return response.send({ error: "room already exists" });

        for (let i = 0; i < layout.rooms.length; i += 1) {
            if (layout.rooms[i].sequence >= sequence) layout.rooms[i].sequence += 1;
        }

        layout.rooms.push({ id, name: request.body.name, sequence });

        layout.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;

            return 0;
        });

        layout.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.sequence < b.sequence) return -1;
            if (a.sequence > b.sequence) return 1;

            return 0;
        });

        this.save(layout);

        return response.send(layout.rooms.find((item: { [key: string]: any }) => item.id === id));
    }

    update(request: Request, response: Response): Response {
        const id = sanitize(request.params.id);
        const layout: { [key: string]: any } = loadJson<{ [key: string]: any }>(Paths.layout, {});

        layout.rooms = layout.rooms || [];
        layout.accessories = layout.accessories || {};

        const index = layout.rooms.findIndex((item: { [key: string]: any }) => item.id === id);

        if (index === -1) return response.send({ error: "room not found" });
        if (typeof request.body.name === "string" && request.body.name !== "") layout.rooms[index].name = request.body.name;

        const sequence = parseInt(request.body.sequence, 10);

        if (!Number.isNaN(sequence)) {
            for (let i = 0; i < layout.rooms.length; i += 1) {
                if (layout.rooms[i].sequence >= sequence) layout.rooms[i].sequence += 1;
            }

            layout.rooms[index].sequence = sequence;
        }

        layout.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;

            return 0;
        });

        layout.rooms.sort((a: { [key: string]: any }, b: { [key: string]: any }) => {
            if (a.sequence < b.sequence) return -1;
            if (a.sequence > b.sequence) return 1;

            return 0;
        });

        this.save(layout);

        return response.send(layout.rooms.find((item: { [key: string]: any }) => item.id === id));
    }

    async accessories(): Promise<any[]> {
        let results: any[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type === "bridge") {
                const accessories = await Socket.fetch(State.bridges[i].id, "accessories:list");

                if (accessories) {
                    results = [...results, ...accessories];
                }
            }
        }

        return results;
    }

    save(value: { [key: string]: any }) {
        value.rooms = value.rooms || [];
        value.accessories = value.accessories || {};

        const current: { [key: string]: any } = loadJson<{ [key: string]: any }>(Paths.layout, {});

        if (!jsonEquals(current, value)) writeFileSync(Paths.layout, formatJson(value));
    }
}
