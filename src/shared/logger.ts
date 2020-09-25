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

import Utility from "util";
import { LogLevel, Logging } from "homebridge/lib/logger";
import Instance from "./instance";
import Socket from "../server/socket";

export interface Message {
    level: LogLevel,
    instance?: string,
    display?: string,
    timestamp: number,
    plugin?: string,
    prefix?: string,
    message: string,
}

export interface PluginLogger extends Logging {
    plugin?: string;
}

export interface Loggers {
    [key: string]: PluginLogger;
}

interface IntermediateLogger {
    prefix?: string;
    plugin?: string;

    (message: string, ...parameters: any[]): void;

    info?(message: string, ...parameters: any[]): void;
    warn?(message: string, ...parameters: any[]): void;
    error?(message: string, ...parameters: any[]): void;
    debug?(message: string, ...parameters: any[]): void;

    log?(level: LogLevel, message: string, ...parameters: any[]): void;
}

const CONSOLE_LOG = console.log;
const CONSOLE_ERROR = console.error;

const CACHE: Message[] = [];

class Logger {
    declare plugin?: string;

    declare prefix: string;

    constructor(plugin?: string, prefix?: string) {
        this.plugin = plugin;
        this.prefix = prefix || "";
    }

    cache(): Message[] {
        return CACHE;
    }

    log(level: LogLevel, message: string | Message, ...parameters: any[]): void {
        let data: Message;

        if (typeof message === "string") {
            data = {
                level,
                instance: Instance.id,
                display: Instance.display,
                timestamp: new Date().getTime(),
                plugin: this.plugin,
                prefix: this.prefix,
                message: Utility.format(`${message || ""}`.replace(/Homebridge/g, "Bridge"), ...parameters),
            };
        } else {
            data = message;
        }

        CACHE.push(data);

        while (CACHE.length >= 500) {
            CACHE.shift();
        }

        if (Instance.api) Instance.io?.sockets.emit("log", data);
        if (Instance.server) Socket.fetch("log", data);

        if ((data.level !== LogLevel.DEBUG && data.level !== LogLevel.WARN) || Instance.debug) {
            const prefixes = [];

            if (typeof message !== "string" && data.instance && data.instance !== "" && data.instance !== "api") {
                prefixes.push(data.instance);
            }

            if (data.prefix && data.prefix !== "") {
                prefixes.push(data.prefix);
            }

            const formatted = prefixes.length > 0 ? `[${prefixes.join(" - ")}] ${data.message}` : data.message;

            switch (data.level) {
                case LogLevel.WARN:
                case LogLevel.ERROR:
                    CONSOLE_ERROR(formatted);
                    break;

                default:
                    if (Instance.debug) {
                        CONSOLE_LOG(formatted);
                    }

                    break;
            }
        }
    }

    import(data: Message[]) {
        CACHE.push(...data);

        CACHE.sort((a, b) => {
            if (a.timestamp > b.timestamp) {
                return 1;
            }

            return -1;
        });

        while (CACHE.length >= 500) {
            CACHE.shift();
        }

        for (let i = 0; i < data.length; i += 1) {
            Instance.io?.sockets.emit("log", data[i]);

            if ((data[i].level !== LogLevel.DEBUG && data[i].level !== LogLevel.WARN) || Instance.debug) {
                const formatted = data[i].prefix ? `[${data[i].instance} - ${data[i].prefix}] ${data[i].message}` : `[${data[i].instance}] ${data[i].message}`;

                switch (data[i].level) {
                    case LogLevel.WARN:
                    case LogLevel.ERROR:
                        CONSOLE_ERROR(formatted);
                        break;

                    default:
                        if (Instance.debug) {
                            CONSOLE_LOG(formatted);
                        }

                        break;
                }
            }
        }
    }

    debug(message: string, ...parameters: any[]): void {
        this.log(LogLevel.DEBUG, message, ...parameters);
    }

    info(message: string, ...parameters: any[]): void {
        this.log(LogLevel.INFO, message, ...parameters);
    }

    warn(message: string, ...parameters: any[]): void {
        this.log(LogLevel.WARN, message, ...parameters);
    }

    error(message: string, ...parameters: any[]): void {
        this.log(LogLevel.ERROR, message, ...parameters);
    }

    message(event: string, instance: string, data: any): void {
        let name = event;

        if (Object.prototype.hasOwnProperty.call(data, "name")) {
            name = `${data.name}`;

            delete data.name;
        }

        if (Instance.api) {
            Instance.io?.sockets.emit(event, {
                instance,
                name,
                data,
            });
        }

        if (Instance.server) {
            Socket.fetch(event, {
                instance,
                name,
                data,
            });
        }
    }
}

const system: Logger = new Logger();

console.debug = function debug(message: string, ...parameters: any[]) {
    system.debug(message, ...parameters);
};

console.log = function log(message: string, ...parameters: any[]) {
    if (Instance.debug) {
        system.info(message, ...parameters);
    }
};

console.warn = function warn(message: string, ...parameters: any[]) {
    if (Instance.debug) {
        system.warn(message, ...parameters);
    }
};

console.error = function error(message: string, ...parameters: any[]) {
    system.error(message, ...parameters);
};

export function Print(...parameters: any[]) {
    if (Instance.verbose) {
        CONSOLE_LOG(...parameters);
    }
}

export const Console: Logger = system;

export function Prefixed(plugin: string, prefix: string) {
    if (!Instance.loggers[prefix]) {
        const logger = new Logger(plugin, prefix);
        const prefixed: IntermediateLogger = logger.info.bind(logger);

        prefixed.prefix = logger.prefix || "";
        prefixed.plugin = logger.plugin;

        prefixed.debug = logger.debug;
        prefixed.info = logger.info;
        prefixed.warn = logger.warn;
        prefixed.error = logger.error;
        prefixed.log = logger.log;

        Instance.loggers[prefix] = <PluginLogger>prefixed;
    }

    return Instance.loggers[prefix];
}
