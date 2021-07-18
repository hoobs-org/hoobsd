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

import { join } from "path";

import {
    exec,
    spawn,
    execSync,
    SpawnOptionsWithoutStdio,
} from "child_process";

import { existsSync, readFileSync, writeFileSync } from "fs-extra";
import Semver from "semver";
import State from "../state";
import Paths from "./paths";
import Releases from "./releases";
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
    static preload(): void {
        System.info();

        System.cli.info(true);
        System.cli.info(false);

        System.gui.info(true);
        System.gui.info(false);

        System.hoobsd.info(true);
        System.hoobsd.info(false);

        System.runtime.info(true);
        System.runtime.info(false);
    }

    static led(status: LedStatus) {
        if (existsSync("/sys/class/leds/led0/brightness") && existsSync("/sys/class/leds/led1/brightness")) {
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

    static info(): { [key: string]: any } {
        const key = "system/info";
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        const results: { [key: string]: any } = {};
        const release = (System.shell("uname")).toLowerCase();

        switch (release) {
            case "darwin":
                results.distribution = (((System.shell("sw_vers", true)).split("\n").find((item) => item.startsWith("ProductName:")) || "").split(":")[1] || "").trim();
                results.version = (((System.shell("sw_vers", true)).split("\n").find((item) => item.startsWith("ProductVersion:")) || "").split(":")[1] || "").trim();
                break;

            case "linux":
                results.distribution = (((System.shell("cat /etc/*-release", true)).split("\n").find((item) => item.startsWith("ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                results.version = (((System.shell("cat /etc/*-release", true)).split("\n").find((item) => item.startsWith("VERSION_ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                break;
        }

        results.arch = System.shell("uname -m");
        results.init_system = "";
        results.repo = "stable";

        if (existsSync("/etc/systemd/system")) results.init_system = "systemd";
        if (existsSync("/Library/LaunchDaemons/")) results.init_system = "launchd";
        if (!existsSync("/proc/version") || (existsSync("/proc/version") && System.shell("cat /proc/version | grep microsoft") !== "")) results.init_system = "";

        switch (results.distribution) {
            case "alpine":
                results.package_manager = (System.shell("command -v apk")) !== "" ? "apk" : "";
                break;

            case "ubuntu":
            case "debian":
            case "raspbian":
                results.package_manager = (System.shell("command -v apt-get")) !== "" ? "apt-get" : "";

                if (existsSync("/etc/apt/sources.list.d/hoobs.list")) {
                    if (System.shell("cat /etc/apt/sources.list.d/hoobs.list | grep bleeding") !== "") results.repo = "bleeding";
                    if (System.shell("cat /etc/apt/sources.list.d/hoobs.list | grep edge") !== "") results.repo = "edge";
                }

                break;

            case "fedora":
            case "rhel":
            case "centos":
                if ((System.shell("command -v dnf")) !== "") {
                    results.package_manager = "dnf";
                } else if ((System.shell("command -v yum")) !== "") {
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
            const data = readFileSync("/etc/hoobs").toString().split("\n");

            for (let i = 0; i < data.length; i += 1) {
                const field = data[i].split("=");

                if (field[0] === "ID") results.product = field[1];
                if (field[0] === "MODEL") results.model = field[1];
                if (field[0] === "SKU") results.sku = field[1];
            }
        }

        if ((results.product === "box" || results.product === "card") && results.init_system === "systemd" && existsSync("/etc/avahi/avahi-daemon.conf")) {
            let broadcast = System.shell("cat /etc/avahi/avahi-daemon.conf | grep host-name=");

            if (broadcast.indexOf("#") >= 0) {
                broadcast = ((System.shell("hostname")).split(".")[0] || "").toLowerCase();
            } else {
                broadcast = (broadcast.split("=")[1] || "").toLowerCase();
            }

            results.mdns = true;
            results.mdns_broadcast = broadcast;
        }

        return State.cache?.set(key, results, 60);
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
                const broadcast = System.shell("cat /etc/avahi/avahi-daemon.conf | grep host-name=");
                const content = readFileSync("/etc/avahi/avahi-daemon.conf").toString();

                writeFileSync("/etc/avahi/avahi-daemon.conf", content.replace(broadcast, `host-name=${formatted}`));
                execSync("systemctl restart avahi-daemon");
                State.cache?.remove("system/info");
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
            const results = execSync(command).toString().trim();

            if (!multiline) return results.replace(/\n/g, "");

            return results;
        } catch (error) {
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

    static restart(): void {
        Console.warn("service restart command received");

        if (!State.container && State.mode === "production") {
            exec(`${join(__dirname, "../../../bin/hoobsd")} service restart`);
        } else {
            exec(`touch ${join(__dirname, "../../../src/main.ts")}`);
        }
    }

    static reboot(): void {
        Console.warn("device reboot command received");

        if (!State.container && State.mode === "production") {
            exec("shutdown -r now");
        } else {
            exec(`touch ${join(__dirname, "../../../src/main.ts")}`);
        }
    }

    static shutdown(): void {
        Console.warn("device shutdown command received");

        if (!State.container && State.mode === "production") {
            exec("shutdown -h now");
        }
    }

    static switch(level: string): void {
        switch (level) {
            case "bleeding":
                execSync("wget -qO- https://dl.hoobs.org/bleeding | bash -", { stdio: "ignore" });
                break;

            case "edge":
                execSync("wget -qO- https://dl.hoobs.org/edge | bash -", { stdio: "ignore" });
                break;

            default:
                execSync(" wget -qO- https://dl.hoobs.org/stable | bash -", { stdio: "ignore" });
                break;
        }
    }

    static get gui(): { [key: string]: any } {
        const key = "system/gui";

        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                const cached = State.cache?.get<{ [key: string]: any }>(`${key}/${beta ? "beta" : "stable"}`);

                if (cached) return cached;

                let path: string | undefined = "/usr/lib/hoobs";
                let installed: string | undefined = "";

                if (!existsSync(join(path, "package.json"))) path = join(__dirname, "../../../../gui");
                if (!existsSync(join(path, "package.json"))) path = undefined;
                if (path) installed = (Paths.loadJson<{ [key: string]: any }>(join(path, "package.json"), {})).version || "";
                if (!Semver.valid(installed)) installed = undefined;

                const release = await System.gui.release(beta);
                const download = release.download || "";

                let current = release.version || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed || "", current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (path === "/usr/lib/hoobs") mode = "production";
                if (path === join(__dirname, "../../../../gui")) mode = "development";

                return State.cache?.set(`${key}/${beta ? "beta" : "stable"}`, {
                    gui_prefix: "/usr/",
                    gui_version: installed,
                    gui_current: current,
                    gui_upgraded: (installed || current) === current ? true : !Semver.gt(current, installed || ""),
                    gui_download: download,
                    gui_mode: mode,
                }, 60);
            },

            release: async (beta: boolean): Promise<{ [key: string]: string }> => {
                const release = await Releases.fetch("gui", beta) || {};

                return {
                    version: release.version || "",
                    download: release.download || "",
                };
            },

            upgrade: async (): Promise<void> => {
                const system = System.info();

                State.cache?.remove(`${key}/stable`);
                State.cache?.remove(`${key}/beta`);

                if (system.package_manager === "apt-get") {
                    await System.execute("apt-get update");
                    await System.execute("apt-get install -y hoobs-gui");
                }
            },
        };
    }

    static get cli(): { [key: string]: any } {
        const key = "system/cli";

        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                const cached = State.cache?.get<{ [key: string]: any }>(`${key}/${beta ? "beta" : "stable"}`);

                if (cached) return cached;

                let path = "/usr/bin/hbs";
                let prefix = "/usr/";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "hbs"))) {
                        path = join(paths[i], "hbs");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";
                if (path !== "") prefix = path.replace("bin/hbs", "");

                let installed = "";

                if (path !== "") installed = System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                const release = await System.cli.release(beta);
                const download = release.download || "";

                let current = release.version || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed, current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hbs/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return State.cache?.set(`${key}/${beta ? "beta" : "stable"}`, {
                    cli_prefix: prefix,
                    cli_version: installed,
                    cli_current: current,
                    cli_upgraded: installed === current || mode === "development" ? true : !Semver.gt(current, installed),
                    cli_download: download,
                    cli_mode: mode,
                }, 4 * 60);
            },

            release: async (beta: boolean): Promise<{ [key: string]: string }> => {
                const release = await Releases.fetch("hbs", beta) || {};

                return {
                    version: release.version || "",
                    download: release.download || "",
                };
            },

            upgrade: async (): Promise<void> => {
                const system = System.info();

                State.cache?.remove(`${key}/stable`);
                State.cache?.remove(`${key}/beta`);

                if (system.package_manager === "apt-get") {
                    await System.execute("apt-get update");
                    await System.execute("apt-get install -y hoobs-cli");
                }
            },
        };
    }

    static get hoobsd(): { [key: string]: any } {
        const key = "system/hoobsd";

        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                const cached = State.cache?.get<{ [key: string]: any }>(`${key}/${beta ? "beta" : "stable"}`);

                if (cached) return cached;

                let path = "/usr/bin/hoobsd";
                let prefix = "/usr/";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "hoobsd"))) {
                        path = join(paths[i], "hoobsd");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";
                if (path !== "") prefix = path.replace("bin/hoobsd", "");

                let installed = "";

                if (path !== "") installed = System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                const release = await System.hoobsd.release(beta);
                const download = release.download || "";

                let current = release.version || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed, current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hoobsd/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return State.cache?.set(`${key}/${beta ? "beta" : "stable"}`, {
                    hoobsd_prefix: prefix,
                    hoobsd_version: installed,
                    hoobsd_current: current,
                    hoobsd_upgraded: installed === current || mode === "development" ? true : !Semver.gt(current, installed),
                    hoobsd_download: download,
                    hoobsd_mode: mode,
                    hoobsd_running: (System.shell("command -v pidof") !== "" && System.shell("pidof hoobsd")) !== "",
                }, 4 * 60);
            },

            release: async (beta: boolean): Promise<{ [key: string]: string }> => {
                const release = await Releases.fetch("hoobsd", beta) || {};

                return {
                    version: release.version || "",
                    download: release.download || "",
                };
            },

            upgrade: async (): Promise<void> => {
                const system = System.info();

                State.cache?.remove(`${key}/stable`);
                State.cache?.remove(`${key}/beta`);

                if (system.package_manager === "apt-get") {
                    await System.execute("apt-get update");
                    await System.execute("apt-get install -y hoobsd");
                }
            },
        };
    }

    static get runtime(): { [key: string]: any } {
        const key = "system/node";

        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                const cached = State.cache?.get<{ [key: string]: any }>(`${key}/${beta ? "beta" : "stable"}`);

                if (cached) return cached;

                let path = "/usr/bin/node";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "node"))) {
                        path = join(paths[i], "node");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";

                let current = await System.runtime.release(beta);

                if ((Semver.valid(current) && Semver.gt(process.version.replace("v", ""), current)) || !Semver.valid(current)) {
                    current = process.version.replace("v", "");
                }

                return State.cache?.set(`${key}/${beta ? "beta" : "stable"}`, {
                    node_prefix: path !== "" ? path.replace("bin/node", "") : "",
                    node_current: current,
                    node_upgraded: process.version.replace("v", "") === current || current === "" || process.version.replace("v", "") === "" ? true : !Semver.gt(current, process.version.replace("v", "")),
                }, 12 * 60);
            },

            release: async (beta: boolean): Promise<string> => {
                const system = System.info();
                const release = await Releases.fetch("node", beta) || {};

                if ((system.product === "box" || system.product === "card" || system.product === "headless") && system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show nodejs | grep Version");
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();
                    data = (data.split(/[-~]+/)[0] || "").trim();

                    if (Semver.valid(release.version) && Semver.valid(data) && Semver.gt(release.version, data)) {
                        return release.version || "";
                    }

                    return data || "";
                }

                return release.version || "";
            },

            upgrade: async (): Promise<void> => {
                const system = System.info();

                State.cache?.remove(`${key}/stable`);
                State.cache?.remove(`${key}/beta`);

                if ((system.product === "box" || system.product === "card" || system.product === "headless") && system.package_manager === "apt-get") {
                    System.switch(system.repo);

                    await System.execute("apt-get update");
                    await System.execute("apt-get install -y curl tar git python3 make gcc g++ nodejs");
                }
            },
        };
    }
}
