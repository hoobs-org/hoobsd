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

import { Request, Response, NextFunction } from "express-serve-static-core";
import State from "../state";
import Users from "./users";

export default async function Security(request: Request, response: Response, next: NextFunction, deny?: NextFunction): Promise<void> {
    if (State.hub?.settings.disable_auth) {
        next();

        return;
    }

    if ((!request.headers.authorization || !(await Users.validateToken(request.headers.authorization)))) {
        if (deny) {
            deny();
        } else {
            response.status(403).json({
                error: "unauthorized",
            });
        }

        return;
    }

    next();
}
