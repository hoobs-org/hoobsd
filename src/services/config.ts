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

import Paths from "./paths";

export default class Config {
    declare readonly name: string;

    declare readonly display: string;

    declare private config: any;

    constructor(name: string) {
        this.config = Paths.configuration();

        const platform = this.config.platforms.find((p: any) => (p.plugin_map || {}).plugin_name === name);
        const accessory = this.config.accessories.find((p: any) => (p.plugin_map || {}).plugin_name === name);

        this.name = name;
        this.display = platform?.name || accessory?.name || name;
    }

    accessories(): any {
        return {
            add: (data: any) => {
                data.name = data.name || this.display;

                data.plugin_map = {
                    plugin_name: this.name,
                };

                this.config.accessories.push(data);

                Paths.saveConfig(this.config);
            },

            list: (): number[] => {
                const indexes: number[] = [];

                for (let i = 0; (this.config.accessories || []).length; i += 1) {
                    if ((this.config.accessories[i].plugin_map || {}).plugin_name === this.name) {
                        indexes.push(i);
                    }
                }

                return indexes;
            },
        };
    }

    accessory(index: number): any {
        if (this.accessories().indexOf(index) === -1) {
            return undefined;
        }

        return {
            get: (key: string): any => this.config.accessories[index][key],

            set: (key: string, value: any): void => {
                this.config.accessories[index][key] = value;

                this.config.accessories[index].plugin_map = {
                    plugin_name: this.name,
                };

                Paths.saveConfig(this.config);
            },
        };
    }

    get(key: string): any {
        const index = this.config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === this.name);

        if (index === -1) {
            return undefined;
        }

        return this.config.platforms[index][key];
    }

    set(key: string, value: any) {
        const index = this.config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === this.name);

        if (index >= 0) {
            this.config.platforms[index][key] = value;

            this.config.platforms[index].plugin_map = {
                plugin_name: this.name,
            };

            Paths.saveConfig(this.config);
        }
    }
}
