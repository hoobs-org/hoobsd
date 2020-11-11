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

import Os from "os";
import Unzip from "unzipper";
import Archiver from "archiver";

import {
    existsSync,
    writeFileSync,
    unlinkSync,
    ensureDirSync,
    removeSync,
    readdirSync,
    lstatSync,
    createReadStream,
    createWriteStream,
    renameSync,
    copySync,
} from "fs-extra";

import { execSync } from "child_process";
import { join, basename } from "path";
import Instance from "./instance";
import Paths from "./paths";
import Config from "./config";
import { Console, NotificationType } from "./logger";

import {
    loadJson,
    formatJson,
    sanitize,
} from "./formatters";

export interface InstanceRecord {
    id: string;
    type: string;
    display: string;
    port: number;
    pin?: string;
    username?: string;
    ports?: { [key: string]: number};
    autostart?: number;
    host?: string;
    plugins?: string;
    service?: string;
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
        if (Instance.mode === "production") {
            if (existsSync("/etc/systemd/system")) return "systemd";
            if (existsSync("/Library/LaunchDaemons/")) return "launchd";
        }

        return null;
    }

    static extentions(): { [key: string]: string | boolean }[] {
        return [{
            feature: "ffmpeg",
            description: "enables ffmpeg camera support",
            enabled: Paths.tryCommand("ffmpeg"),
        }];
    }

    static list(): InstanceRecord[] {
        const type = Instances.initSystem();
        const host = Instances.network()[0];

        let instances: InstanceRecord[] = [];

        if (existsSync(Paths.instancesPath())) instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

        for (let i = 0; i < instances.length; i += 1) {
            instances[i].host = host;
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

    static updateInstance(name: string, display: string, pin?: string, username?: string, autostart?: number) {
        return new Promise((resolve) => {
            if (!name) return resolve(false);

            const id = sanitize(name);
            const index = Instance.instances.findIndex((n) => n.id === id);

            if (index >= 0) {
                Instance.instances[index].display = display;
                Instance.instances[index].pin = pin || Instance.instances[index].pin || "031-45-154";
                Instance.instances[index].username = username || Instance.instances[index].username || Config.generateUsername();
                Instance.instances[index].autostart = autostart || Instance.instances[index].autostart || 0;

                writeFileSync(Paths.instancesPath(), formatJson(Instance.instances));

                return resolve(true);
            }

            return resolve(false);
        });
    }

    static updatePorts(name: string, start: number, end: number) {
        return new Promise((resolve) => {
            if (!name) return resolve(false);

            const id = sanitize(name);
            const index = Instance.instances.findIndex((n) => n.id === id);

            if (index >= 0) {
                Instance.instances[index].ports = {
                    start,
                    end,
                };

                writeFileSync(Paths.instancesPath(), formatJson(Instance.instances));

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

            if (!name) return resolve(false);

            const id = sanitize(name);
            const index = Instance.instances.findIndex((n: InstanceRecord) => n.id === id);

            if (index >= 0) {
                switch (type) {
                    case "systemd":
                        Instances.removeSystemd(id).then((success) => {
                            if (success) {
                                Instance.instances.splice(index, 1);

                                writeFileSync(Paths.instancesPath(), formatJson(Instance.instances));

                                removeSync(join(Paths.storagePath(), id));
                                removeSync(join(Paths.storagePath(), `${id}.accessories`));
                                removeSync(join(Paths.storagePath(), `${id}.persist`));
                                removeSync(join(Paths.storagePath(), `${id}.conf`));

                                Console.notify(
                                    "api",
                                    "Instance Removed",
                                    `Instance "${name} removed.`,
                                    NotificationType.WARN,
                                    "layers",
                                );
                            } else {
                                Console.notify(
                                    "api",
                                    "Instance Not Removed",
                                    `Unable to remove instance "${name}.`,
                                    NotificationType.ERROR,
                                );
                            }

                            return resolve(success);
                        });

                        break;

                    case "launchd":
                        Instances.removeLaunchd(id).then((success) => {
                            if (success) {
                                Instance.instances.splice(index, 1);

                                writeFileSync(Paths.instancesPath(), formatJson(Instance.instances));

                                removeSync(join(Paths.storagePath(), id));
                                removeSync(join(Paths.storagePath(), `${id}.accessories`));
                                removeSync(join(Paths.storagePath(), `${id}.persist`));
                                removeSync(join(Paths.storagePath(), `${id}.conf`));

                                Console.notify(
                                    "api",
                                    "Instance Removed",
                                    `Instance "${name} removed.`,
                                    NotificationType.WARN,
                                    "layers",
                                );
                            } else {
                                Console.notify(
                                    "api",
                                    "Instance Not Removed",
                                    `Unable to remove instance "${name}.`,
                                    NotificationType.ERROR,
                                );
                            }

                            return resolve(success);
                        });

                        break;
                    default:
                        Instance.instances.splice(index, 1);

                        writeFileSync(Paths.instancesPath(), formatJson(Instance.instances));

                        removeSync(join(Paths.storagePath(), id));
                        removeSync(join(Paths.storagePath(), `${id}.accessories`));
                        removeSync(join(Paths.storagePath(), `${id}.persist`));
                        removeSync(join(Paths.storagePath(), `${id}.conf`));

                        Console.notify(
                            "api",
                            "Instance Removed",
                            `Instance "${name} removed.`,
                            NotificationType.WARN,
                            "layers",
                        );

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

    static appendInstance(id: string, display: string, type: string, port: number, pin: string, username: string, autostart: number) {
        const instances: InstanceRecord[] = [];

        for (let i = 0; i < Instance.instances.length; i += 1) {
            const { ...instance } = Instance.instances[i];

            if (instance.id === "api") {
                instances.unshift({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                    pin: instance.pin,
                    username: instance.username,
                    autostart: 0,
                });
            } else {
                instances.push({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                    pin: instance.pin,
                    username: instance.username,
                    ports: instance.ports,
                    autostart: instance.autostart,
                });
            }
        }

        if (id === "api") {
            instances.unshift({
                id,
                type,
                display,
                port,
                pin,
                username,
                autostart: 0,
            });
        } else {
            instances.push({
                id,
                type,
                display,
                port,
                pin,
                username,
                autostart: autostart || 0,
            });
        }

        writeFileSync(Paths.instancesPath(), formatJson(instances));
    }

    static createService(name: string, port: number, pin: string, username: string) {
        return new Promise((resolve) => {
            const type = Instances.initSystem() || "";

            if (!existsSync(Paths.instancesPath())) {
                writeFileSync(Paths.instancesPath(), "[]");
            }

            switch (type) {
                case "systemd":
                    Instances.createSystemd(name, port).then((success) => {
                        if (success) {
                            Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port, pin, username, 0);

                            Console.notify(
                                "api",
                                "Instance Added",
                                `Instance "${name} added.`,
                                NotificationType.SUCCESS,
                                "layers",
                            );
                        } else {
                            Console.notify(
                                "api",
                                "Instance Not Added",
                                `Unable to create instance "${name}.`,
                                NotificationType.ERROR,
                            );
                        }

                        resolve(success);
                    });

                    break;

                case "launchd":
                    Instances.createLaunchd(name, port).then((success) => {
                        if (success) {
                            Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port, pin, username, 0);

                            Console.notify(
                                "api",
                                "Instance Added",
                                `Instance "${name} added.`,
                                NotificationType.SUCCESS,
                                "layers",
                            );
                        } else {
                            Console.notify(
                                "api",
                                "Instance Not Added",
                                `Unable to create instance "${name}.`,
                                NotificationType.ERROR,
                            );
                        }

                        resolve(success);
                    });

                    break;

                default:
                    Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port, pin, username, 0);

                    Console.notify(
                        "api",
                        "Instance Added",
                        `Instance "${name} added.`,
                        NotificationType.SUCCESS,
                        "layers",
                    );

                    resolve(true);
                    break;
            }
        });
    }

    static purge(): void {
        if (existsSync(join(Paths.storagePath(), `${Instance.id}.persist`))) removeSync(join(Paths.storagePath(), `${Instance.id}.persist`));

        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.persist`));

        if (existsSync(join(Paths.storagePath(), `${Instance.id}.accessories`))) removeSync(join(Paths.storagePath(), `${Instance.id}.accessories`));

        ensureDirSync(join(Paths.storagePath(), `${Instance.id}.accessories`));

        Console.notify(
            Instance.id,
            "Caches Purged",
            "Accessory and connection cache purged.",
            NotificationType.SUCCESS,
            "memory",
        );
    }

    static async reset(): Promise<void> {
        await Instance.api?.stop();
        await Instances.backup();

        const bridges = Instances.list().filter((item) => item.type === "bridge");

        for (let i = 0; i < bridges.length; i += 1) {
            await Instances.removeService(bridges[i].id);
        }

        removeSync(join(Paths.storagePath(), "api"));
        removeSync(join(Paths.storagePath(), "api.accessories"));
        removeSync(join(Paths.storagePath(), "api.persist"));
        removeSync(join(Paths.storagePath(), "api.conf"));
        removeSync(join(Paths.storagePath(), "hoobs.log"));
        removeSync(join(Paths.storagePath(), "access"));

        Instance.users = [];
    }

    static export(id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            id = sanitize(id);

            const instance = Instance.instances.find((item) => item.id === id);

            writeFileSync(join(Paths.storagePath(), "meta"), formatJson({
                date: (new Date()).getTime(),
                type: "instance",
                data: {
                    name: instance?.id,
                    type: instance?.type,
                    ports: instance?.ports,
                    autostart: instance?.autostart,
                },
                product: "hoobs",
                generator: "hoobsd",
                version: Instance.version,
            }));

            if (!instance) reject(new Error("instance does not exist"));

            const filename = `${id}_${new Date().getTime()}`;
            const output = createWriteStream(join(Paths.backupPath(), `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backupPath(), `${filename}.zip`), join(Paths.backupPath(), `${filename}.instance`));
                unlinkSync(join(Paths.storagePath(), "meta"));

                resolve(`${filename}.instance`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            archive.file(join(Paths.storagePath(), "meta"), { name: "meta" });
            archive.file(join(Paths.storagePath(), `${instance?.id}.conf`), { name: `${instance?.id}.conf` });

            Instances.dig(archive, join(Paths.storagePath(), `${instance?.id}`));

            archive.finalize();
        });
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            writeFileSync(join(Paths.storagePath(), "meta"), formatJson({
                date: (new Date()).getTime(),
                type: "full",
                product: "hoobs",
                generator: "hoobsd",
                version: Instance.version,
            }));

            const filename = `${new Date().getTime()}`;
            const entries = readdirSync(Paths.storagePath());
            const output = createWriteStream(join(Paths.backupPath(), `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backupPath(), `${filename}.zip`), join(Paths.backupPath(), `${filename}.backup`));
                unlinkSync(join(Paths.storagePath(), "meta"));

                resolve(`${filename}.backup`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.storagePath(), entries[i]);

                if (path !== Paths.backupPath()) {
                    if (lstatSync(path).isDirectory()) {
                        Instances.dig(archive, path);
                    } else {
                        archive.file(path, { name: entries[i] });
                    }
                }
            }

            archive.finalize();
        });
    }

    static dig(archive: Archiver.Archiver, directory: string): void {
        const entries = readdirSync(directory);

        for (let i = 0; i < entries.length; i += 1) {
            const path = join(directory, entries[i]);

            if (basename(path) !== "node_modules" && basename(path) !== "cache") {
                if (lstatSync(path).isDirectory()) {
                    archive.directory(path, join(basename(directory), entries[i]));
                } else {
                    archive.file(path, { name: join(basename(directory), entries[i]) });
                }
            }
        }
    }

    static metadata(file: string): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            let results: { [key: string]: any } = {};

            createReadStream(file).pipe(Unzip.Parse()).on("entry", (entry) => {
                const filename = entry.path;

                if (filename === "meta") {
                    entry.buffer().then((content: any) => {
                        try {
                            results = JSON.parse(content);
                        } catch (_error) {
                            results = {};
                        }

                        return resolve(results);
                    });
                }
            }).on("finish", () => resolve(results));
        });
    }

    static import(name: string, port: number, pin: string, username: string, file: string, remove?: boolean): Promise<void> {
        return new Promise((resolve) => {
            Instances.metadata(file).then((metadata) => {
                if (metadata.type === "instance") {
                    const id = sanitize(name);
                    const filename = join(Paths.storagePath(), `import-${new Date().getTime()}.zip`);

                    if (remove) {
                        renameSync(file, filename);
                    } else {
                        copySync(file, filename);
                    }

                    ensureDirSync(join(Paths.backupPath(), "stage"));

                    createReadStream(filename).pipe(Unzip.Extract({
                        path: join(Paths.backupPath(), "stage"),
                    })).on("finish", () => {
                        unlinkSync(filename);

                        setTimeout(async () => {
                            copySync(join(Paths.backupPath(), "stage", `${metadata.data.name}.conf`), join(Paths.storagePath(), `${id}.conf`));
                            copySync(join(Paths.backupPath(), "stage", metadata.data.name), join(Paths.storagePath(), id));

                            await Instances.createService(name, port, pin, username);

                            const index = Instance.instances.findIndex((n) => n.id === id);

                            if (index >= 0) {
                                if (metadata.data.autostart !== undefined) Instance.instances[index].autostart = metadata.data.autostart;
                                if (metadata.data.ports !== undefined) Instance.instances[index].ports = metadata.data.ports;

                                writeFileSync(Paths.instancesPath(), formatJson(Instance.instances));

                                if (Instance.manager === "yarn") {
                                    execSync("yarn install --unsafe-perm --ignore-engines", {
                                        cwd: Paths.storagePath(id),
                                        stdio: "inherit",
                                    });
                                } else {
                                    execSync("npm install --unsafe-perm", {
                                        cwd: Paths.storagePath(id),
                                        stdio: "inherit",
                                    });
                                }
                            }

                            removeSync(join(Paths.backupPath(), "stage"));
                            resolve();
                        }, 1000);
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    static restore(file: string, remove?: boolean): Promise<void> {
        return new Promise((resolve) => {
            Instances.metadata(file).then((metadata) => {
                if (metadata.type === "full") {
                    const type = Instances.initSystem() || "";
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
                        copySync(file, filename);
                    }

                    createReadStream(filename).pipe(Unzip.Extract({
                        path: Paths.storagePath(),
                    })).on("finish", () => {
                        unlinkSync(filename);

                        setTimeout(() => {
                            const instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

                            for (let i = 0; i < instances.length; i += 1) {
                                if (Instance.manager === "yarn") {
                                    execSync("yarn install --unsafe-perm --ignore-engines", {
                                        cwd: Paths.storagePath(instances[i].id),
                                        stdio: "inherit",
                                    });
                                } else {
                                    execSync("npm install --unsafe-perm", {
                                        cwd: Paths.storagePath(instances[i].id),
                                        stdio: "inherit",
                                    });
                                }
                            }

                            const bridges = instances.filter((item) => item.type === "bridge");

                            for (let i = 0; i < bridges.length; i += 1) {
                                switch (type) {
                                    case "systemd":
                                        Instances.createSystemd(bridges[i].display, bridges[i].port);
                                        break;

                                    case "launchd":
                                        Instances.createLaunchd(bridges[i].display, bridges[i].port);
                                        break;
                                }
                            }

                            const api = instances.find((item) => item.type === "api");

                            if (api) {
                                switch (type) {
                                    case "systemd":
                                        if (existsSync("/etc/systemd/system/api.hoobsd.service")) {
                                            execSync("systemctl stop api.hoobsd.service");
                                            execSync("systemctl start api.hoobsd.service");
                                        } else {
                                            Instances.createSystemd(api.display, api.port);
                                        }

                                        break;

                                    case "launchd":
                                        if (existsSync("/Library/LaunchDaemons/org.hoobsd.api.plist")) {
                                            execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.api.plist");
                                            execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.api.plist");
                                        } else {
                                            Instances.createLaunchd(api.display, api.port);
                                        }

                                        break;
                                }
                            }

                            resolve();
                        }, 1000);
                    });
                } else {
                    resolve();
                }
            });
        });
    }
}
