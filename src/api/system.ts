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
import { exec, execSync } from "child_process";
import { Request, Response } from "express-serve-static-core";
import Instance from "../shared/instance";
import Paths from "../shared/paths";
import { findCommand, network } from "../shared/helpers";

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
        Instance.app?.post("/api/system/restore", (request, response) => this.restore(request, response));
        Instance.app?.post("/api/system/upgrade", (request, response) => this.upgrade(request, response));
        Instance.app?.put("/api/system/reboot", (request, response) => this.reboot(request, response));
        Instance.app?.put("/api/system/reset", (request, response) => this.reset(request, response));
    }

    async info(_request: Request, response: Response): Promise<Response> {
        const data = {
            mac: await this.mac(),
            ffmpeg_enabled: findCommand("ffmpeg"),
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
        return response.send(network());
    }

    async activity(_request: Request, response: Response): Promise<Response> {
        return response.send(await System.currentLoad());
    }

    async filesystem(_request: Request, response: Response): Promise<Response> {
        return response.send(await System.fsSize());
    }

    backup(_request: Request, response: Response): void {
        Paths.backup().then((filename) => response.send({
            success: true,
            filename: `/backups/${filename}`,
        })).catch((error) => response.send({
            error: error.message || "Unable to create backup",
        }));
    }

    restore(request: Request, response: Response): void {
        const form = new Forms.IncomingForm();

        form.maxFileSize = 5 * 1024 * 1024 * 1024;

        form.parse(request, (_error, _fields, files) => {
            Paths.restore(
                files.file.path,
                true,
            ).finally(() => this.reboot(request, response));
        });
    }

    upgrade(request: Request, response: Response): Response {
        execSync("npm install -g --unsafe-perm @hoobs/server@latest");

        return this.reboot(request, response);
    }

    reboot(_request: Request, response: Response): Response {
        exec("shutdown -r now");

        return response.send({
            success: true,
        });
    }

    reset(request: Request, response: Response): Response {
        if (Instance.container) {
            return response.send({
                error: "Reset is not supported on Docker images",
            });
        }

        Paths.reset();

        return this.reboot(request, response);
    }
}
