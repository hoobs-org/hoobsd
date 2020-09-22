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

import { EventEmitter } from "events";
import Instance from "../shared/instance";
import Paths from "../shared/paths";
import Cache from "../shared/cache";

import CacheController from "./cache";
import StatusController from "./status";
import ConfigController from "./config";
import BridgeController from "./bridge";
import PluginsController from "./plugins";
import AccessoriesController from "./accessories";

export default class Server extends EventEmitter {
    declare time: number;

    declare config: any;

    declare settings: any;

    constructor() {
        super();

        this.time = 0;
        this.config = Paths.configuration();
        this.settings = (this.config || {}).server || {};

        Instance.cache = new Cache();

        new CacheController();
        new StatusController();
        new ConfigController();
        new BridgeController();
        new PluginsController();
        new AccessoriesController();
    }
}
