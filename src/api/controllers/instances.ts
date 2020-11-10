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
import Instance from "../../services/instance";
import Instances from "../../services/instances";
import Config from "../../services/config";

export default class InstancesController {
    constructor() {
        Instance.app?.get("/api/instances", (request, response) => this.list(request, response));
        Instance.app?.put("/api/instances", (request, response) => this.create(request, response));
        Instance.app?.get("/api/instances/count", (request, response) => this.count(request, response));
        Instance.app?.post("/api/instance/:id", (request, response) => this.update(request, response));
        Instance.app?.post("/api/instance/:id/ports", (request, response) => this.ports(request, response));
        Instance.app?.delete("/api/instance/:id", (request, response) => this.remove(request, response));
    }

    list(_request: Request, response: Response): Response {
        return response.send(Instance.instances.filter((item) => item.type === "bridge"));
    }

    count(_request: Request, response: Response): Response {
        return response.send({
            instances: (Instance.instances.filter((item) => item.type === "bridge")).length,
        });
    }

    async create(request: Request, response: Response): Promise<Response> {
        if (Instance.instances.filter((item) => item.type === "bridge").length > 0 && !request.user?.permissions.instance) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        await Instances.createService(request.body.name, parseInt(request.body.port, 10), request.body.pin || "031-45-154", request.body.username || Config.generateUsername());

        return this.list(request, response);
    }

    async update(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.instance) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        await Instances.updateInstance(request.params.id, request.body.display, request.body.pin || "031-45-154", request.body.username || Config.generateUsername());

        return this.list(request, response);
    }

    async ports(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.instance) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        await Instances.updatePorts(request.params.id, request.body.start, request.body.end);

        return this.list(request, response);
    }

    async remove(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions.instance) {
            return response.send({
                token: false,
                error: "Unauthorized.",
            });
        }

        await Instances.removeService(request.params.id);

        return this.list(request, response);
    }
}
