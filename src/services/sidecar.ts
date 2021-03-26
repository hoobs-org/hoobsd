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

import { join } from "path";
import { existsSync } from "fs-extra";
import Paths from "./paths";
import System from "./system";

export default class Sidecar {
    static install(bridge: string, identifier: string, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            System.execute(`${Paths.yarn} add --unsafe-perm --ignore-engines ${name}@latest`, { cwd: Paths.data(bridge) }).then(() => {
                setTimeout(() => {
                    if (existsSync(join(join(Paths.data(bridge), "node_modules", name), "package.json"))) {
                        const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(bridge), "sidecars.json"), {});

                        sidecars[identifier] = name;

                        Paths.saveJson(join(Paths.data(bridge), "sidecars.json"), sidecars, true);
                        resolve();
                    } else {
                        reject();
                    }
                }, 2 * 1000);
            });
        });
    }

    static uninstall(bridge: string, identifier: string, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            System.execute(`${Paths.yarn} remove ${name}`, { cwd: Paths.data(bridge) }).then(() => {
                if (!existsSync(join(Paths.data(bridge), "node_modules", name, "package.json"))) {
                    const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(bridge), "sidecars.json"), {});

                    delete sidecars[identifier];

                    Paths.saveJson(join(Paths.data(bridge), "sidecars.json"), sidecars, true);
                    resolve();
                } else {
                    reject();
                }
            });
        });
    }

    static upgrade(bridge: string, identifier: string, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const flags = [];

            if (existsSync(join(Paths.data(bridge), "node_modules", name))) {
                flags.push("upgrade");
            } else {
                flags.push("add");
                flags.push("--unsafe-perm");
            }

            flags.push("--ignore-engines");
            flags.push(`${name}@latest`);

            System.execute(`${Paths.yarn} ${flags.join(" ")}`, { cwd: Paths.data(bridge) }).then(() => {
                setTimeout(() => {
                    if (existsSync(join(join(Paths.data(bridge), "node_modules", name), "package.json"))) {
                        const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(bridge), "sidecars.json"), {});

                        sidecars[identifier] = name;

                        Paths.saveJson(join(Paths.data(bridge), "sidecars.json"), sidecars, true);
                        resolve();
                    } else {
                        reject();
                    }
                }, 2 * 1000);
            });
        });
    }
}
