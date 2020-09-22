/**************************************************************************************************
 * HOOBSD                                                                                         *
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

import Instance from "../shared/instance";
import { Log } from "../shared/logger";

export default async function Heartbeat() {
    Log.message("heartbeat", Instance.id, {
        version: Instance.version,
        running: Instance.bridge?.running,
        status: Instance.bridge?.running ? "running" : "stopped",
        uptime: new Date().getTime() - (Instance.server ? Instance.server.time : 0),
    });

    setTimeout(() => {
        Heartbeat();
    }, (Instance.server?.settings.polling_seconds || 3) * 1000);
}
