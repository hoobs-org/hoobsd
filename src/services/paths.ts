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

import {
    ensureDirSync,
    existsSync,
    unlinkSync,
    removeSync,
    readdirSync,
} from "fs-extra";

import { join } from "path";
import Instance from "./instance";

export default class Paths {
    static tryCommand(command: string): boolean {
        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (existsSync(join(paths[i], command))) return true;
        }

        return false;
    }

    static tryUnlink(filename: string): boolean {
        if (existsSync(filename)) {
            try {
                unlinkSync(filename);
            } catch (_fail) {
                try {
                    removeSync(filename);
                } catch (_error) {
                    return false;
                }
            }
        }

        return true;
    }

    static isEmpty(path: string): boolean {
        if (existsSync(path)) {
            try {
                return (!(readdirSync(path)).length);
            } catch (_error) {
                return false;
            }
        }

        return false;
    }

    static storagePath(instance?: string): string {
        let path = "";

        if (Instance.container) {
            path = "/hoobs";
        } else if (process.env.APPDATA) {
            path = join(process.env.APPDATA, "HOOBS");
        } else if (process.platform === "darwin") {
            path = join(process.env.HOME || "", "/Library/Preferences/HOOBS");
        } else {
            path = join(process.env.HOME || "", ".hoobs");
        }

        if (instance && instance !== "") path = join(path, instance);

        ensureDirSync(path);

        return path;
    }

    static instancesPath(): string {
        return join(Paths.storagePath(), "instances.json");
    }

    static configPath(): string {
        return join(Paths.storagePath(), `${Instance.id}.config.json`);
    }

    static staticPath(): string {
        ensureDirSync(join(Paths.storagePath(), "static"));

        return join(Paths.storagePath(), "static");
    }

    static backupPath(): string {
        ensureDirSync(join(Paths.storagePath(), "backups"));

        return join(Paths.storagePath(), "backups");
    }

    static persistPath(): string {
        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.persist`));

        return join(Paths.storagePath(), `${Instance.id}.persist`);
    }

    static cachedAccessoryPath(): string {
        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.accessories`));

        return join(Paths.storagePath(), `${Instance.id}.accessories`);
    }
}
