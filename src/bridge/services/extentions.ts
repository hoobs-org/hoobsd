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

/* eslint-disable max-classes-per-file */

import { Characteristic, Formats, Perms } from "hap-nodejs";

export class PluginID extends Characteristic {
    static readonly UUID: string = "00000004-0000-1000-8000-0026BB765291";

    constructor() {
        super("Plugin ID", "00000004-0000-1000-8000-0026BB765291", {
            format: Formats.STRING,
            perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });

        this.value = this.getDefaultValue();
    }
}

export class DeviceID extends Characteristic {
    static readonly UUID: string = "00000003-0000-1000-8000-0026BB765291";

    constructor() {
        super("Device ID", "00000003-0000-1000-8000-0026BB765291", {
            format: Formats.STRING,
            perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });

        this.value = this.getDefaultValue();
    }
}
