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
import FFMPEG from "../../extentions/ffmpeg";
import Paths from "../../services/paths";

export default class ExtentionsController {
    constructor() {
        Instance.app?.get("/api/extentions", (request, response) => this.list(request, response));
        Instance.app?.put("/api/extentions/:name", (request, response) => this.enable(request, response));
        Instance.app?.delete("/api/extentions/:name", (request, response) => this.disable(request, response));
    }

    list(_request: Request, response: Response): Response {
        return response.send([{
            feature: "ffmpeg",
            description: "enables ffmpeg camera support",
            enabled: Paths.tryCommand("ffmpeg"),
        }]);
    }

    enable(request: Request, response: Response): Response {
        let results: { success: boolean, error?: string | undefined } = {
            success: false,
        };

        switch ((request.params.name || "").toLowerCase()) {
            case "ffmpeg":
                results = FFMPEG.enable();
                break;

            default:
                break;
        }

        if (results.success) return this.list(request, response);

        if (results.error) {
            return response.send({
                error: results.error,
            });
        }

        return response.send({
            error: "feature not supported",
        });
    }

    disable(request: Request, response: Response): Response {
        let results: { success: boolean, error?: string | undefined } = {
            success: false,
        };

        switch ((request.params.name || "").toLowerCase()) {
            case "ffmpeg":
                results = FFMPEG.disable();
                break;

            default:
                break;
        }

        if (results.success) return this.list(request, response);

        if (results.error) {
            return response.send({
                error: results.error,
            });
        }

        return response.send({
            error: "feature not supported",
        });
    }
}
