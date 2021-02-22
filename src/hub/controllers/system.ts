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
import { Console } from "../../services/logger";

export default class SystemController {
    constructor() {
        State.app?.get("/api/system", (request, response) => this.info(request, response));
        State.app?.get("/api/system/hostname", (request, response) => this.hostname("get", request, response));
        State.app?.post("/api/system/hostname", (request, response) => this.hostname("post", request, response));
        State.app?.get("/api/system/cpu", (request, response) => this.cpu(request, response));
        State.app?.get("/api/system/memory", (request, response) => this.memory(request, response));
        State.app?.get("/api/system/network", (request, response) => this.network(request, response));
        State.app?.get("/api/system/filesystem", (request, response) => this.filesystem(request, response));
        State.app?.get("/api/system/activity", (request, response) => this.activity(request, response));
        State.app?.get("/api/system/temp", (request, response) => this.temp(request, response));
        State.app?.get("/api/system/backup", (request, response) => this.backup(request, response));
        State.app?.get("/api/system/backup/catalog", (request, response) => this.catalog(request, response));
        State.app?.get("/api/system/restore", (request, response) => this.restore(request, response));
        State.app?.post("/api/system/restore", (request, response) => this.upload(request, response));
        State.app?.post("/api/system/upgrade", (request, response) => this.upgrade(request, response));
        State.app?.put("/api/system/reboot", (request, response) => this.reboot(request, response));
        State.app?.put("/api/system/reset", (request, response) => this.reset(request, response));
    }

    async info(_request: Request, response: Response): Promise<Response> {
        const operating: { [key: string]: any } = await SystemInfo.osInfo();
        const system: { [key: string]: any } = await SystemInfo.system();
        const distro: { [key: string]: any } = await System.info();

        if (distro.product === "box" || distro.product === "card") {
            system.manufacturer = "HOOBS.org";
            system.model = distro.model;
            system.sku = distro.sku;
        }

        system.manufacturer = system.manufacturer || operating.distro || operating.hostname;
        system.model = system.model || operating.platform;
        system.distribution = distro.distribution;
        system.version = distro.version || system.version || operating.release;

        if (distro.mdns) {
            system.hostname = distro.mdns_broadcast || operating.hostname;
        } else {
            system.hostname = operating.hostname;
        }

        delete system.serial;
        delete system.uuid;

        const data = {
            mac: await this.mac(),
            ffmpeg_enabled: Paths.tryCommand("ffmpeg"),
            system,
        };

        return response.send(data);
    }

    async hostname(method: string, request: Request, response: Response): Promise<Response> {
        const operating: { [key: string]: any } = await SystemInfo.osInfo();
        const distro: { [key: string]: any } = await System.info();

        switch (method) {
            case "post":
                if (((request.body || {}).hostname || "") !== "") {
                    await System.hostname((request.body || {}).hostname || "");

                    return response.send({
                        success: true,
                    });
                }

                return response.send({
                    error: "invalid hostname",
                    success: false,
                });

            default:
                if (distro.mdns) {
                    return response.send({
                        hostname: distro.mdns_broadcast || operating.hostname,
                    });
                }

                return response.send({
                    hostname: operating.hostname,
                });
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
        return response.send(await SystemInfo.cpuTemperature());
    }

    async cpu(_request: Request, response: Response): Promise<Response> {
        return response.send({
            information: await SystemInfo.cpu(),
            speed: await SystemInfo.cpuCurrentSpeed(),
            load: await SystemInfo.currentLoad(),
            cache: await SystemInfo.cpuCache(),
        });
    }

    async memory(_request: Request, response: Response): Promise<Response> {
        return response.send({
            information: await SystemInfo.memLayout(),
            load: await SystemInfo.mem(),
        });
    }

    network(_request: Request, response: Response): Response {
        return response.send(Bridges.network());
    }

    async activity(_request: Request, response: Response): Promise<Response> {
        return response.send(await SystemInfo.currentLoad());
    }

    async filesystem(_request: Request, response: Response): Promise<Response> {
        return response.send(await SystemInfo.fsSize());
    }

    catalog(_request: Request, response: Response): void {
        const results: { [key: string]: string | number }[] = [];
        const entries = readdirSync(Paths.backups).filter((item) => item.endsWith(".backup"));

        for (let i = 0; i < entries.length; i += 1) {
            results.push({
                date: parseInt(entries[i].replace(".backup", ""), 10),
                filename: entries[i],
            });
        }

        response.send(results);
    }

    backup(request: Request, response: Response): void {
        if (!request.user?.permissions.controller) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

            return;
        }

        Bridges.backup().then((filename) => response.send({
            success: true,
            filename,
        })).catch((error) => response.send({
            error: error.message || "Unable to create backup",
        }));
    }

    async restore(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.reboot) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        if (existsSync(join(Paths.backups, decodeURIComponent(`${request.query.filename}`)))) {
            await Bridges.restore(join(Paths.backups, decodeURIComponent(`${request.query.filename}`)));

            this.reboot(request, response);

            return response.send({
                success: true,
            });
        }

        return response.send({
            success: false,
            error: "Backup file doesent exist",
        });
    }

    upload(request: Request, response: Response): void {
        if (!request.user?.permissions.reboot) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

            return;
        }

        const form = new Forms.IncomingForm();

        form.multiples = false;
        form.maxFileSize = 5 * 1024 * 1024 * 1024;

        form.parse(request, (_error, _fields, files) => {
            const file = <Forms.File>files.file;

            Bridges.restore(file.path, true).finally(() => {
                this.reboot(request, response);
            });
        });
    }

    async upgrade(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.reboot) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        await Bridges.backup();

        const system = await System.info();

        let reboot = false;
        let data = await System.runtime.info();

        if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get" && !data.node_upgraded) {
            Console.info("upgrading node");

            await System.runtime.upgrade();
        }

        data = await System.cli.info();

        if (!data.cli_upgraded) {
            Console.info("upgrading cli");

            await System.cli.upgrade();
        }

        data = await System.hoobsd.info();

        if (!data.hoobsd_upgraded) {
            Console.info("upgrading hoobsd");

            await System.hoobsd.upgrade();

            reboot = true;
        }

        if (reboot) System.restart();

        return response.send({
            success: true,
        });
    }

    reboot(request: Request, response: Response): Response {
        if (!request.user?.permissions.reboot) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        System.reboot();

        return response.send({
            success: true,
        });
    }

    async reset(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.reboot) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        await Bridges.reset();

        return response.send({
            success: true,
        });
    }
}
