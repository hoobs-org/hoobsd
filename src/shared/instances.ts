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

import Prompt from "prompts";

import {
    existsSync,
    readFileSync,
    appendFileSync,
    unlinkSync,
} from "fs-extra";

import { execSync } from "child_process";
import { join } from "path";
import Paths from "./paths";
import { network, parseJson, sanitize } from "./helpers";

export default class Instances {
    static locate() {
        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (existsSync(join(paths[i], "hoobsd"))) {
                return paths[i];
            }
        }

        return "";
    }

    static initSystem() {
        if (existsSync("/etc/systemd/system")) {
            return "systemd";
        } if (existsSync("/Library/LaunchDaemons/")) {
            return "launchd";
        }

        return null;
    }

    static list(): any[] {
        const type = Instances.initSystem();
        const host = network()[0];

        let instances: any[] = [];

        if (existsSync(Paths.instancesPath())) {
            instances = <any[]>parseJson(readFileSync(Paths.instancesPath()).toString(), []);
        }

        instances.unshift({
            id: "api",
            type: "api",
            display: "API",
            port: 80,
        });

        for (let i = 0; i < instances.length; i += 1) {
            instances[i].host = host;
            instances[i].ssl = false;
            instances[i].service = undefined;

            if (existsSync(join(Paths.storagePath(instances[i].id), "package.json"))) {
                instances[i].plugins = join(Paths.storagePath(instances[i].id), "node_modules");
            }

            switch (type) {
                case "systemd":
                    if (existsSync(`/etc/systemd/system/${instances[i].id}.hoobsd.service`)) {
                        instances[i].service = `${instances[i].id}.hoobsd.service`;
                    }

                    break;

                case "launchd":
                    if (existsSync(`/Library/LaunchDaemons/org.hoobsd.${instances[i].id}.plist`)) {
                        instances[i].service = `org.hoobsd.${instances[i].id}.plist`;
                    }

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

            if (!name || !type) {
                return resolve(false);
            }

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
            if (!name) {
                return resolve(false);
            }

            const id = sanitize(name);

            let instances: any[] = [];

            if (existsSync(Paths.instancesPath())) {
                instances = <any[]>parseJson(readFileSync(Paths.instancesPath()).toString(), []);
            }

            const index = instances.findIndex((n) => n.id === id);

            if (index >= 0) {
                instances[index].display = display;

                if (existsSync(Paths.instancesPath())) {
                    unlinkSync(Paths.instancesPath());
                }

                appendFileSync(Paths.instancesPath(), JSON.stringify(instances, null, 4));

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

            if (!name || !type) {
                return resolve(false);
            }

            const id = sanitize(name);

            let instances: any[] = [];

            if (existsSync(Paths.instancesPath())) {
                instances = <any[]>parseJson(readFileSync(Paths.instancesPath()).toString(), []);
            }

            const index = instances.findIndex((n) => n.id === id);

            if (index >= 0) {
                switch (type) {
                    case "systemd":
                        Instances.removeSystemd(id).then((success) => {
                            if (success) {
                                instances.splice(index, 1);

                                if (existsSync(Paths.instancesPath())) {
                                    unlinkSync(Paths.instancesPath());
                                }

                                appendFileSync(
                                    Paths.instancesPath(),
                                    JSON.stringify(instances, null, 4),
                                );
                            }

                            return resolve(success);
                        });

                        break;

                    case "launchd":
                        Instances.removeLaunchd(id).then((success) => {
                            if (success) {
                                instances.splice(index, 1);

                                if (existsSync(Paths.instancesPath())) {
                                    unlinkSync(Paths.instancesPath());
                                }

                                appendFileSync(
                                    Paths.instancesPath(),
                                    JSON.stringify(instances, null, 4),
                                );
                            }

                            return resolve(success);
                        });

                        break;
                    default:
                        instances.splice(index, 1);

                        if (existsSync(Paths.instancesPath())) {
                            unlinkSync(Paths.instancesPath());
                        }

                        appendFileSync(Paths.instancesPath(), JSON.stringify(instances, null, 4));

                        return resolve(true);
                }
            }

            return resolve(false);
        });
    }

    static createSystemd(name: string, port: number) {
        return new Promise((resolve) => {
            let instances: any[] = [];

            if (existsSync(Paths.instancesPath())) {
                instances = <any[]>parseJson(readFileSync(Paths.instancesPath()).toString(), []);
            }

            const id = sanitize(name);
            const display = name;

            if (
                !Number.isNaN(port)
                && id !== "static"
                && id !== "backups"
                && id !== "interface"
                && instances.findIndex((n) => n.id === id) === -1
                && instances.findIndex((n) => n.port === port) === -1
            ) {
                try {
                    if (!existsSync("/etc/systemd/system/api.hoobsd.service")) {
                        execSync("touch /etc/systemd/system/api.hoobsd.service");
                        execSync("truncate -s 0 /etc/systemd/system/api.hoobsd.service");

                        execSync("echo \"[Unit]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"Description=HOOBS API\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"After=network-online.target\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"[Service]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"Type=simple\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"User=root\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} api --port 80" >> /etc/systemd/system/api.hoobsd.service`);
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
                    }

                    execSync(`touch /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`truncate -s 0 /etc/systemd/system/${id}.hoobsd.service`);

                    execSync(`echo "[Unit]" >> /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`echo "Description=HOOBS ${display}" >> /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`echo "After=network-online.target" >> /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`echo "" >> /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`echo "[Service]" >> /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`echo "Type=simple" >> /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`echo "User=root" >> /etc/systemd/system/${id}.hoobsd.service`);
                    execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} start --instance '${id}' --port ${port}" >> /etc/systemd/system/${id}.hoobsd.service`);
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

                    instances.push({
                        id,
                        type: "bridge",
                        display,
                        port,
                    });

                    if (existsSync(Paths.instancesPath())) {
                        unlinkSync(Paths.instancesPath());
                    }

                    appendFileSync(Paths.instancesPath(), JSON.stringify(instances, null, 4));

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
            let instances: any[] = [];

            if (existsSync(Paths.instancesPath())) {
                instances = <any[]>parseJson(readFileSync(Paths.instancesPath()).toString(), []);
            }

            const id = sanitize(name);
            const display = name;

            if (
                !Number.isNaN(port)
                && instances.findIndex((n) => n.id === id) === -1
                && instances.findIndex((n) => n.port === port) === -1
            ) {
                try {
                    if (!existsSync("/Library/LaunchDaemons/org.hoobsd.api.plist")) {
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
                        execSync("echo \"            <string>--port</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <string>80</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
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
                    }

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
                    execSync(`echo "            <string>--port</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                    execSync(`echo "            <string>${port}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
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

                    instances.push({
                        id,
                        type: "bridge",
                        display,
                        port,
                    });

                    if (existsSync(Paths.instancesPath())) {
                        unlinkSync(Paths.instancesPath());
                    }

                    appendFileSync(Paths.instancesPath(), JSON.stringify(instances, null, 4));

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

    static createService(name: string, port: number) {
        return new Promise((resolve) => {
            const type = Instances.initSystem();

            if (!type) {
                resolve(false);
            } else {
                if (!existsSync(Paths.instancesPath())) {
                    appendFileSync(Paths.instancesPath(), JSON.stringify([]));
                }

                if (name && port) {
                    switch (type) {
                        case "systemd":
                            Instances.createSystemd(name, port).then((success) => {
                                resolve(success);
                            });

                            break;

                        case "launchd":
                            Instances.createLaunchd(name, port).then((success) => {
                                resolve(success);
                            });

                            break;

                        default:
                            resolve(false);
                            break;
                    }
                } else {
                    let instances: any[] = [];

                    if (existsSync(Paths.instancesPath())) {
                        instances = <any[]>parseJson(readFileSync(Paths.instancesPath()).toString(), []);
                    }

                    port = port || 51826;

                    while (instances.findIndex((n) => n.port === port) >= 0) {
                        port += 1000;
                    }

                    const questions: Prompt.PromptObject<string>[] = [
                        {
                            type: "text",
                            name: "name",
                            message: "enter a name for this instance",
                            validate: (value: string | undefined) => {
                                if (!value || value === "") {
                                    return "a name is required";
                                }

                                if (sanitize(value) === "api") {
                                    return "api is a reserved instance name";
                                }

                                if (instances.findIndex(
                                    (n) => n.id === sanitize(value),
                                ) >= 0) {
                                    return "instance name must be uniqie";
                                }

                                return true;
                            },
                        },
                        {
                            type: "text",
                            name: "bridge",
                            initial: `${port}`,
                            message: "enter the port for the bridge",
                            format: (value: string | undefined) => parseInt(value || "0", 10),
                            validate: (value: string | undefined) => {
                                const parsed: number = parseInt(`${value || port || "0"}`, 10);

                                if (Number.isNaN(parsed)) {
                                    return "invalid port number";
                                }

                                if (parsed < 1 || parsed > 65535) {
                                    return "select a port between 1 and 65535";
                                }

                                if (instances.findIndex(
                                    (n) => n.port === parsed,
                                ) >= 0) {
                                    return "port is already in use";
                                }

                                return true;
                            },
                        },
                    ];

                    Prompt(questions).then((result) => {
                        if (result && result.name && result.server && result.bridge) {
                            switch (type) {
                                case "systemd":
                                    Instances.createSystemd(result.name, result.port).then((success) => {
                                        resolve(success);
                                    });

                                    break;

                                case "launchd":
                                    Instances.createLaunchd(result.name, result.port).then((success) => {
                                        resolve(success);
                                    });

                                    break;

                                default:
                                    resolve(false);
                                    break;
                            }
                        } else {
                            resolve(false);
                        }
                    });
                }
            }
        });
    }
}
