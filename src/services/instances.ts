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

/* eslint-disable no-param-reassign */

import Os from "os";
import Unzip from "unzipper";
import Archiver from "archiver";
import Prompt from "prompts";

import {
    existsSync,
    appendFileSync,
    unlinkSync,
    ensureDirSync,
    removeSync,
    readdirSync,
    lstatSync,
    createReadStream,
    createWriteStream,
    renameSync,
    copyFileSync,
} from "fs-extra";

import { execSync } from "child_process";
import { join } from "path";
import Instance from "./instance";
import Paths from "./paths";

import {
    loadJson,
    formatJson,
    sanitize,
} from "./formatters";

export interface InstanceRecord {
    id: string,
    type: string,
    display: string,
    port: number,
    host?: string,
    ssl?: boolean,
    plugins?: string,
    service?: string,
}

export default class Instances {
    static locate() {
        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (existsSync(join(paths[i], "hoobsd"))) return paths[i];
        }

        return "";
    }

    static network(): string[] {
        const ifaces: NodeJS.Dict<Os.NetworkInterfaceInfo[]> = Os.networkInterfaces();
        const results: string[] = [];

        Object.keys(ifaces).forEach((ifname: string) => {
            ifaces[ifname]!.forEach((iface: Os.NetworkInterfaceInfo) => {
                if (iface.family !== "IPv4" || iface.internal !== false) return;
                if (results.indexOf(iface.address) === -1) results.push(`${iface.address}`);
            });
        });

        return results;
    }

    static initSystem() {
        if (existsSync("/etc/systemd/system")) return "systemd";
        if (existsSync("/Library/LaunchDaemons/")) return "launchd";

        return null;
    }

    static list(): InstanceRecord[] {
        const type = Instances.initSystem();
        const host = Instances.network()[0];

        let instances: InstanceRecord[] = [];

        if (existsSync(Paths.instancesPath())) instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

        for (let i = 0; i < instances.length; i += 1) {
            instances[i].host = host;
            instances[i].ssl = false;
            instances[i].service = undefined;

            if (existsSync(join(Paths.storagePath(instances[i].id), "package.json"))) instances[i].plugins = join(Paths.storagePath(instances[i].id), "node_modules");

            switch (type) {
                case "systemd":
                    if (existsSync(`/etc/systemd/system/${instances[i].id}.hoobsd.service`)) instances[i].service = `${instances[i].id}.hoobsd.service`;

                    break;

                case "launchd":
                    if (existsSync(`/Library/LaunchDaemons/org.hoobsd.${instances[i].id}.plist`)) instances[i].service = `org.hoobsd.${instances[i].id}.plist`;

                    break;

                default:
                    break;
            }
        }

        return instances;
    }

    static controlInstance(action: string, name: string) {
        return new Promise((resolve) => {
            const type = Instances.initSystem();

            if (!name || !type) return resolve(false);

            const id = sanitize(name);

            switch (type) {
                case "systemd":
                    if (existsSync(`/etc/systemd/system/${id}.hoobsd.service`)) {
                        switch (action) {
                            case "start":
                                try {
                                    execSync(`systemctl start ${id}.hoobsd.service`);

                                    return resolve(true);
                                } catch (_error) {
                                    return resolve(false);
                                }

                            case "stop":
                                try {
                                    execSync(`systemctl stop ${id}.hoobsd.service`);

                                    return resolve(true);
                                } catch (_error) {
                                    return resolve(false);
                                }

                            case "restart":
                                try {
                                    execSync(`systemctl stop ${id}.hoobsd.service`);
                                    execSync(`systemctl start ${id}.hoobsd.service`);

                                    return resolve(true);
                                } catch (_error) {
                                    return resolve(false);
                                }

                            default:
                                break;
                        }
                    }

                    break;

                case "launchd":
                    if (existsSync(`/Library/LaunchDaemons/org.hoobsd.${id}.plist`)) {
                        switch (action) {
                            case "start":
                                try {
                                    execSync(`launchctl load -w /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                                    return resolve(true);
                                } catch (_error) {
                                    return resolve(false);
                                }

                            case "stop":
                                try {
                                    execSync(`launchctl unload /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                                    return resolve(true);
                                } catch (_error) {
                                    return resolve(false);
                                }

                            case "restart":
                                try {
                                    execSync(`launchctl unload /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                                    execSync(`launchctl load -w /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                                    return resolve(true);
                                } catch (_error) {
                                    return resolve(false);
                                }

                            default:
                                break;
                        }
                    }

                    break;

                default:
                    break;
            }

            return resolve(false);
        });
    }

    static renameInstance(name: string, display: string) {
        return new Promise((resolve) => {
            if (!name) return resolve(false);

            const id = sanitize(name);
            const index = Instance.instances.findIndex((n) => n.id === id);

            if (index >= 0) {
                Instance.instances[index].display = display;

                if (existsSync(Paths.instancesPath())) {
                    unlinkSync(Paths.instancesPath());
                }

                appendFileSync(Paths.instancesPath(), formatJson(Instance.instances));

                return resolve(true);
            }

            return resolve(false);
        });
    }

    static removeSystemd(id: string) {
        return new Promise((resolve) => {
            if (existsSync(`/etc/systemd/system/${id}.hoobsd.service`)) {
                try {
                    execSync(`systemctl stop ${id}.hoobsd.service`);
                    execSync(`systemctl disable ${id}.hoobsd.service`);

                    execSync(`rm -f /etc/systemd/system/${id}.hoobsd.service`);

                    return resolve(true);
                } catch (_error) {
                    return resolve(false);
                }
            }

            return resolve(false);
        });
    }

    static removeLaunchd(id: string) {
        return new Promise((resolve) => {
            if (existsSync(`/Library/LaunchDaemons/org.hoobsd.${id}.plist`)) {
                try {
                    execSync(`launchctl unload /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                    execSync(`rm -f /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                    return resolve(true);
                } catch (_error) {
                    return resolve(false);
                }
            }

            return resolve(false);
        });
    }

    static removeService(name: string) {
        return new Promise((resolve) => {
            const type = Instances.initSystem();

            if (!name || !type) return resolve(false);

            const id = sanitize(name);
            const index = Instance.instances.findIndex((n: InstanceRecord) => n.id === id);

            if (index >= 0) {
                switch (type) {
                    case "systemd":
                        Instances.removeSystemd(id).then((success) => {
                            if (success) {
                                Instance.instances.splice(index, 1);

                                if (existsSync(Paths.instancesPath())) unlinkSync(Paths.instancesPath());

                                appendFileSync(Paths.instancesPath(), formatJson(Instance.instances));
                            }

                            return resolve(success);
                        });

                        break;

                    case "launchd":
                        Instances.removeLaunchd(id).then((success) => {
                            if (success) {
                                Instance.instances.splice(index, 1);

                                if (existsSync(Paths.instancesPath())) unlinkSync(Paths.instancesPath());

                                appendFileSync(Paths.instancesPath(), formatJson(Instance.instances));
                            }

                            return resolve(success);
                        });

                        break;
                    default:
                        Instance.instances.splice(index, 1);

                        if (existsSync(Paths.instancesPath())) unlinkSync(Paths.instancesPath());

                        appendFileSync(Paths.instancesPath(), formatJson(Instance.instances));

                        return resolve(true);
                }
            }

            return resolve(false);
        });
    }

    static createSystemd(name: string, port: number) {
        return new Promise((resolve) => {
            const id = sanitize(name);
            const display = name;

            if (
                !Number.isNaN(port)
                && id !== "static"
                && id !== "backups"
                && id !== "interface"
                && Instance.instances.findIndex((n) => n.id === id) === -1
                && Instance.instances.findIndex((n) => n.port === port) === -1
            ) {
                try {
                    if (id === "api") {
                        execSync("touch /etc/systemd/system/api.hoobsd.service");
                        execSync("truncate -s 0 /etc/systemd/system/api.hoobsd.service");

                        execSync("echo \"[Unit]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"Description=HOOBS API\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"After=network-online.target\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"[Service]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"Type=simple\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"User=root\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} api" >> /etc/systemd/system/api.hoobsd.service`);
                        execSync("echo \"Restart=on-failure\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"RestartSec=3\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"KillMode=process\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"[Install]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"WantedBy=multi-user.target\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/api.hoobsd.service");

                        execSync("systemctl daemon-reload");
                        execSync("systemctl enable api.hoobsd.service");
                        execSync("systemctl start api.hoobsd.service");
                    } else {
                        execSync(`touch /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`truncate -s 0 /etc/systemd/system/${id}.hoobsd.service`);

                        execSync(`echo "[Unit]" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "Description=HOOBS ${display}" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "After=network-online.target" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "[Service]" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "Type=simple" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "User=root" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} start --instance '${id}'" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "Restart=on-failure" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "RestartSec=3" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "KillMode=process" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "[Install]" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "WantedBy=multi-user.target" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "" >> /etc/systemd/system/${id}.hoobsd.service`);

                        execSync("systemctl daemon-reload");
                        execSync(`systemctl enable ${id}.hoobsd.service`);
                        execSync(`systemctl start ${id}.hoobsd.service`);
                    }

                    resolve(true);
                } catch (_error) {
                    resolve(false);
                }
            } else if (id === "default") {
                console.log(`${display} instance is already created`);

                resolve(false);
            } else {
                console.log("Instance must have a unique name, server port and bridge port");

                resolve(false);
            }
        });
    }

    static createLaunchd(name: string, port: number) {
        return new Promise((resolve) => {
            const id = sanitize(name);
            const display = name;

            if (
                !Number.isNaN(port)
                && Instance.instances.findIndex((n) => n.id === id) === -1
                && Instance.instances.findIndex((n) => n.port === port) === -1
            ) {
                try {
                    if (id === "api") {
                        execSync("touch /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("truncate -s 0 /Library/LaunchDaemons/org.hoobsd.api.plist");

                        execSync("echo \"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"<plist version=\"1.0\">\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"    <dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>Label</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <string>org.hoobsd.api</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>EnvironmentVariables</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <key>PATH</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <key>HOME</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <string>/var/root</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        </dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>Program</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync(`echo "        <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.api.plist`);
                        execSync("echo \"        <key>ProgramArguments</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <array>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync(`echo "            <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.api.plist`);
                        execSync("echo \"            <string>api</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        </array>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>RunAtLoad</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>KeepAlive</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>SessionCreate</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"    </dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"</plist>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");

                        execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.api.plist");
                    } else {
                        execSync(`touch /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`truncate -s 0 /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                        execSync(`echo "<?xml version="1.0" encoding="UTF-8"?>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "<plist version="1.0">" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "    <dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>Label</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <string>org.hoobsd.${id}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>EnvironmentVariables</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <key>PATH</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <key>HOME</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>/var/root</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        </dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>Program</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>ProgramArguments</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <array>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>start</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>--instance</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>${id}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        </array>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>RunAtLoad</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <true/>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>KeepAlive</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <true/>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>SessionCreate</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <true/>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "    </dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "</plist>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                        execSync(`launchctl load -w /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                    }

                    resolve(true);
                } catch (_error) {
                    resolve(false);
                }
            } else if (id === "default") {
                console.log(`${display} instance is already created`);

                resolve(false);
            } else {
                console.log("Instance must have a unique name, server port and bridge port");

                resolve(false);
            }
        });
    }

    static appendInstance(id: string, display: string, type: string, port: number) {
        const instances: InstanceRecord[] = [];

        for (let i = 0; i < Instance.instances.length; i += 1) {
            const { ...instance } = Instance.instances[i];

            if (instance.id === "api") {
                instances.unshift({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                });
            } else {
                instances.push({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                });
            }
        }

        if (id === "api") {
            instances.unshift({
                id,
                type,
                display,
                port,
            });
        } else {
            instances.push({
                id,
                type,
                display,
                port,
            });
        }

        if (existsSync(Paths.instancesPath())) unlinkSync(Paths.instancesPath());

        appendFileSync(Paths.instancesPath(), formatJson(instances));
    }

    static createService(name: string, port: number, skip?: boolean) {
        return new Promise((resolve) => {
            let type = "";

            if (!skip) {
                type = Instances.initSystem() || "";
            }

            if (!existsSync(Paths.instancesPath())) {
                appendFileSync(Paths.instancesPath(), "[]");
            }

            if (name && port) {
                switch (type) {
                    case "systemd":
                        Instances.createSystemd(name, port).then((success) => {
                            if (success) Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port);

                            resolve(success);
                        });

                        break;

                    case "launchd":
                        Instances.createLaunchd(name, port).then((success) => {
                            if (success) Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port);

                            resolve(success);
                        });

                        break;

                    default:
                        Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port);
                        resolve(true);
                        break;
                }
            } else {
                port = port || 51826;

                while (Instance.instances.findIndex((n) => n.port === port) >= 0) port += 1000;

                const questions: Prompt.PromptObject<string>[] = [
                    {
                        type: "text",
                        name: "name",
                        message: "enter a name for this instance",
                        validate: (value: string | undefined) => {
                            if (!value || value === "") return "a name is required";
                            if (Instance.instances.findIndex((n) => n.id === sanitize(value)) >= 0) return "instance name must be uniqie";

                            return true;
                        },
                    },
                    {
                        type: "text",
                        name: "port",
                        initial: `${port}`,
                        message: "enter the port for the instance",
                        format: (value: string | undefined) => parseInt(value || "0", 10),
                        validate: (value: string | undefined) => {
                            const parsed: number = parseInt(`${value || port || "0"}`, 10);

                            if (Number.isNaN(parsed)) return "invalid port number";
                            if (parsed < 1 || parsed > 65535) return "select a port between 1 and 65535";
                            if (Instance.instances.findIndex((n) => n.port === parsed) >= 0) return "port is already in use";

                            return true;
                        },
                    },
                ];

                Prompt(questions).then((result) => {
                    if (result && result.name && result.port) {
                        const id = sanitize(result.name);

                        switch (type) {
                            case "systemd":
                                Instances.createSystemd(result.name, result.port).then((success) => {
                                    if (success) Instances.appendInstance(id, result.name, id === "api" ? "api" : "bridge", result.port);

                                    resolve(success);
                                });

                                break;

                            case "launchd":
                                Instances.createLaunchd(result.name, result.port).then((success) => {
                                    if (success) Instances.appendInstance(id, result.name, id === "api" ? "api" : "bridge", result.port);

                                    resolve(success);
                                });

                                break;

                            default:
                                Instances.appendInstance(id, result.name, id === "api" ? "api" : "bridge", result.port);
                                resolve(true);
                                break;
                        }
                    } else {
                        resolve(false);
                    }
                });
            }
        });
    }

    static clean(): void {
        if (existsSync(join(Paths.storagePath(), `${Instance.id}.persist`))) removeSync(join(Paths.storagePath(), `${Instance.id}.persist`));

        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.persist`));

        if (existsSync(join(Paths.storagePath(), `${Instance.id}.accessories`))) removeSync(join(Paths.storagePath(), `${Instance.id}.accessories`));

        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.accessories`));
    }

    static reset(): void {
        const entries = readdirSync(Paths.storagePath());

        for (let i = 0; i < entries.length; i += 1) {
            const path = join(Paths.storagePath(), entries[i]);

            if (path !== Paths.backupPath()) {
                if (lstatSync(path).isDirectory()) {
                    removeSync(path);
                } else {
                    unlinkSync(path);
                }
            }
        }
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            const filename = `backup-${new Date().getTime()}`;
            const entries = readdirSync(Paths.storagePath());
            const output = createWriteStream(join(Paths.backupPath(), `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backupPath(), `${filename}.zip`), join(Paths.backupPath(), `${filename}.hbf`));
                resolve(`${filename}.hbf`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.storagePath(), entries[i]);

                if (path !== Paths.backupPath()) {
                    if (lstatSync(path).isDirectory()) {
                        archive.directory(path, entries[i]);
                    } else {
                        archive.file(path, { name: entries[i] });
                    }
                }
            }

            archive.finalize();
        });
    }

    static restore(file: string, remove?: boolean): Promise<void> {
        return new Promise((resolve) => {
            const filename = join(Paths.storagePath(), `restore-${new Date().getTime()}.zip`);
            const entries = readdirSync(Paths.storagePath());

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.storagePath(), entries[i]);

                if (path !== Paths.backupPath()) {
                    if (lstatSync(path).isDirectory()) {
                        removeSync(path);
                    } else {
                        unlinkSync(path);
                    }
                }
            }

            if (remove) {
                renameSync(file, filename);
            } else {
                copyFileSync(file, filename);
            }

            createReadStream(filename).pipe(Unzip.Extract({
                path: Paths.storagePath(),
            })).on("finish", () => {
                unlinkSync(filename);
                resolve();
            });
        });
    }
}
