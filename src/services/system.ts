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
import { execSync } from "child_process";
import { existsSync } from "fs-extra";
import Semver from "semver";
import State from "../state";
import Instances from "./instances";
import { parseJson } from "./formatters";

export default class System {
    static info(): { [key: string]: any } {
        const key = "system/info";
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        const results: { [key: string]: any } = {};
        const release = System.command("uname").toLowerCase();

        switch (release) {
            case "darwin":
                results.distribution = ((System.command("sw_vers", true).split("\n").find((item) => item.startsWith("ProductName:")) || "").split(":")[1] || "").trim();
                results.version = ((System.command("sw_vers", true).split("\n").find((item) => item.startsWith("ProductVersion:")) || "").split(":")[1] || "").trim();
                break;

            case "linux":
                results.distribution = ((System.command("cat /etc/*-release", true).split("\n").find((item) => item.startsWith("ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                results.version = ((System.command("cat /etc/*-release", true).split("\n").find((item) => item.startsWith("VERSION_ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                break;
        }

        results.arch = System.command("uname -m");
        results.init_system = Instances.initSystem() || "";

        switch (results.distribution) {
            case "alpine":
                results.package_manager = System.command("command -v apk") !== "" ? "apk" : "";
                break;

            case "ubuntu":
            case "debian":
            case "raspbian":
                results.package_manager = System.command("command -v apt-get") !== "" ? "apt-get" : "";
                break;

            case "fedora":
            case "rhel":
            case "centos":
                if (System.command("command -v dnf") !== "") {
                    results.package_manager = "dnf";
                } else if (System.command("command -v yum") !== "") {
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
            const data = System.command("cat /etc/hoobs", true).split("\n");

            for (let i = 0; i < data.length; i += 1) {
                const field = data[i].split("=");

                if (field[0] === "ID") results.product = field[1];
                if (field[0] === "MODEL") results.model = field[1];
                if (field[0] === "SKU") results.sku = field[1];
            }
        }

        if ((results.product === "box" || results.product === "card") && results.init_system === "systemd" && existsSync("/etc/avahi/avahi-daemon.conf")) {
            let broadcast = System.command("cat /etc/avahi/avahi-daemon.conf | grep host-name=");

            if (broadcast.indexOf("#") >= 0) {
                broadcast = (System.command("hostname").split(".")[0] || "").toLowerCase();
            } else {
                broadcast = (broadcast.split("=")[1] || "").toLowerCase();
            }

            results.mdns = true;
            results.mdns_broadcast = broadcast;
        }

        State.cache?.set(key, results, 60);

        return results;
    }

    static command(value: string, multiline?: boolean): string {
        let results = "";

        try {
            results = execSync(value).toString() || "";
        } catch (_error) {
            results = "";
        }

        if (!multiline) results = results.replace(/\n/g, "");

        return results;
    }

    static sync(): void {
        const system = System.info();

        if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get") execSync("curl -sL https://deb.nodesource.com/setup_lts.x | bash");
    }

    static get cli(): { [key: string]: any } {
        return {
            info: (): { [key: string]: any } => {
                const key = "system/hbs";
                const cached = State.cache?.get<{ [key: string]: any }>(key);

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
                let release = "";
                let download = "";

                if (path !== "") installed = System.command(`${path} -v`);
                if (!Semver.valid(installed)) installed = "";

                const data = System.cli.release();

                release = data.release || "";
                download = data.download || "";

                if ((Semver.valid(installed) && Semver.valid(release) && Semver.gt(installed, release)) || !Semver.valid(release)) {
                    release = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hbs/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                const results: { [key: string]: any } = {
                    cli_prefix: prefix,
                    cli_version: installed,
                    cli_release: release,
                    cli_upgraded: installed === release ? true : !Semver.gt(release, installed),
                    cli_download: download,
                    cli_mode: mode,
                };

                State.cache?.set(key, results, 60);

                return results;
            },

            release: (): { [key: string]: string } => {
                const data = parseJson<{ [key: string]: any }>(System.command("curl -sL https://support.hoobs.org/api/releases/hbs/latest", true), {});

                return {
                    release: (data.results || {}).version || "",
                    download: (data.results || {}).download || "",
                };
            },

            upgrade: (): void => {
                const data = System.cli.info();

                execSync(`curl -sL ${data.cli_download} --output ./hbs.tar.gz`);
                execSync(`tar -xzf ./hbs.tar.gz -C ${data.cli_prefix} --strip-components=1 --no-same-owner`);
                execSync("rm -f ./hbs.tar.gz");

                if (data.cli_mode === "production") {
                    execSync("yarn install --force --production", { cwd: join(data.cli_prefix, "lib/hbs") });
                }
            },
        };
    }

    static get hoobsd(): { [key: string]: any } {
        return {
            info: (): { [key: string]: any } => {
                const key = "system/hoobsd";
                const cached = State.cache?.get<{ [key: string]: any }>(key);

                if (cached && cached.hoobsd_version === State.version) return cached;

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
                let release = "";
                let download = "";

                if (path !== "") installed = System.command(`${path} -v`);
                if (!Semver.valid(installed)) installed = "";

                const data = System.hoobsd.release();

                release = data.release || "";
                download = data.download || "";

                if ((Semver.valid(installed) && Semver.valid(release) && Semver.gt(installed, release)) || !Semver.valid(release)) {
                    release = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hoobsd/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                const results: { [key: string]: any } = {
                    hoobsd_prefix: prefix,
                    hoobsd_version: installed,
                    hoobsd_release: release,
                    hoobsd_upgraded: installed === release ? true : !Semver.gt(release, installed),
                    hoobsd_download: download,
                    hoobsd_mode: mode,
                    hoobsd_running: System.hoobsd.running(),
                };

                State.cache?.set(key, results, 60);

                return results;
            },

            running: (): boolean => {
                if (System.command("pidof hoobsd") !== "") return true;

                return false;
            },

            release: (): { [key: string]: string } => {
                const data = parseJson<{ [key: string]: any }>(System.command("curl -sL https://support.hoobs.org/api/releases/hoobsd/latest", true), {});

                return {
                    release: (data.results || {}).version || "",
                    download: (data.results || {}).download || "",
                };
            },

            upgrade: (): void => {
                const data = System.hoobsd.info();

                execSync(`curl -sL ${data.hoobsd_download} --output ./hoobsd.tar.gz`);
                execSync(`tar -xzf ./hoobsd.tar.gz -C ${data.hoobsd_prefix} --strip-components=1 --no-same-owner`);
                execSync("rm -f ./hoobsd.tar.gz");

                if (data.hoobsd_mode === "production") {
                    execSync("yarn install --force --production", { cwd: join(data.hoobsd_prefix, "lib/hoobsd") });
                }
            },
        };
    }

    static get runtime(): { [key: string]: any } {
        return {
            info: (): { [key: string]: any } => {
                const key = "system/node";
                const cached = State.cache?.get<{ [key: string]: any }>(key);

                if (cached && cached.node_version === (process.version || "").replace(/v/gi, "")) return cached;

                let path = "/usr/bin/node";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "node"))) {
                        path = join(paths[i], "node");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";

                let installed = "";
                let release = "";

                if (path !== "") installed = System.command(`${path} -v`).replace("v", "");
                if (!Semver.valid(installed)) installed = "";

                release = System.runtime.release();

                if ((Semver.valid(installed) && Semver.valid(release) && Semver.gt(installed, release)) || !Semver.valid(release)) {
                    release = installed;
                }

                const results: { [key: string]: any } = {
                    node_prefix: path !== "" ? path.replace("bin/node", "") : "",
                    node_version: installed,
                    node_release: release,
                    node_upgraded: installed === release || release === "" || installed === "" ? true : !Semver.gt(release, installed),
                };

                State.cache?.set(key, results, 60);

                return results;
            },

            release: (): string => {
                const system = System.info();

                if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.command("apt-cache show nodejs | grep Version");
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();
                    data = (data.split(/[-~]+/)[0] || "").trim();

                    return data || "";
                }

                return (parseJson<{ [key: string]: any }>(System.command("curl -sL https://support.hoobs.org/api/releases/node/latest", true), {}).results || {}).version || "";
            },

            upgrade: (): void => {
                const system = System.info();

                if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get") {
                    execSync("apt-get update");
                    execSync("apt-get install -y curl tar git python3 make gcc g++ nodejs yarn");
                }
            },
        };
    }
}
