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
import State from "../state";
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

    static extentions(): { [key: string]: string | boolean }[] {
        return [{
            feature: "ffmpeg",
            description: "enables ffmpeg camera support",
            enabled: Paths.tryCommand("ffmpeg"),
        }];
    }

    static list(): InstanceRecord[] {
        const host = Instances.network()[0];

        let instances: InstanceRecord[] = [];

        if (existsSync(Paths.instancesPath())) instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

        for (let i = 0; i < instances.length; i += 1) {
            instances[i].host = host;

            if (existsSync(join(Paths.storagePath(instances[i].id), "package.json"))) instances[i].plugins = join(Paths.storagePath(instances[i].id), "node_modules");
        }

        return instances;
    }

    static manage(action: string) {
        return new Promise((resolve) => {
            if (existsSync("/etc/systemd/system/hoobsd.service")) {
                switch (action) {
                    case "start":
                        try {
                            execSync("systemctl start hoobsd.service");

                            return resolve(true);
                        } catch (_error) {
                            return resolve(false);
                        }

                    case "stop":
                        try {
                            execSync("systemctl stop hoobsd.service");

                            return resolve(true);
                        } catch (_error) {
                            return resolve(false);
                        }

                    case "restart":
                        try {
                            execSync("systemctl stop hoobsd.service");
                            execSync("systemctl start hoobsd.service");

                            return resolve(true);
                        } catch (_error) {
                            return resolve(false);
                        }

                    default:
                        break;
                }
            }

            if (existsSync("/Library/LaunchDaemons/org.hoobsd.plist")) {
                switch (action) {
                    case "start":
                        try {
                            execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.plist");

                            return resolve(true);
                        } catch (_error) {
                            return resolve(false);
                        }

                    case "stop":
                        try {
                            execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.plist");

                            return resolve(true);
                        } catch (_error) {
                            return resolve(false);
                        }

                    case "restart":
                        try {
                            execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.plist");
                            execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.plist");

                            return resolve(true);
                        } catch (_error) {
                            return resolve(false);
                        }

                    default:
                        break;
                }
            }

            return resolve(false);
        });
    }

    static update(name: string): { [key: string]: any } {
        return {
            info: (display: string, pin?: string, username?: string, autostart?: number): Promise<boolean> => new Promise((resolve) => {
                if (!name) return resolve(false);

                const id = sanitize(name);
                const index = State.instances.findIndex((n) => n.id === id);

                if (index >= 0) {
                    State.instances[index].display = display;
                    State.instances[index].pin = pin || State.instances[index].pin || "031-45-154";
                    State.instances[index].username = username || State.instances[index].username || Config.generateUsername();
                    State.instances[index].autostart = autostart || State.instances[index].autostart || 0;

                    writeFileSync(Paths.instancesPath(), formatJson(State.instances));

                    return resolve(true);
                }

                return resolve(false);
            }),

            ports: (start: number, end: number): Promise<boolean> => new Promise((resolve) => {
                if (!name) return resolve(false);

                const id = sanitize(name);
                const index = State.instances.findIndex((n) => n.id === id);

                if (index >= 0) {
                    State.instances[index].ports = {
                        start,
                        end,
                    };

                    writeFileSync(Paths.instancesPath(), formatJson(State.instances));

                    return resolve(true);
                }

                return resolve(false);
            }),
        };
    }

    static uninstall(name: string): boolean {
        if (!name) return false;

        const id = sanitize(name);
        const index = State.instances.findIndex((n: InstanceRecord) => n.id === id);

        if (index >= 0) {
            State.instances.splice(index, 1);

            writeFileSync(Paths.instancesPath(), formatJson(State.instances));

            removeSync(join(Paths.storagePath(), id));
            removeSync(join(Paths.storagePath(), `${id}.accessories`));
            removeSync(join(Paths.storagePath(), `${id}.persist`));
            removeSync(join(Paths.storagePath(), `${id}.conf`));

            Console.notify(
                "api",
                "Bridge Removed",
                `Bridge "${name}" removed.`,
                NotificationType.WARN,
                "layers",
            );

            return true;
        }

        return false;
    }

    static install(): boolean {
        if (existsSync("/etc/systemd/system")) {
            try {
                if (existsSync("/etc/systemd/system/hoobsd.service")) {
                    execSync("systemctl stop hoobsd.service");
                    execSync("systemctl start hoobsd.service");
                } else {
                    execSync("touch /etc/systemd/system/hoobsd.service");
                    execSync("truncate -s 0 /etc/systemd/system/hoobsd.service");

                    execSync("echo \"[Unit]\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"Description=HOOBS API\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"After=network-online.target\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"[Service]\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"Type=simple\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"User=root\" >> /etc/systemd/system/hoobsd.service");
                    execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} api" >> /etc/systemd/system/hoobsd.service`);
                    execSync("echo \"Restart=on-failure\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"RestartSec=3\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"KillMode=process\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"[Install]\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"WantedBy=multi-user.target\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");

                    execSync("systemctl daemon-reload");
                    execSync("systemctl enable hoobsd.service");
                    execSync("systemctl start hoobsd.service");
                }

                return true;
            } catch (_error) {
                return false;
            }
        }

        if (existsSync("/Library/LaunchDaemons")) {
            try {
                if (existsSync("/Library/LaunchDaemons/org.hoobsd.plist")) {
                    execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.plist");
                } else {
                    execSync("touch /Library/LaunchDaemons/org.hoobsd.plist");

                    execSync("echo \"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"<plist version=\"1.0\">\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"    <dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>Label</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <string>org.hoobsd.api</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>EnvironmentVariables</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <key>PATH</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <key>HOME</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <string>/var/root</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        </dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>Program</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync(`echo "        <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                    execSync("echo \"        <key>ProgramArguments</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <array>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync(`echo "            <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                    execSync("echo \"            <string>api</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        </array>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>RunAtLoad</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>KeepAlive</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>SessionCreate</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"    </dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"</plist>\" >> /Library/LaunchDaemons/org.hoobsd.plist");

                    execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.plist");
                }
            } catch (_error) {
                return false;
            }

            return true;
        }

        return true;
    }

    static append(id: string, display: string, type: string, port: number, pin: string, username: string, autostart: number) {
        const instances: InstanceRecord[] = [];

        for (let i = 0; i < State.instances.length; i += 1) {
            const { ...instance } = State.instances[i];

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

    static create(name: string, port: number, pin: string, username: string): void {
        if (sanitize(name) === "api") Instances.install();
        if (!existsSync(Paths.instancesPath())) writeFileSync(Paths.instancesPath(), "[]");

        Instances.append(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port, pin, username, 0);

        Console.notify(
            "api",
            "Bridge Added",
            `Bridge "${name}" added.`,
            NotificationType.SUCCESS,
            "layers",
        );
    }

    static purge(): void {
        if (existsSync(join(Paths.storagePath(), `${State.id}.persist`))) removeSync(join(Paths.storagePath(), `${State.id}.persist`));

        ensureDirSync(join(Paths.storagePath(), `${State.id}.persist`));

        if (existsSync(join(Paths.storagePath(), `${State.id}.accessories`))) removeSync(join(Paths.storagePath(), `${State.id}.accessories`));

        ensureDirSync(join(Paths.storagePath(), `${State.id}.accessories`));

        Console.notify(
            State.id,
            "Caches Purged",
            "Accessory and connection cache purged.",
            NotificationType.SUCCESS,
            "memory",
        );
    }

    static async reset(): Promise<void> {
        await State.api?.stop();
        await Instances.backup();

        const bridges = Instances.list().filter((item) => item.type === "bridge");

        for (let i = 0; i < bridges.length; i += 1) Instances.uninstall(bridges[i].id);

        removeSync(join(Paths.storagePath(), "api"));
        removeSync(join(Paths.storagePath(), "api.accessories"));
        removeSync(join(Paths.storagePath(), "api.persist"));
        removeSync(join(Paths.storagePath(), "api.conf"));
        removeSync(join(Paths.storagePath(), "hoobs.log"));
        removeSync(join(Paths.storagePath(), "access"));

        State.users = [];
    }

    static export(id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            id = sanitize(id);

            const instance = State.instances.find((item) => item.id === id);

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
                version: State.version,
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
                version: State.version,
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

                            Instances.create(name, port, pin, username);

                            const instances = Instances.list();
                            const index = instances.findIndex((n) => n.id === id);

                            if (index >= 0) {
                                if (metadata.data.autostart !== undefined) instances[index].autostart = metadata.data.autostart;
                                if (metadata.data.ports !== undefined) instances[index].ports = metadata.data.ports;
                                if (metadata.data.autostart !== undefined || metadata.data.ports !== undefined) writeFileSync(Paths.instancesPath(), formatJson(instances));

                                execSync(`${Paths.yarn()} install --unsafe-perm --ignore-engines`, {
                                    cwd: Paths.storagePath(id),
                                    stdio: "inherit",
                                });
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
                                execSync(`${Paths.yarn()} install --unsafe-perm --ignore-engines`, {
                                    cwd: Paths.storagePath(instances[i].id),
                                    stdio: "inherit",
                                });
                            }

                            if (instances.find((item) => item.type === "api")) Instances.install();

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
