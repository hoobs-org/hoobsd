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

import SystemInfo from "systeminformation";
import Forms from "formidable";
import Mac from "macaddress";
import { join } from "path";
import { existsSync, readdirSync } from "fs-extra";
import { Request, Response } from "express-serve-static-core";
import State from "../../state";
import Paths from "../../services/paths";
import System from "../../services/system";
import Bridges from "../../services/bridges";
import Security from "../../services/security";

export default class SystemController {
    constructor() {
        State.app?.get("/api/system", (request, response, next) => Security(request, response, next), (request, response) => this.info(request, response));
        State.app?.get("/api/system/hostname", (request, response, next) => Security(request, response, next), (request, response) => this.hostname("get", request, response));
        State.app?.post("/api/system/hostname", (request, response, next) => Security(request, response, next), (request, response) => this.hostname("post", request, response));
        State.app?.get("/api/system/cpu", (request, response, next) => Security(request, response, next), (request, response) => this.cpu(request, response));
        State.app?.get("/api/system/memory", (request, response, next) => Security(request, response, next), (request, response) => this.memory(request, response));
        State.app?.get("/api/system/network", (request, response, next) => Security(request, response, next), (request, response) => this.network(request, response));
        State.app?.get("/api/system/filesystem", (request, response, next) => Security(request, response, next), (request, response) => this.filesystem(request, response));
        State.app?.get("/api/system/activity", (request, response, next) => Security(request, response, next), (request, response) => this.activity(request, response));
        State.app?.get("/api/system/temp", (request, response, next) => Security(request, response, next), (request, response) => this.temp(request, response));
        State.app?.get("/api/system/backup", (request, response, next) => Security(request, response, next), (request, response) => this.backup(request, response));
        State.app?.get("/api/system/backup/catalog", (request, response, next) => Security(request, response, next), (request, response) => this.catalog(request, response));
        State.app?.get("/api/system/restore", (request, response, next) => Security(request, response, next), (request, response) => this.restore(request, response));
        State.app?.post("/api/system/restore", (request, response, next) => Security(request, response, next), (request, response) => this.upload(request, response));
        State.app?.post("/api/system/upgrade", (request, response, next) => Security(request, response, next), (request, response) => this.upgrade(request, response));
        State.app?.put("/api/system/reboot", (request, response, next) => Security(request, response, next), (request, response) => this.reboot(request, response));
        State.app?.put("/api/system/shutdown", (request, response, next) => Security(request, response, next), (request, response) => this.shutdown(request, response));
        State.app?.put("/api/system/reset", (request, response, next) => Security(request, response, next), (request, response) => this.reset(request, response));
    }

    info(_request: Request, response: Response): void {
        let waits: Promise<void>[] = [];

        const distro: { [key: string]: any } = System.info();

        let operating: { [key: string]: any } = {};
        let system: { [key: string]: any } = {};
        let mac: string | undefined;

        waits.push(new Promise((resolve) => SystemInfo.osInfo().then((data: { [key: string]: any }) => { operating = data; resolve(); })));
        waits.push(new Promise((resolve) => SystemInfo.system().then((data: { [key: string]: any }) => { system = data; resolve(); })));
        waits.push(new Promise((resolve) => this.mac().then((data: string | undefined) => { mac = data; resolve(); })));

        Promise.allSettled(waits).then(() => {
            waits = [];

            if (distro.product === "box" || distro.product === "card" || distro.product === "headless") {
                system.manufacturer = "HOOBS.org";
                system.model = distro.model;
                system.sku = distro.sku;
            }

            system.manufacturer = system.manufacturer || operating.distro || operating.hostname;
            system.model = system.model || operating.platform;
            system.version = distro.version || system.version || operating.release;

            if (distro.mdns) {
                system.hostname = distro.mdns_broadcast || operating.hostname;
            } else {
                system.hostname = operating.hostname;
            }

            delete system.serial;
            delete system.uuid;
            delete system.virtual;
            delete system.distribution;
            delete system.raspberry;

            response.send({
                mac,
                ffmpeg_enabled: Paths.tryCommand("ffmpeg"),
                system,
            });
        });
    }

    async hostname(method: string, request: Request, response: Response): Promise<Response> {
        const operating: { [key: string]: any } = await SystemInfo.osInfo();
        const distro: { [key: string]: any } = System.info();

        switch (method) {
            case "post":
                if (((request.body || {}).hostname || "") !== "") {
                    await System.hostname((request.body || {}).hostname || "");

                    return response.send({ success: true });
                }

                return response.send({ error: "invalid hostname", success: false });

            default:
                if (distro.mdns) return response.send({ hostname: distro.mdns_broadcast || operating.hostname });

                return response.send({ hostname: operating.hostname });
        }
    }

    mac(): Promise<string | undefined> {
        return new Promise((resolve) => {
            Mac.one((error, address) => {
                if (!error) {
                    resolve(address);
                } else {
                    resolve(undefined);
                }
            });
        });
    }

    async temp(_request: Request, response: Response): Promise<Response> {
        const temperature = await SystemInfo.cpuTemperature();

        return response.send(temperature);
    }

    async cpu(_request: Request, response: Response): Promise<Response> {
        const information = await SystemInfo.cpu();
        const speed = await SystemInfo.cpuCurrentSpeed();
        const load = await SystemInfo.currentLoad();
        const cache = await SystemInfo.cpuCache();

        return response.send({
            information,
            speed,
            load,
            cache,
        });
    }

    async memory(_request: Request, response: Response): Promise<Response> {
        const information = await SystemInfo.memLayout();
        const load = await SystemInfo.mem();

        return response.send({ information, load });
    }

    network(_request: Request, response: Response): Response {
        return response.send(Bridges.network());
    }

    async activity(_request: Request, response: Response): Promise<Response> {
        const load = await SystemInfo.currentLoad();

        return response.send(load);
    }

    async filesystem(_request: Request, response: Response): Promise<Response> {
        const fs = await SystemInfo.fsSize();

        return response.send(fs);
    }

    catalog(_request: Request, response: Response): void {
        const results: { [key: string]: string | number }[] = [];
        const entries = readdirSync(Paths.backups).filter((item) => item.endsWith(".backup"));

        for (let i = 0; i < entries.length; i += 1) {
            results.push({ date: parseInt(entries[i].replace(".backup", ""), 10), filename: entries[i] });
        }

        response.send(results);
    }

    backup(request: Request, response: Response): void {
        if (!request.user?.permissions?.controller) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        Bridges.backup().then((filename) => {
            response.send({ success: true, filename });
        }).catch((error) => {
            response.send({ error: error.message || "Unable to create backup" });
        });
    }

    async restore(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions?.reboot) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        if (existsSync(join(Paths.backups, decodeURIComponent(`${request.query.filename}`)))) {
            await Bridges.restore(join(Paths.backups, decodeURIComponent(`${request.query.filename}`)));

            response.send({ success: true });

            System.restart();
        } else {
            response.send({ success: false, error: "Backup file doesent exist" });
        }
    }

    async upload(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions?.reboot) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        const form = new Forms.IncomingForm({
            multiples: false,
            maxFileSize: 2 * 1024 * 1024 * 1024,
        });

        form.parse(request, async (_error, _fields, files) => {
            const file = <Forms.File>files.file;

            await Bridges.restore(file.path, true);

            response.send({ success: true });

            System.restart();
        });
    }

    async upgrade(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions?.reboot) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        await Bridges.backup();

        const system = System.info();
        const components: string[] = [];

        if (system.package_manager === "apt-get") {
            const gui = System.gui.info(system.repo === "edge" || system.repo === "bleeding");

            if (!System.runtime.info(system.repo === "edge" || system.repo === "bleeding").node_upgraded) components.push(...System.runtime.components);
            if (!System.cli.info(system.repo === "edge" || system.repo === "bleeding").cli_upgraded) components.push(...System.cli.components);
            if (gui.gui_version && !gui.gui_upgraded) components.push(...System.gui.components);
            if (!System.hoobsd.info(system.repo === "edge" || system.repo === "bleeding").hoobsd_upgraded) components.push(...System.hoobsd.components);

            if (components.length > 0) await System.upgrade(...components);
        }

        response.send({ success: true });

        System.restart();
    }

    reboot(request: Request, response: Response): void {
        if (!request.user?.permissions?.reboot) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        response.send({ success: true });

        System.reboot();
    }

    shutdown(request: Request, response: Response): void {
        if (!request.user?.permissions?.reboot) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        response.send({ success: true });

        System.shutdown();
    }

    async reset(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions?.reboot) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        response.send({ success: true });

        await Bridges.reset();

        System.restart();
    }
}
