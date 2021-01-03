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
import State from "../../state";
import Cockpit from "../services/cockpit";

export default class RemoteController {
    declare client: Cockpit;

    constructor() {
        State.app?.get("/api/remote", (request, response) => this.status(request, response));
        State.app?.get("/api/remote/start", (request, response) => this.start(request, response));
        State.app?.get("/api/remote/disconnect", (request, response) => this.disconnect(request, response));
    }

    status(_request: Request, response: Response): Response {
        if (this.client) {
            return response.send({
                active: true,
            });
        }

        return response.send({
            active: false,
        });
    }

    start(_request: Request, response: Response): void {
        this.client = new Cockpit();

        this.client.start(false).then((registration) => response.send({
            registration,
        })).catch(() => response.send({
            error: "Unable to Connect",
        }));
    }

    disconnect(_request: Request, response: Response): Response {
        if (this.client) this.client.disconnect();

        return response.send({
            success: true,
        });
    }
}
