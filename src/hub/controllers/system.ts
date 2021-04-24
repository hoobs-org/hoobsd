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
import { Console } from "../../services/logger";

export default class SystemController {
    constructor() {
        State.app?.get("/api/system", Security, (request, response) => this.info(request, response));
        State.app?.get("/api/system/hostname", Security, (request, response) => this.hostname("get", request, response));
        State.app?.post("/api/system/hostname", Security, (request, response) => this.hostname("post", request, response));
        State.app?.get("/api/system/cpu", Security, (request, response) => this.cpu(request, response));
        State.app?.get("/api/system/memory", Security, (request, response) => this.memory(request, response));
        State.app?.get("/api/system/network", Security, (request, response) => this.network(request, response));
        State.app?.get("/api/system/filesystem", Security, (request, response) => this.filesystem(request, response));
        State.app?.get("/api/system/activity", Security, (request, response) => this.activity(request, response));
        State.app?.get("/api/system/temp", Security, (request, response) => this.temp(request, response));
        State.app?.get("/api/system/backup", Security, (request, response) => this.backup(request, response));
        State.app?.get("/api/system/backup/catalog", Security, (request, response) => this.catalog(request, response));
        State.app?.get("/api/system/restore", Security, (request, response) => this.restore(request, response));
        State.app?.post("/api/system/restore", Security, (request, response) => this.upload(request, response));
        State.app?.post("/api/system/upgrade", Security, (request, response) => this.upgrade(request, response));
        State.app?.put("/api/system/reboot", Security, (request, response) => this.reboot(request, response));
        State.app?.put("/api/system/shutdown", Security, (request, response) => this.shutdown(request, response));
        State.app?.put("/api/system/reset", Security, (request, response) => this.reset(request, response));
    }

    async info(_request: Request, response: Response): Promise<Response> {
        const operating: { [key: string]: any } = await SystemInfo.osInfo();
        const system: { [key: string]: any } = await SystemInfo.system();
        const distro: { [key: string]: any } = System.info();

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

        const data = {
            mac: await this.mac(),
            ffmpeg_enabled: Paths.tryCommand("ffmpeg"),
            system,
        };

        return response.send(data);
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

        const form = new Forms.IncomingForm();

        form.multiples = false;
        form.maxFileSize = 2 * 1024 * 1024 * 1024;

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

        let data = await System.runtime.info();

        if ((system.product === "box" || system.product === "card" || system.product === "headless") && system.package_manager === "apt-get" && !data.node_upgraded) {
            Console.info("upgrading node");

            await System.runtime.upgrade();
        }

        data = await System.cli.info();

        if (!data.cli_upgraded) {
            Console.info("upgrading cli");

            await System.cli.upgrade();
        }

        data = await System.gui.info();

        if (data.gui_version && !data.gui_upgraded) {
            Console.info("upgrading gui");

            await System.gui.upgrade();
        }

        data = await System.hoobsd.info();

        if (!data.hoobsd_upgraded) {
            Console.info("upgrading hoobsd");

            await System.hoobsd.upgrade();
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
