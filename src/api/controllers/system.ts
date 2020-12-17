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
import { exec } from "child_process";
import { Request, Response } from "express-serve-static-core";
import State from "../../state";
import Paths from "../../services/paths";
import System from "../../services/system";
import Instances from "../../services/instances";
import { Console } from "../../services/logger";

export default class SystemController {
    constructor() {
        State.app?.get("/api/system", (request, response) => this.info(request, response));
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
        const distro: { [key: string]: any } = System.info();

        if (State.api?.config.system === "hoobs-box") {
            system.manufacturer = "HOOBS.org";
            system.model = "HSLF-1";
            system.sku = "7-45114-12419-7";
        }

        system.manufacturer = system.manufacturer || operating.distro || operating.hostname;
        system.model = system.model || operating.platform;
        system.distribution = distro.distribution;
        system.version = distro.version || system.version || operating.release;
        system.hostname = operating.hostname;
        system.serial = system.serial !== "" && system.serial !== "-" ? system.serial : undefined;
        system.uuid = system.uuid !== "" && system.uuid !== "-" ? system.uuid : undefined;
        system.sku = system.sku !== "" && system.sku !== "-" ? system.sku : undefined;

        const data = {
            mac: await this.mac(),
            ffmpeg_enabled: Paths.tryCommand("ffmpeg"),
            system,
        };

        return response.send(data);
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
            speed: await SystemInfo.cpuCurrentspeed(),
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
        return response.send(Instances.network());
    }

    async activity(_request: Request, response: Response): Promise<Response> {
        return response.send(await SystemInfo.currentLoad());
    }

    async filesystem(_request: Request, response: Response): Promise<Response> {
        return response.send(await SystemInfo.fsSize());
    }

    catalog(_request: Request, response: Response): void {
        const results: { [key: string]: string | number }[] = [];
        const entries = readdirSync(Paths.backupPath()).filter((item) => item.endsWith(".backup"));

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

        Instances.backup().then((filename) => response.send({
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

        if (existsSync(join(Paths.backupPath(), decodeURIComponent(`${request.query.filename}`)))) {
            await Instances.restore(join(Paths.backupPath(), decodeURIComponent(`${request.query.filename}`)));

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

        form.maxFileSize = 5 * 1024 * 1024 * 1024;

        form.parse(request, (_error, _fields, files) => {
            Instances.restore(files.file.path, true).finally(() => {
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

        await Instances.backup();

        let reboot = false;
        let data = System.runtime.info();

        if (!data.node_upgraded) {
            Console.info("syncing repositories");
            System.sync();
            Console.info("upgrading node");
            System.runtime.upgrade();
        }

        data = System.cli.info();

        if (!data.cli_upgraded) {
            Console.info("upgrading cli");
            System.cli.upgrade();
        }

        data = System.hoobsd.info();

        if (!data.hoobsd_upgraded) {
            Console.info("upgrading hoobsd");
            System.hoobsd.upgrade();
            reboot = true;
        }

        if (reboot && !State.container) return this.reboot(request, response);

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

        exec("shutdown -r now");

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

        await Instances.reset();

        return response.send({
            success: true,
        });
    }
}
