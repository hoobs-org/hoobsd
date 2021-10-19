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

import File from "fs-extra";
import { join } from "path";
import { gzipSync, gunzipSync } from "zlib";
import { Cipher, createCipheriv, createDecipheriv } from "crypto";
import State from "../state";
import System from "./system";
import { parseJson, formatJson } from "./json";
import { Console } from "./logger";

export default class Paths {
    static touch(filename: string) {
        const now = new Date();

        try {
            File.utimesSync(filename, now, now);
        } catch (err) {
            File.closeSync(File.openSync(filename, "w"));
        }
    }

    static loadJson<T>(file: string, replacement: T, key?: string, compressed?: boolean): T {
        if (!File.existsSync(file)) return replacement;

        let contents: Buffer | undefined;

        try {
            contents = File.readFileSync(file);
        } catch (error: any) {
            Console.error(error.message);

            return replacement;
        }

        if (compressed) {
            try {
                contents = gunzipSync(contents);
            } catch (error: any) {
                Console.error(error.message);

                return replacement;
            }
        }

        let result: T;
        let cipher: Cipher | undefined;
        let decrypted: string | Buffer | undefined;

        if (key) {
            cipher = createDecipheriv("aes-256-cbc", key, "XT2IN0SK62F1DK5G");
            decrypted = cipher.update(contents.toString(), "hex", "utf8") + cipher.final("utf8");
            result = parseJson<T>(decrypted, replacement);
        } else {
            result = parseJson<T>(contents.toString(), replacement);
        }

        contents = undefined;
        cipher = undefined;
        decrypted = undefined;

        return result;
    }

    static saveJson<T>(file: string, value: T, pretty?: boolean, key?: string, compress?: boolean): void {
        let contents: string | Buffer | undefined = formatJson(value, pretty);
        let cipher: Cipher | undefined;

        if (key) {
            cipher = createCipheriv("aes-256-cbc", key, "XT2IN0SK62F1DK5G");
            contents = cipher.update(formatJson(value, pretty), "utf8", "hex") + cipher.final("hex");
        }

        if (compress) contents = gzipSync(contents);

        File.writeFileSync(file, contents);

        contents = undefined;
        cipher = undefined;
    }

    static tryCommand(command: string): boolean {
        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (File.existsSync(join(paths[i], command))) return true;
        }

        return false;
    }

    static tryUnlink(filename: string): boolean {
        if (File.existsSync(filename)) {
            try {
                File.unlinkSync(filename);
            } catch (_fail) {
                try {
                    File.removeSync(filename);
                } catch (_error) {
                    return false;
                }
            }
        }

        return true;
    }

    static isEmpty(path: string): boolean {
        if (File.existsSync(path)) {
            try {
                return (!(File.readdirSync(path)).length);
            } catch (_error) {
                return false;
            }
        }

        return false;
    }

    static get application(): string {
        return File.existsSync(join(__dirname, "../package.json")) ? join(__dirname, "../") : join(__dirname, "../../../");
    }

    static get yarn(): string {
        return join(Paths.application, "/node_modules/yarn/bin/yarn");
    }

    static data(bridge?: string): string {
        let path = "/var/lib/hoobs";

        if (System.platform === "docker") path = "/hoobs";
        if (bridge && bridge !== "") path = join(path, bridge);

        File.ensureDirSync(path);

        return path;
    }

    static get log(): string {
        return join(Paths.data(), "hoobs.log");
    }

    static get layout(): string {
        return join(Paths.data(), "layout.conf");
    }

    static get themes(): string {
        File.ensureDirSync(join(Paths.data(State.id), "themes"));

        return join(Paths.data(State.id), "themes");
    }

    static get bridges(): string {
        return join(Paths.data(), "bridges.conf");
    }

    static get config(): string {
        return join(Paths.data(), `${State.id}.conf`);
    }

    static get static(): string {
        File.ensureDirSync(join(Paths.data(), "static"));

        return join(Paths.data(), "static");
    }

    static get backups(): string {
        File.ensureDirSync(join(Paths.data(), "backups"));

        return join(Paths.data(), "backups");
    }

    static get persist(): string {
        File.ensureDirSync(join(Paths.data(), `${State.id}.persist`));

        return join(Paths.data(), `${State.id}.persist`);
    }

    static get accessories(): string {
        File.ensureDirSync(join(Paths.data(), `${State.id}.accessories`));

        return join(Paths.data(), `${State.id}.accessories`);
    }
}
