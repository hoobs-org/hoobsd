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
import Instance from "../shared/instance";
import Instances from "../shared/instances";

export default class InstancesController {
    constructor() {
        Instance.app?.get("/api/instance", (request, response) => this.list(request, response));
        Instance.app?.put("/api/instance", (request, response) => this.create(request, response));
        Instance.app?.post("/api/instance/:id", (request, response) => this.update(request, response));
        Instance.app?.delete("/api/instance/:id", (request, response) => this.remove(request, response));
    }

    list(_request: Request, response: Response): Response {
        return response.send(Instance.instances);
    }

    create(request: Request, response: Response): void {
        Instances.createService(
            request.body.name,
            parseInt(request.body.port, 10),
        ).then(() => this.list(request, response));
    }

    update(request: Request, response: Response): void {
        Instances.renameInstance(
            request.params.id,
            request.body.name,
        ).then(() => this.list(request, response));
    }

    remove(request: Request, response: Response): void {
        Instances.removeService(
            request.params.id,
        ).then(() => this.list(request, response));
    }
}
