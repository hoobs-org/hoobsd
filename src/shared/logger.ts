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
import Chalk from "chalk";
import { LogLevel, Logging } from "homebridge/lib/logger";
import Instance from "./instance";
import Socket from "../server/socket";
import { colorize, contrast } from "./helpers";

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

export const enum NotificationType {
    INFO = "info",
    SUCCESS = "success",
    WARN = "warn",
    ERROR = "error",
    DEBUG = "debug",
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
        Chalk.level = 1;

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

        if (data.message === "" && data.instance !== Instance.id) {
            return;
        }

        CACHE.push(data);

        while (CACHE.length > 500) {
            CACHE.shift();
        }

        if (Instance.api) Instance.io?.sockets.emit("log", data);
        if (Instance.server) Socket.fetch("log", data);

        if (Instance.id === "api" || Instance.debug) {
            const prefixes = [];

            if (Instance.timestamps && data.message && data.message !== "") {
                prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
            }

            if (data.instance && data.instance !== "" && data.instance !== Instance.id) {
                const foreground = colorize(data.instance);

                prefixes.push(Chalk.hex(foreground)(data.display || data.instance));
            }

            if (data.prefix && data.prefix !== "") {
                const background = colorize(data.prefix);
                const foreground = contrast(background);

                prefixes.push(Chalk.bgHex(background).hex(foreground)(` ${data.prefix} `));
            }

            let colored = data.message;

            switch (data.level) {
                case LogLevel.WARN:
                    colored = Chalk.yellow(data.message);
                    break;

                case LogLevel.ERROR:
                    colored = Chalk.red(data.message);
                    break;

                case LogLevel.DEBUG:
                    colored = Chalk.gray(data.message);
                    break;
            }

            const formatted = prefixes.length > 0 ? `${prefixes.join(" ")} ${colored}` : colored;

            switch (data.level) {
                case LogLevel.WARN:
                    CONSOLE_LOG(formatted);
                    break;

                case LogLevel.ERROR:
                    CONSOLE_ERROR(formatted);
                    break;

                case LogLevel.DEBUG:
                    if (Instance.debug) CONSOLE_LOG(formatted);
                    break;

                default:
                    if (Instance.id === "api" || Instance.debug) CONSOLE_LOG(formatted);
                    break;
            }
        }
    }

    import(data: Message[]) {
        CACHE.push(...(data.filter((m) => (m.message !== ""))));

        CACHE.sort((a, b) => {
            if (a.timestamp > b.timestamp) return 1;

            return -1;
        });

        while (CACHE.length > 500) {
            CACHE.shift();
        }

        for (let i = 0; i < data.length; i += 1) {
            Instance.io?.sockets.emit("log", data[i]);

            if (Instance.id === "api" || Instance.debug) {
                const prefixes = [];

                if (Instance.timestamps && data[i].message && data[i].message !== "") {
                    prefixes.push(Chalk.gray.dim(new Date(data[i].timestamp).toLocaleString()));
                }

                if (data[i].instance && data[i].instance !== "" && data[i].instance !== Instance.id) {
                    const foreground = colorize(data[i].instance!);

                    prefixes.push(Chalk.hex(foreground)(data[i].display || data[i].instance));
                }

                if (data[i].prefix && data[i].prefix !== "") {
                    const background = colorize(data[i].prefix!);
                    const foreground = contrast(background);

                    prefixes.push(Chalk.bgHex(background).hex(foreground)(` ${data[i].prefix} `));
                }

                let colored = data[i].message;

                switch (data[i].level) {
                    case LogLevel.WARN:
                        colored = Chalk.yellow(data[i].message);
                        break;

                    case LogLevel.ERROR:
                        colored = Chalk.red(data[i].message);
                        break;

                    case LogLevel.DEBUG:
                        colored = Chalk.gray(data[i].message);
                        break;
                }

                const formatted = prefixes.length > 0 ? `${prefixes.join(" ")} ${colored}` : colored;

                switch (data[i].level) {
                    case LogLevel.WARN:
                        CONSOLE_LOG(formatted);
                        break;

                    case LogLevel.ERROR:
                        CONSOLE_ERROR(formatted);
                        break;

                    case LogLevel.DEBUG:
                        if (Instance.debug) CONSOLE_LOG(formatted);
                        break;

                    default:
                        if (Instance.id === "api" || Instance.debug) CONSOLE_LOG(formatted);
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

    notify(event: string, instance: string, title: string, description: string, type: NotificationType, icon?: string): void {
        if (!icon) {
            switch (type) {
                case NotificationType.ERROR:
                    icon = "error";
                    break;

                case NotificationType.WARN:
                    icon = "warning";
                    break;

                case NotificationType.DEBUG:
                    icon = "bug_report";
                    break;

                default:
                    icon = "notifications_active";
                    break;
            }
        }

        if (Instance.api) {
            Instance.io?.sockets.emit("notification", {
                instance,
                event,
                data: {
                    title,
                    description,
                    type,
                    icon,
                },
            });
        }

        if (Instance.server) {
            Socket.fetch("notification", {
                instance,
                event,
                data: {
                    title,
                    description,
                    type,
                    icon,
                },
            });
        }
    }

    emit(event: string, instance: string, data: any): void {
        if (Instance.api) {
            Instance.io?.sockets.emit(event, {
                instance,
                data,
            });
        }

        if (Instance.server) {
            Socket.fetch(event, {
                instance,
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
    if (Instance.debug) system.info(message, ...parameters);
};

console.warn = function warn(message: string, ...parameters: any[]) {
    if (Instance.debug) system.warn(message, ...parameters);
};

console.error = function error(message: string, ...parameters: any[]) {
    system.error(message, ...parameters);
};

export function Print(...parameters: any[]) {
    if (Instance.verbose) CONSOLE_LOG(...parameters);
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
