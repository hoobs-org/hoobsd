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

/* eslint-disable no-template-curly-in-string */
/* eslint-disable prefer-destructuring */

import OS from "os";
import Path from "path";

import {
    exec,
    spawn,
    execSync,
    SpawnOptionsWithoutStdio,
} from "child_process";

import { existsSync, readFileSync, writeFileSync } from "fs-extra";
import ReadLines from "n-readlines";
import Semver from "semver";
import State from "../state";
import Paths from "./paths";
import { Console } from "./logger";

export const enum ProcessQuery {
    PID = "pid",
    PORT = "port",
}

export const enum LedStatus {
    GOOD = "good",
    ERROR = "error",
    STOPPED = "stopped",
}

export default class System {
    static led(status: LedStatus) {
        if (existsSync("/sys/devices/platform/leds/leds/ACT/brightness") && existsSync("/sys/devices/platform/leds/leds/PWR/brightness")) {
            switch (status) {
                case LedStatus.GOOD:
                    writeFileSync("/sys/devices/platform/leds/leds/ACT/brightness", "255");
                    writeFileSync("/sys/devices/platform/leds/leds/PWR/brightness", "0");
                    break;

                case LedStatus.ERROR:
                    writeFileSync("/sys/devices/platform/leds/leds/ACT/brightness", "0");
                    writeFileSync("/sys/devices/platform/leds/leds/PWR/brightness", "255");
                    break;

                default:
                    writeFileSync("/sys/devices/platform/leds/leds/ACT/brightness", "0");
                    writeFileSync("/sys/devices/platform/leds/leds/PWR/brightness", "0");
                    break;
            }
        } else if (existsSync("/sys/class/leds/led0/brightness") && existsSync("/sys/class/leds/led1/brightness")) {
            switch (status) {
                case LedStatus.GOOD:
                    writeFileSync("/sys/class/leds/led0/brightness", "255");
                    writeFileSync("/sys/class/leds/led1/brightness", "0");
                    break;

                case LedStatus.ERROR:
                    writeFileSync("/sys/class/leds/led0/brightness", "0");
                    writeFileSync("/sys/class/leds/led1/brightness", "255");
                    break;

                default:
                    writeFileSync("/sys/class/leds/led0/brightness", "0");
                    writeFileSync("/sys/class/leds/led1/brightness", "0");
                    break;
            }
        }
    }

    static commandExists(command: string): boolean {
        const paths = (process.env.PATH || "").replace(/["]+/g, "").split(Path.delimiter).filter((item) => item && item !== "");

        for (let i = 0; i < paths.length; i += 1) {
            if (existsSync(Path.join(paths[i], command))) return true;
        }

        return false;
    }

    static grep(file: string, ...search: string[]) {
        if (!existsSync(file)) return undefined;

        const reader = new ReadLines(file);
        const expression = new RegExp(`(${search.join("|")})`);

        let line: false | Buffer = reader.next();

        while (line) {
            if (line.toString().match(expression)) return line.toString();

            line = reader.next();
        }

        return undefined;
    }

    static info(): { [key: string]: any } {
        const key = "system/info";
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        const results: { [key: string]: any } = {};
        const release = OS.platform().toLowerCase();

        let values = [];

        switch (release) {
            case "darwin":
                values = (System.shell("sw_vers", true)).split("\n");

                results.distribution = ((values.find((item) => item.startsWith("ProductName:")) || "").split(":")[1] || "").trim();
                results.version = ((values.find((item) => item.startsWith("ProductVersion:")) || "").split(":")[1] || "").trim();
                break;

            case "linux":
                values = (System.shell("cat /etc/*-release", true)).split("\n");

                results.distribution = ((values.find((item) => item.startsWith("ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                results.version = ((values.find((item) => item.startsWith("VERSION_ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                break;
        }

        results.arch = OS.arch();
        results.init_system = "";
        results.repo = "stable";

        if (existsSync("/etc/systemd/system")) results.init_system = "systemd";
        if (existsSync("/Library/LaunchDaemons/")) results.init_system = "launchd";

        switch (results.distribution) {
            case "alpine":
                results.package_manager = System.commandExists("apk") ? "apk" : "";
                break;

            case "ubuntu":
            case "debian":
            case "raspbian":
                results.package_manager = System.commandExists("apt-get") ? "apt-get" : "";

                if (existsSync("/etc/apt/sources.list.d/hoobs.list")) {
                    const match = System.grep("/etc/apt/sources.list.d/hoobs.list", "bleeding", "edge");

                    if (match && match.indexOf("edge")) {
                        results.repo = "edge";
                    } else if (match && match.indexOf("bleeding")) {
                        results.repo = "bleeding";
                    }
                }

                System.switch(results.package_manager, results.repo);

                break;

            case "fedora":
            case "rhel":
            case "centos":
                if (System.commandExists("dnf")) {
                    results.package_manager = "dnf";
                } else if (System.commandExists("yum")) {
                    results.package_manager = "yum";
                } else {
                    results.package_manager = "";
                }

                break;

            default:
                results.package_manager = "";
        }

        results.mdns = false;
        results.mdns_broadcast = "";
        results.product = "";
        results.model = "";
        results.sku = "";

        if (existsSync("/etc/hoobs")) {
            const reader = new ReadLines("/etc/hoobs");

            let line: false | Buffer = reader.next();

            while (line) {
                const field = line.toString().split("=");

                if (field[0] === "ID") results.product = field[1];
                if (field[0] === "MODEL") results.model = field[1];
                if (field[0] === "SKU") results.sku = field[1];

                line = reader.next();
            }
        }

        if ((results.product === "box" || results.product === "card") && results.init_system === "systemd" && existsSync("/etc/avahi/avahi-daemon.conf")) {
            let broadcast = System.grep("/etc/avahi/avahi-daemon.conf", "host-name=");

            if (!broadcast || broadcast.indexOf("#") >= 0) {
                broadcast = OS.hostname().toLowerCase();
            } else {
                broadcast = (broadcast.split("=")[1] || "").toLowerCase();
            }

            results.mdns = true;
            results.mdns_broadcast = broadcast;
        }

        return State.cache?.set(key, results, 14 * 24 * 60);
    }

    static hostname(value: string) {
        const system = System.info();

        if (system.mdns) {
            let formatted = value || "";

            formatted = formatted.replace("https://", "");
            formatted = formatted.replace("http://", "");
            formatted = formatted.replace(/ /g, "-");
            formatted = formatted.split(".")[0];

            if (formatted && formatted !== "" && formatted !== system.mdns_broadcast) {
                const broadcast = System.grep("/etc/avahi/avahi-daemon.conf", "host-name=");
                const content = readFileSync("/etc/avahi/avahi-daemon.conf").toString();

                if (broadcast) {
                    writeFileSync("/etc/avahi/avahi-daemon.conf", content.replace(broadcast, `host-name=${formatted}`));
                    execSync("systemctl restart avahi-daemon");
                    State.cache?.remove("system/info");
                }
            }
        }
    }

    static kill(type: ProcessQuery, value: any) {
        switch (type) {
            case ProcessQuery.PORT:
                value = System.shell(`lsof -t -i:${value}`);
                break;
        }

        if (!Number.isNaN(parseInt(value, 10))) System.shell(`kill -9 ${value}`);
    }

    static shell(command: string, multiline?: boolean): string {
        try {
            const results = execSync(command, { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();

            if (!multiline) return results.replace(/\n/g, "");

            return results;
        } catch (_error) {
            return "";
        }
    }

    static execute(command: string, options?: SpawnOptionsWithoutStdio): Promise<void> {
        return new Promise((resolve) => {
            const commands: string[] = [...(command.match(/(".*?"|[^"\s]+)+(?=\s*|\s*$)/g) || [])];

            if (!commands || commands.length === 0) {
                resolve();

                return;
            }

            const proc = spawn(commands.shift() || "", commands, options || { detached: true });

            proc.stdout?.on("data", (data) => {
                const messages: string[] = data.toString().split("\n");

                for (let i = 0; i < messages.length; i += 1) {
                    const message = messages[i].trim();

                    if (message !== "") Console.debug(messages[i].trim());
                }
            });

            proc.stderr?.on("data", (data) => {
                const messages: string[] = data.toString().split("\n");

                for (let i = 0; i < messages.length; i += 1) {
                    const message = messages[i].trim();

                    if (message !== "") Console.debug(messages[i].trim());
                }
            });

            proc.on("close", () => {
                resolve();
            });
        });
    }

    static async upgrade(...components: string[]): Promise<void> {
        if (components.length === 0) return;

        const system = System.info();

        if (components.indexOf("hoobs-gui") >= 0) State.cache?.remove("system/gui");
        if (components.indexOf("hoobs-cli") >= 0) State.cache?.remove("system/cli");
        if (components.indexOf("hoobsd") >= 0) State.cache?.remove("system/hoobsd");
        if (components.indexOf("nodejs") >= 0) State.cache?.remove("system/node");

        switch (system.package_manager) {
            case "apt-get":
                if (State.mode === "production") {
                    await System.execute("apt-get update");
                    await System.execute(`apt-get install -y ${components.join(" ")}`);
                } else {
                    Console.debug("apt-get update");
                    Console.debug(`apt-get install -y ${components.join(" ")}`);
                }

                break;
        }

        State.cache?.remove("system/info");
    }

    static restart(): void {
        Console.warn("service restart command received");

        if (!State.container && State.mode === "production") {
            exec(`${Path.join(__dirname, "../../../bin/hoobsd")} service restart`);
        } else {
            Console.debug(`${Path.join(__dirname, "../../../bin/hoobsd")} service restart`);
        }
    }

    static reboot(): void {
        Console.warn("device reboot command received");

        if (!State.container && State.mode === "production") {
            exec("shutdown -r now");
        } else {
            Console.debug("shutdown -r now");
        }
    }

    static shutdown(): void {
        Console.warn("device shutdown command received");

        if (!State.container && State.mode === "production") {
            exec("shutdown -h now");
        } else {
            Console.debug("shutdown -h now");
        }
    }

    static switch(manager: string, level: string): void {
        switch (manager) {
            case "apt-get":
                if (State.mode === "production") {
                    execSync(`wget -qO- https://dl.hoobs.org/${level || "stable"} | bash -`, { stdio: "ignore" });
                } else {
                    Console.debug(`wget -qO- https://dl.hoobs.org/${level || "stable"} | bash -`);
                }

                break;
        }
    }

    static get gui(): { [key: string]: any } {
        const key = "system/gui";

        return {
            info: (): { [key: string]: any } => {
                const cached = State.cache?.get<{ [key: string]: any }>(key);

                if (cached) return cached;

                let path: string | undefined = "/usr/lib/hoobs";
                let installed: string | undefined = "";

                if (!existsSync(Path.join(path, "package.json"))) path = Path.join(__dirname, "../../../../gui");
                if (!existsSync(Path.join(path, "package.json"))) path = undefined;
                if (path) installed = (Paths.loadJson<{ [key: string]: any }>(Path.join(path, "package.json"), {})).version || "";
                if (!Semver.valid(installed)) installed = undefined;

                let current = System.gui.release() || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed || "", current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (path === "/usr/lib/hoobs") mode = "production";
                if (path === Path.join(__dirname, "../../../../gui")) mode = "development";

                return State.cache?.set(key, {
                    gui_prefix: "/usr/",
                    gui_version: installed,
                    gui_current: current,
                    gui_upgraded: !Semver.gt(current, installed || ""),
                    gui_mode: mode,
                }, 60);
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show hoobs-gui | grep Version");
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();

                    return data || "";
                }

                return "";
            },

            components: [
                "hoobs-gui",
            ],
        };
    }

    static get cli(): { [key: string]: any } {
        const key = "system/cli";

        return {
            info: (): { [key: string]: any } => {
                const cached = State.cache?.get<{ [key: string]: any }>(key);

                if (cached) return cached;

                let path = "/usr/bin/hbs";
                let prefix = "/usr/";

                if (State.mode === "development") {
                    path = Path.join(Path.resolve(Path.join(Paths.application, "../cli")), "debug");
                    prefix = Path.resolve(Path.join(Paths.application, "../cli"));
                } else {
                    const paths = (process.env.PATH || "").split(":");

                    for (let i = 0; i < paths.length; i += 1) {
                        if (paths[i].indexOf("/tmp/") === -1 && existsSync(Path.join(paths[i], "hbs"))) {
                            path = Path.join(paths[i], "hbs");

                            break;
                        }
                    }

                    if (!existsSync(path)) path = "";
                    if (path !== "") prefix = path.replace("bin/hbs", "");
                }

                let installed = "";

                if (path !== "") installed = System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                let current = System.cli.release() || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed, current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hbs/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return State.cache?.set(key, {
                    cli_prefix: prefix,
                    cli_version: installed,
                    cli_current: current,
                    cli_upgraded: !Semver.gt(current, installed),
                    cli_mode: mode,
                }, 4 * 60);
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show hoobs-cli | grep Version");
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();

                    return data || "";
                }

                return "";
            },

            components: [
                "hoobs-cli",
            ],
        };
    }

    static get hoobsd(): { [key: string]: any } {
        const key = "system/hoobsd";

        return {
            info: (): { [key: string]: any } => {
                const cached = State.cache?.get<{ [key: string]: any }>(key);

                if (cached) return cached;

                let path = "/usr/bin/hoobsd";
                let prefix = "/usr/";

                if (State.mode === "development") {
                    path = Path.join(Path.resolve(Paths.application), "debug");
                    prefix = Path.resolve(Paths.application);
                } else {
                    const paths = (process.env.PATH || "").split(":");

                    for (let i = 0; i < paths.length; i += 1) {
                        if (paths[i].indexOf("/tmp/") === -1 && existsSync(Path.join(paths[i], "hoobsd"))) {
                            path = Path.join(paths[i], "hoobsd");

                            break;
                        }
                    }

                    if (!existsSync(path)) path = "";
                    if (path !== "") prefix = path.replace("bin/hoobsd", "");
                }

                let installed = "";

                if (path !== "") installed = System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                let current = System.hoobsd.release() || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed, current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hoobsd/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return State.cache?.set(key, {
                    hoobsd_prefix: prefix,
                    hoobsd_version: installed,
                    hoobsd_current: current,
                    hoobsd_upgraded: !Semver.gt(current, installed),
                    hoobsd_mode: mode,
                    hoobsd_running: (System.shell("command -v pidof") !== "" && System.shell("pidof hoobsd")) !== "",
                }, 4 * 60);
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show hoobsd | grep Version");
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();

                    return data || "";
                }

                return "";
            },

            components: [
                "hoobsd",
            ],
        };
    }

    static get runtime(): { [key: string]: any } {
        const key = "system/node";

        return {
            info: (): { [key: string]: any } => {
                const cached = State.cache?.get<{ [key: string]: any }>(key);

                if (cached) return cached;

                let path = "/usr/bin/node";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(Path.join(paths[i], "node"))) {
                        path = Path.join(paths[i], "node");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";

                let current = System.runtime.release();

                if ((Semver.valid(current) && Semver.gt(process.version.replace("v", ""), current)) || !Semver.valid(current)) {
                    current = process.version.replace("v", "");
                }

                return State.cache?.set(key, {
                    node_prefix: path !== "" ? path.replace("bin/node", "") : "",
                    node_current: current,
                    node_upgraded: !Semver.gt(current, process.version.replace("v", "")),
                }, 12 * 60);
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show nodejs | grep Version | grep nodesource");
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();
                    data = (data.split(/[-~]+/)[0] || "").trim();

                    return data || "";
                }

                return "";
            },

            components: [
                "curl",
                "tar",
                "git",
                "python3",
                "make",
                "gcc",
                "g++",
                "nodejs",
            ],
        };
    }
}
