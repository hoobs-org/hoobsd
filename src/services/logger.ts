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
import State from "../state";
import Paths from "./paths";
import Socket from "../bridge/services/socket";
import { formatJson } from "./json";
import { colorize } from "./formatters";

export interface Message {
    level: LogLevel;
    bridge?: string;
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
    ROOM_CHANGE = "room_change",
    CONFIG_CHANGE = "config_change",
    PUBLISH_SETUP_URI = "publish_setup_uri",
    REQUEST = "request",
    COMPLETE = "complete",
    SHUTDOWN = "shutdown",
    RESTART = "restart",
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

    cache(tail?: number, bridge?: string): Message[] {
        const results = [...(CACHE.filter((m) => (bridge ? m.bridge === bridge : true)))];

        if (tail && tail > 0 && tail < results.length) {
            results.splice(0, results.length - tail);
        }

        if (State.id !== "hub") {
            CACHE = [];
        }

        return results;
    }

    save() {
        if (State.id === "hub") {
            Paths.saveJson(Paths.log, CACHE, false, undefined, true);
        }
    }

    load() {
        if (State.id === "hub") {
            CACHE = Paths.loadJson<Message[]>(Paths.log, [], undefined, true);

            CACHE.sort((a, b) => {
                if (a.timestamp > b.timestamp) return 1;

                return -1;
            });

            if (CACHE.length > 7000) {
                CACHE.splice(0, CACHE.length - 7000);
            }
        }
    }

    log(level: LogLevel, message: string | Message, ...parameters: any[]): void {
        let data: Message;

        const prefixes = [];
        const ascii = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g; // eslint-disable-line no-control-regex

        if (typeof message === "string") {
            if (!message || message === "") return;

            if (message.match(/^(?=.*\binitializing\b)(?=.*\bhap-nodejs\b).*$/gmi)) return;
            if (message.match(/^(?=.*\bhoobs\b)(?=.*\bhomebridge\b).*$/gmi)) return;
            if (message.match(/^(?=.*\brecommended\b)(?=.*\bnode\b).*$/gmi)) return;
            if (message.match(/^(?=.*\brecommended\b)(?=.*\bhomebridge\b).*$/gmi)) return;

            data = {
                level,
                bridge: State.id,
                display: State.display,
                timestamp: new Date().getTime(),
                plugin: this.plugin,
                prefix: this.prefix,
                message: Utility.format(`${message || ""}`.replace(/Homebridge/g, "Bridge").replace(ascii, ""), ...parameters),
            };
        } else {
            data = message;
        }

        data.message = data.message || "";

        if (data.message === "" && (data.bridge !== State.id || (data.prefix && data.prefix !== ""))) return;
        if ((data.message || "").toLowerCase().indexOf("node") >= 0 && (data.message || "").toLowerCase().indexOf("version") >= 0) return;
        if ((data.message || "").toLowerCase().indexOf("node") >= 0 && (data.message || "").toLowerCase().indexOf("recommended") >= 0) return;
        if ((data.message || "").match(/\b(coolingsetpoint|heatingsetpoint|set homekit)\b/gmi)) data.level = LogLevel.DEBUG;

        let colored: string;

        switch (data.level) {
            case LogLevel.WARN:
                colored = data.message;

                if (State.bridge) Socket.emit(Events.LOG, data);
                if ((State.hub || State.bridge) && (State.id === "hub" || !Socket.up())) CACHE.push(data);
                if (State.hub && State.hub.running) State.io?.sockets.emit(Events.LOG, data);

                if (State.id === "hub" || State.debug) {
                    if (State.timestamps && data.message && data.message !== "") prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
                    if (data.bridge && data.bridge !== "" && data.bridge !== State.id) prefixes.push(colorize(State.bridges.findIndex((bridge) => bridge.id === data.bridge), true)(data.display || data.bridge));
                    if (data.prefix && data.prefix !== "") prefixes.push(colorize(data.prefix)(data.prefix));

                    colored = `${Chalk.bgYellow.black(" WARNING ")} ${Chalk.yellow(data.message)}`;

                    CONSOLE_LOG(prefixes.length > 0 ? `${prefixes.join(" ")} ${colored}` : colored);
                }

                break;

            case LogLevel.ERROR:
                colored = data.message;

                if (State.bridge) Socket.emit(Events.LOG, data);
                if ((State.hub || State.bridge) && (State.id === "hub" || !Socket.up())) CACHE.push(data);
                if (State.hub && State.hub.running) State.io?.sockets.emit(Events.LOG, data);

                if (State.id === "hub" || State.debug) {
                    if (State.timestamps && data.message && data.message !== "") prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
                    if (data.bridge && data.bridge !== "" && data.bridge !== State.id) prefixes.push(colorize(State.bridges.findIndex((bridge) => bridge.id === data.bridge), true)(data.display || data.bridge));
                    if (data.prefix && data.prefix !== "") prefixes.push(colorize(data.prefix)(data.prefix));

                    colored = `${Chalk.bgRed.black(" ERROR ")} ${Chalk.red(data.message)}`;

                    CONSOLE_ERROR(prefixes.length > 0 ? `${prefixes.join(" ")} ${colored}` : colored);
                }

                break;

            case LogLevel.DEBUG:
                if (State.id === "hub" || State.debug) {
                    colored = data.message;

                    if (State.bridge) Socket.emit(Events.LOG, data);
                    if ((State.hub || State.bridge) && (State.id === "hub" || !Socket.up())) CACHE.push(data);
                    if (State.hub && State.hub.running) State.io?.sockets.emit(Events.LOG, data);

                    if (State.timestamps && data.message && data.message !== "") prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
                    if (data.bridge && data.bridge !== "" && data.bridge !== State.id) prefixes.push(colorize(State.bridges.findIndex((bridge) => bridge.id === data.bridge), true)(data.display || data.bridge));
                    if (data.prefix && data.prefix !== "") prefixes.push(colorize(data.prefix)(data.prefix));

                    colored = Chalk.gray(data.message);

                    CONSOLE_LOG(prefixes.length > 0 ? `${prefixes.join(" ")} ${colored}` : colored);
                }

                break;

            default:
                colored = data.message;

                if (State.bridge) Socket.emit(Events.LOG, data);
                if ((State.hub || State.bridge) && (State.id === "hub" || !Socket.up())) CACHE.push(data);
                if (State.hub && State.hub.running) State.io?.sockets.emit(Events.LOG, data);

                if (State.id === "hub" || State.debug) {
                    if (State.timestamps && data.message && data.message !== "") prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
                    if (data.bridge && data.bridge !== "" && data.bridge !== State.id) prefixes.push(colorize(State.bridges.findIndex((bridge) => bridge.id === data.bridge), true)(data.display || data.bridge));
                    if (data.prefix && data.prefix !== "") prefixes.push(colorize(data.prefix)(data.prefix));

                    CONSOLE_LOG(prefixes.length > 0 ? `${prefixes.join(" ")} ${colored}` : colored);
                }

                break;
        }

        if (CACHE.length > 7000) CACHE.splice(0, CACHE.length - 7000);
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

    notify(bridge: string, title: string, description: string, type: NotificationType, icon?: string): void {
        if (!icon) {
            switch (type) {
                case NotificationType.ERROR:
                    icon = "alert-octagon";
                    break;

                case NotificationType.WARN:
                    icon = "alert";
                    break;

                case NotificationType.DEBUG:
                    icon = "bug";
                    break;

                default:
                    icon = "bell";
                    break;
            }
        }

        if (State.hub && State.hub.running) {
            State.io?.sockets.emit(Events.NOTIFICATION, {
                bridge,
                data: {
                    title,
                    description,
                    type,
                    icon,
                },
            });
        }

        if (State.bridge) {
            Socket.emit(Events.NOTIFICATION, {
                bridge,
                data: {
                    title,
                    description,
                    type,
                    icon,
                },
            });
        }
    }

    emit(event: Events, bridge: string, data: any): void {
        if (State.hub && State.hub.running) {
            State.io?.sockets.emit(event, {
                bridge,
                data,
            });
        }

        if (State.bridge) {
            Socket.emit(event, {
                bridge,
                data,
            });
        }
    }
}

const system: Logger = new Logger();

console.debug = function debug(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.debug(message, ...parameters);
    } else {
        system.debug(formatJson(message));
    }
};

console.log = function log(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.info(message, ...parameters);
    } else {
        system.info(formatJson(message));
    }
};

console.warn = function warn(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.warn(message, ...parameters);
    } else {
        system.warn(formatJson(message));
    }
};

console.error = function error(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.error(message, ...parameters);
    } else {
        system.error(formatJson(message));
    }
};

export function Print(...parameters: any[]) {
    if (State.verbose) CONSOLE_LOG(...parameters);
}

export const Console: Logger = system;

export function Prefixed(plugin: string, prefix: string) {
    if (!State.loggers[prefix]) {
        const logger = new Logger(plugin, prefix);
        const prefixed: IntermediateLogger = logger.info.bind(logger);

        prefixed.prefix = logger.prefix || "";
        prefixed.plugin = logger.plugin;

        prefixed.debug = logger.debug;
        prefixed.info = logger.info;
        prefixed.warn = logger.warn;
        prefixed.error = logger.error;
        prefixed.log = logger.log;

        State.loggers[prefix] = <PluginLogger>prefixed;
    }

    return State.loggers[prefix];
}
