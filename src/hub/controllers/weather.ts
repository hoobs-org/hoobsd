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
        State.app?.get("/api/weather/location", Security, (request, response) => this.search(request, response));
        State.app?.get("/api/weather/current", Security, (request, response) => this.current(request, response));
        State.app?.get("/api/weather/forecast", Security, (request, response) => this.forecast(request, response));
    }

    async search(request: Request, response: Response): Promise<void> {
        const position = await Weather.geocode(decodeURIComponent(`${request.query.query}`));
        const results = await Weather.search(position, parseInt(`${request.query.count || 5}`, 10));

        response.send(results);
    }

    async current(_request: Request, response: Response): Promise<void> {
        const results = await Weather.current();

        response.send(results);
    }

    async forecast(_request: Request, response: Response): Promise<void> {
        const results = await Weather.forecast();

        response.send(results);
    }
}
