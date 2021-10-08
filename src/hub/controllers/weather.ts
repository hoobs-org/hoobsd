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
import Weather from "../services/weather";
import Security from "../../services/security";

export default class ThemesController {
    constructor() {
        State.app?.get("/api/weather/location", (request, response, next) => Security(request, response, next), (request, response) => this.search(request, response));
        State.app?.get("/api/weather/current", (request, response, next) => Security(request, response, next), (request, response) => this.current(request, response));
        State.app?.get("/api/weather/forecast", (request, response, next) => Security(request, response, next), (request, response) => this.forecast(request, response));
    }

    search(request: Request, response: Response): void {
        Weather.geocode(decodeURIComponent(`${request.query.query}`)).then((position) => {
            Weather.search(position, parseInt(`${request.query.count || 5}`, 10)).then((results) => response.send(results)).catch(() => response.send([]));
        }).catch(() => response.send([]));
    }

    current(_request: Request, response: Response): void {
        Weather.current().then((results) => response.send(results)).catch(() => response.send({}));
    }

    forecast(_request: Request, response: Response): void {
        Weather.forecast().then((results) => response.send(results)).catch(() => response.send([]));
    }
}
