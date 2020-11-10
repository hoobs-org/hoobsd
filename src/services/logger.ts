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
import { gzipSync, gunzipSync } from "zlib";
import { readFileSync, writeFileSync } from "fs-extra";
import { LogLevel, Logging } from "homebridge/lib/logger";
import Instance from "./instance";
import Paths from "./paths";
import Socket from "../server/services/socket";

import {
    formatJson,
    parseJson,
    colorize,
} from "./formatters";

export interface Message {
    level: LogLevel;
    instance?: string;
    display?: string;
    timestamp: number;
    plugin?: string;
    prefix?: string;
    message: string;
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

export const enum Events {
    PING = "ping",
    PONG = "pong",
    LOG = "log",
    LISTENING = "listening",
    MONITOR = "monitor",
    HEARTBEAT = "heartbeat",
    NOTIFICATION = "notification",
    ACCESSORY_CHANGE = "accessory_change",
    CONFIG_CHANGE = "config_change",
    PUBLISH_SETUP_URI = "publish_setup_uri",
    REQUEST = "request",
    COMPLETE = "complete",
    SHELL_OUTPUT = "shell_output",
    SHELL_INPUT = "shell_input",
    SHELL_RESIZE = "shell_resize",
    SHELL_CLEAR = "shell_clear",
    SHELL_CONNECT = "shell_connect",
    SHELL_DISCONNECT = "shell_disconnect",
    SHUTDOWN = "shutdown",
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

let CACHE: Message[] = [];

class Logger {
    declare plugin?: string;

    declare prefix: string;

    constructor(plugin?: string, prefix?: string) {
        Chalk.level = 1;

        this.plugin = plugin;
        this.prefix = prefix || "";
    }

    cache(tail?: number, instance?: string): Message[] {
        const results = [...(CACHE.filter((m) => (instance ? m.instance === instance : true)))];

        if (tail && tail > 0 && tail < results.length) {
            results.splice(0, results.length - tail);
        }

        if (Instance.id !== "api") {
            CACHE = [];
        }

        return results;
    }

    load() {
        if (Instance.id === "api") {
            try {
                CACHE = parseJson<Message[]>(gunzipSync(readFileSync(Paths.logPath())).toString(), []);
            } catch (_error) {
                CACHE = [];
            }

            CACHE.sort((a, b) => {
                if (a.timestamp > b.timestamp) return 1;

                return -1;
            });

            if (CACHE.length > 5000) {
                CACHE.splice(0, CACHE.length - 5000);
            }
        }
    }

    log(level: LogLevel, message: string | Message, ...parameters: any[]): void {
        let data: Message;

        const ascii = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g; // eslint-disable-line no-control-regex

        if (typeof message === "string") {
            data = {
                level,
                instance: Instance.id,
                display: Instance.display,
                timestamp: new Date().getTime(),
                plugin: this.plugin,
                prefix: this.prefix,
                message: Utility.format(`${message || ""}`.replace(/Homebridge/g, "Bridge").replace(ascii, ""), ...parameters),
            };
        } else {
            data = message;
        }

        if (data.message === "" && (data.instance !== Instance.id || (data.prefix && data.prefix !== ""))) return;
        if (data.message.toLowerCase().indexOf("node") >= 0 && data.message.toLowerCase().indexOf("version") >= 0) return;
        if (data.message.toLowerCase().indexOf("node") >= 0 && data.message.toLowerCase().indexOf("recommended") >= 0) return;

        if ((Instance.api || Instance.server) && (Instance.id === "api" || !Socket.up())) {
            CACHE.push(data);

            if (CACHE.length > 5000) {
                CACHE.splice(0, CACHE.length - 5000);
            }

            if (Instance.id === "api") {
                writeFileSync(Paths.logPath(), gzipSync(formatJson(CACHE)));
            }
        }

        if (Instance.api && Instance.api.running) Instance.io?.sockets.emit(Events.LOG, data);
        if (Instance.server) Socket.fetch(Events.LOG, data);

        if (Instance.id === "api" || Instance.debug) {
            const prefixes = [];

            if (Instance.timestamps && data.message && data.message !== "") {
                prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
            }

            if (data.instance && data.instance !== "" && data.instance !== Instance.id) {
                prefixes.push(colorize(Instance.instances.findIndex((instance) => instance.id === data.instance), true)(data.display || data.instance));
            }

            if (data.prefix && data.prefix !== "") {
                prefixes.push(colorize(data.prefix)(data.prefix));
            }

            let colored = data.message;

            switch (data.level) {
                case LogLevel.WARN:
                    colored = `${Chalk.bgYellow.black(" WARNING ")} ${Chalk.yellow(data.message)}`;
                    break;

                case LogLevel.ERROR:
                    colored = `${Chalk.bgRed.black(" ERROR ")} ${Chalk.red(data.message)}`;
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
        if (Instance.api && Instance.api.running && Instance.id === "api") {
            CACHE.push(...(data.filter((m) => (m.message !== ""))));

            CACHE.sort((a, b) => {
                if (a.timestamp > b.timestamp) return 1;

                return -1;
            });

            if (CACHE.length > 5000) {
                CACHE.splice(0, CACHE.length - 5000);
            }

            writeFileSync(Paths.logPath(), gzipSync(formatJson(CACHE)));

            for (let i = 0; i < data.length; i += 1) {
                Instance.io?.sockets.emit(Events.LOG, data[i]);

                if (Instance.id === "api" || Instance.debug) {
                    const prefixes = [];

                    if (Instance.timestamps && data[i].message && data[i].message !== "") {
                        prefixes.push(Chalk.gray.dim(new Date(data[i].timestamp).toLocaleString()));
                    }

                    if (data[i].instance && data[i].instance !== "" && data[i].instance !== Instance.id) {
                        prefixes.push(colorize(Instance.instances.findIndex((instance) => instance.id === data[i].instance), true)(data[i].display || data[i].instance));
                    }

                    if (data[i].prefix && data[i].prefix !== "") {
                        prefixes.push(colorize(data[i].prefix!)(data[i].prefix));
                    }

                    let colored = data[i].message;

                    switch (data[i].level) {
                        case LogLevel.WARN:
                            colored = `${Chalk.bgYellow.black(" WARNING ")} ${Chalk.yellow(data[i].message)}`;
                            break;

                        case LogLevel.ERROR:
                            colored = `${Chalk.bgRed.black(" ERROR ")} ${Chalk.red(data[i].message)}`;
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

    notify(instance: string, title: string, description: string, type: NotificationType, icon?: string): void {
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

        if (Instance.api && Instance.api.running) {
            Instance.io?.sockets.emit(Events.NOTIFICATION, {
                instance,
                data: {
                    title,
                    description,
                    type,
                    icon,
                },
            });
        }

        if (Instance.server) {
            Socket.fetch(Events.NOTIFICATION, {
                instance,
                data: {
                    title,
                    description,
                    type,
                    icon,
                },
            });
        }
    }

    emit(event: Events, instance: string, data: any): void {
        if (Instance.api && Instance.api.running) {
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
