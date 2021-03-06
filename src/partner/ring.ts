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

import Axios from "axios";
import { Console } from "../services/logger";

export default class Ring {
    static async login(username: string, password: string, verification?: string): Promise<any> {
        let results;

        try {
            results = await Axios.post("https://oauth.ring.com/oauth/token", {
                client_id: "ring_official_android",
                scope: "client",
                grant_type: "password",
                password,
                username,
            },
            { headers: { "content-type": "application/json", "2fa-support": "true", "2fa-code": verification || "" } });

            return results.data;
        } catch (error) {
            if (error.response && error.response.status === 412) {
                return { status: 412 };
            }

            if (error.response && error.response.data) {
                return error.response.data;
            }

            Console.error("ring login failed");
            Console.error(error.message);

            return { error };
        }
    }
}
