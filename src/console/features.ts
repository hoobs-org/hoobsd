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
import FFMPEG from "../features/ffmpeg";
import { findCommand } from "../shared/helpers";

export default class FeaturesController {
    constructor() {
        Instance.app?.get("/api/features", (request, response) => FeaturesController.list(request, response));
        Instance.app?.post("/api/features/:name", (request, response) => FeaturesController.enable(request, response));
        Instance.app?.delete("/api/features/:name", (request, response) => FeaturesController.disable(request, response));
    }

    static list(_request: Request, response: Response): Response {
        return response.send([{
            feature: "ffmpeg",
            description: "enables ffmpeg camera support",
            enabled: findCommand("ffmpeg"),
        }]);
    }

    static enable(request: Request, response: Response): Response {
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

        if (results.success) {
            return FeaturesController.list(request, response);
        }

        if (results.error) {
            return response.send({
                error: results.error,
            });
        }

        return response.send({
            error: "feature not supported",
        });
    }

    static disable(request: Request, response: Response): Response {
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

        if (results.success) {
            return FeaturesController.list(request, response);
        } if (results.error) {
            return response.send({
                error: results.error,
            });
        }

        return response.send({
            error: "feature not supported",
        });
    }
}
