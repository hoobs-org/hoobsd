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
import Forms from "formidable";
import State from "../../state";
import Themes from "../services/themes";
import Security from "../../services/security";

export default class ThemesController {
    constructor() {
        State.app?.get("/api/theme/:name", (request, response) => this.get(request, response));
        State.app?.post("/api/theme/:name", Security, (request, response) => this.save(request, response));
        State.app?.post("/api/themes/backdrop", Security, (request, response) => this.backdrop(request, response));
    }

    get(request: Request, response: Response): void {
        response.send(Themes.get(request.params.name));
    }

    save(request: Request, response: Response): void {
        Themes.save(request.params.name, request.body);

        response.send({
            success: true,
        });
    }

    backdrop(request: Request, response: Response): void {
        const form = new Forms.IncomingForm();

        form.multiples = false;
        form.maxFileSize = 5 * 1024 * 1024 * 1024;

        form.parse(request, (_error, _fields, files) => {
            const file = <Forms.File>files.file;
            const filename = Themes.backdrop(file.path, file.type);

            response.send({
                filename,
            });
        });
    }
}
