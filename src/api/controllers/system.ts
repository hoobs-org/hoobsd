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

import System from "systeminformation";
import Forms from "formidable";
import Mac from "macaddress";
import { join } from "path";
import { existsSync, readdirSync } from "fs-extra";
import { exec, execSync } from "child_process";
import { Request, Response } from "express-serve-static-core";
import Instance from "../../services/instance";
import Paths from "../../services/paths";
import Instances from "../../services/instances";

export default class SystemController {
    constructor() {
        Instance.app?.get("/api/system", (request, response) => this.info(request, response));
        Instance.app?.get("/api/system/cpu", (request, response) => this.cpu(request, response));
        Instance.app?.get("/api/system/memory", (request, response) => this.memory(request, response));
        Instance.app?.get("/api/system/network", (request, response) => this.network(request, response));
        Instance.app?.get("/api/system/filesystem", (request, response) => this.filesystem(request, response));
        Instance.app?.get("/api/system/activity", (request, response) => this.activity(request, response));
        Instance.app?.get("/api/system/temp", (request, response) => this.temp(request, response));
        Instance.app?.get("/api/system/backup", (request, response) => this.backup(request, response));
        Instance.app?.get("/api/system/backup/catalog", (request, response) => this.catalog(request, response));
        Instance.app?.get("/api/system/restore", (request, response) => this.restore(request, response));
        Instance.app?.post("/api/system/restore", (request, response) => this.upload(request, response));
        Instance.app?.post("/api/system/upgrade", (request, response) => this.upgrade(request, response));
        Instance.app?.put("/api/system/reboot", (request, response) => this.reboot(request, response));
        Instance.app?.put("/api/system/reset", (request, response) => this.reset(request, response));
    }

    async info(_request: Request, response: Response): Promise<Response> {
        const data = {
            mac: await this.mac(),
            ffmpeg_enabled: Paths.tryCommand("ffmpeg"),
            system: await System.system(),
            operating_system: await System.osInfo(),
        };

        if (Instance.api?.config.system === "hoobs-box") {
            data.system.manufacturer = "HOOBS.org";
            data.system.model = "HSLF-1";
            data.system.sku = "7-45114-12419-7";
        }

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
        return response.send(await System.cpuTemperature());
    }

    async cpu(_request: Request, response: Response): Promise<Response> {
        return response.send({
            information: await System.cpu(),
            speed: await System.cpuCurrentspeed(),
            load: await System.currentLoad(),
            cache: await System.cpuCache(),
        });
    }

    async memory(_request: Request, response: Response): Promise<Response> {
        return response.send({
            information: await System.memLayout(),
            load: await System.mem(),
        });
    }

    network(_request: Request, response: Response): Response {
        return response.send(Instances.network());
    }

    async activity(_request: Request, response: Response): Promise<Response> {
        return response.send(await System.currentLoad());
    }

    async filesystem(_request: Request, response: Response): Promise<Response> {
        return response.send(await System.fsSize());
    }

    catalog(_request: Request, response: Response): void {
        const results: { [key: string]: string | number }[] = [];
        const entries = readdirSync(Paths.backupPath()).filter((item) => item.endsWith(".hbak"));

        for (let i = 0; i < entries.length; i += 1) {
            results.push({
                date: parseInt(entries[i].replace(".hbak", "").replace("backup-", ""), 10),
                filename: entries[i],
            });
        }

        response.send(results);
    }

    backup(_request: Request, response: Response): void {
        Instances.backup().then((filename) => response.send({
            success: true,
            filename,
        })).catch((error) => response.send({
            error: error.message || "Unable to create backup",
        }));
    }

    async restore(request: Request, response: Response): Promise<void> {
        if (existsSync(join(Paths.backupPath(), decodeURIComponent(`${request.query.filename}`)))) {
            await Instances.restore(join(Paths.backupPath(), decodeURIComponent(`${request.query.filename}`)));

            this.reboot(request, response);
        } else {
            response.send({
                success: false,
                error: "Backup file doesent exist",
            });
        }
    }

    upload(request: Request, response: Response): void {
        const form = new Forms.IncomingForm();

        form.maxFileSize = 5 * 1024 * 1024 * 1024;

        form.parse(request, (_error, _fields, files) => {
            Instances.restore(
                files.file.path,
                true,
            ).finally(() => {
                this.reboot(request, response);
            });
        });
    }

    async upgrade(request: Request, response: Response): Promise<Response> {
        await Instances.backup();

        const flags = [];

        if (Instance.manager === "yarn") {
            flags.push("global");
            flags.push("upgrade");
            flags.push("--ignore-engines");
        } else {
            flags.push("install");
            flags.push("-g");
            flags.push("--unsafe-perm");
        }

        execSync(`${Instance.manager || "npm"} ${flags.join(" ")} @hoobs/hoobsd@latest`);
        execSync(`${Instance.manager || "npm"} ${flags.join(" ")} @hoobs/cli@latest`);

        if ((Instances.extentions().find((item) => item.feature === "gui") || {}).enabled) execSync(`${Instance.manager || "npm"} ${flags.join(" ")} @hoobs/gui@latest`);
        if ((Instances.extentions().find((item) => item.feature === "touch") || {}).enabled) execSync(`${Instance.manager || "npm"} ${flags.join(" ")} @hoobs/touch@latest`);

        return this.reboot(request, response);
    }

    reboot(_request: Request, response: Response): Response {
        exec("shutdown -r now");

        return response.send({
            success: true,
        });
    }

    async reset(request: Request, response: Response): Promise<Response> {
        await Instances.reset();

        return response.send({
            success: true,
        });
    }
}
