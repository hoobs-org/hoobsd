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
import Security from "../../services/security";
import Bridges from "../../services/bridges";
import FFMPEG from "../../extentions/ffmpeg";
import GUI from "../../extentions/gui";

export default class ExtentionsController {
    constructor() {
        State.app?.get("/api/extentions", Security, (request, response) => this.list(request, response));
        State.app?.put("/api/extentions/:name", Security, (request, response) => this.enable(request, response));
        State.app?.delete("/api/extentions/:name", Security, (request, response) => this.disable(request, response));
    }

    list(request: Request, response: Response): Response {
        if (!request.user?.permissions?.controller) return response.send({ token: false, error: "Unauthorized." });

        return response.send(Bridges.extentions());
    }

    async enable(request: Request, response: Response): Promise<Response> {
        if (!request.user?.permissions?.controller) return response.send({ token: false, error: "Unauthorized." });

        let results: { success: boolean, error?: string | undefined } = { success: false };

        switch ((request.params.name || "").toLowerCase()) {
            case "ffmpeg":
                results = await FFMPEG.enable();
                break;

            case "gui":
                results = await GUI.enable();
                break;

            default:
                break;
        }

        if (results.success) return this.list(request, response);

        if (results.error) return response.send({ error: results.error });

        return response.send({ error: "feature not supported" });
    }

    disable(request: Request, response: Response): Response {
        if (!request.user?.permissions?.controller) return response.send({ token: false, error: "Unauthorized." });

        let results: { success: boolean, error?: string | undefined } = { success: false };

        switch ((request.params.name || "").toLowerCase()) {
            case "ffmpeg":
                results = FFMPEG.disable();
                break;

            case "gui":
                results = GUI.disable();
                break;

            default:
                break;
        }

        if (results.success) return this.list(request, response);

        if (results.error) return response.send({ error: results.error });

        return response.send({ error: "feature not supported" });
    }
}
