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

const BRIDGE_TEARDOWN_DELAY = 1000;

export interface BridgeRecord {
    id: string;
    type: string;
    display: string;
    port: number;
    pin?: string;
    username?: string;
    ports?: { [key: string]: number };
    autostart?: number;
    host?: string;
    plugins?: string;
}

export default class Bridges {
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

    static list(): BridgeRecord[] {
        const host = Bridges.network()[0];

        let bridges: BridgeRecord[] = [];

        if (existsSync(Paths.bridges)) bridges = loadJson<BridgeRecord[]>(Paths.bridges, []);

        for (let i = 0; i < bridges.length; i += 1) {
            bridges[i].host = host;

            if (existsSync(join(Paths.data(bridges[i].id), "package.json"))) bridges[i].plugins = join(Paths.data(bridges[i].id), "node_modules");
        }

        return bridges;
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
                const index = State.bridges.findIndex((n) => n.id === id);

                if (index >= 0) {
                    State.bridges[index].display = display;
                    State.bridges[index].pin = pin || State.bridges[index].pin || "031-45-154";
                    State.bridges[index].username = username || State.bridges[index].username || Config.generateUsername();
                    State.bridges[index].autostart = autostart || 0;

                    writeFileSync(Paths.bridges, formatJson(State.bridges));

                    return resolve(true);
                }

                return resolve(false);
            }),

            ports: (start: number, end: number): Promise<boolean> => new Promise((resolve) => {
                if (!name) return resolve(false);

                const id = sanitize(name);
                const index = State.bridges.findIndex((n) => n.id === id);

                if (index >= 0) {
                    State.bridges[index].ports = {
                        start,
                        end,
                    };

                    writeFileSync(Paths.bridges, formatJson(State.bridges));

                    return resolve(true);
                }

                return resolve(false);
            }),
        };
    }

    static uninstall(name: string): boolean {
        if (!name) return false;

        const id = sanitize(name);
        const index = State.bridges.findIndex((n: BridgeRecord) => n.id === id);

        if (index >= 0) {
            State.bridges.splice(index, 1);

            writeFileSync(Paths.bridges, formatJson(State.bridges));

            removeSync(join(Paths.data(), id));
            removeSync(join(Paths.data(), `${id}.accessories`));
            removeSync(join(Paths.data(), `${id}.persist`));
            removeSync(join(Paths.data(), `${id}.conf`));

            Console.notify(
                "hub",
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
                    execSync(`echo "ExecStart=${join(Bridges.locate(), "hoobsd")} hub" >> /etc/systemd/system/hoobsd.service`);
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
                    execSync("echo \"        <string>org.hoobsd.hub</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>EnvironmentVariables</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <key>PATH</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <key>HOME</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <string>/var/root</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        </dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>Program</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync(`echo "        <string>${join(Bridges.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                    execSync("echo \"        <key>ProgramArguments</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <array>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync(`echo "            <string>${join(Bridges.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                    execSync("echo \"            <string>hub</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
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
        const bridges: BridgeRecord[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            const { ...bridge } = State.bridges[i];

            if (bridge.id === "hub") {
                bridges.unshift({
                    id: bridge.id,
                    type: bridge.type,
                    display: bridge.display,
                    port: bridge.port,
                    pin: bridge.pin,
                    username: bridge.username,
                    autostart: 0,
                });
            } else {
                bridges.push({
                    id: bridge.id,
                    type: bridge.type,
                    display: bridge.display,
                    port: bridge.port,
                    pin: bridge.pin,
                    username: bridge.username,
                    ports: bridge.ports,
                    autostart: bridge.autostart,
                });
            }
        }

        if (id === "hub") {
            bridges.unshift({
                id,
                type,
                display,
                port,
                pin,
                username,
                autostart: 0,
            });
        } else {
            bridges.push({
                id,
                type,
                display,
                port,
                pin,
                username,
                autostart: autostart || 0,
            });
        }

        writeFileSync(Paths.bridges, formatJson(bridges));
    }

    static create(name: string, port: number, pin: string, username: string): void {
        if (sanitize(name) === "hub") Bridges.install();
        if (!existsSync(Paths.bridges)) writeFileSync(Paths.bridges, "[]");

        Bridges.append(sanitize(name), name, sanitize(name) === "hub" ? "hub" : "bridge", port, pin, username, 0);

        Console.notify(
            "hub",
            "Bridge Added",
            `Bridge "${name}" added.`,
            NotificationType.SUCCESS,
            "layers",
        );
    }

    static purge(uuid?: string): void {
        if (uuid) {
            const cache = loadJson<{ [key: string]: any }>(join(Paths.accessories, "cachedAccessories"), {});

            cache.accessories = cache.accessories || [];

            const index = cache.accessories.findINdex((item: { [key: string]: any }) => item.UUID === uuid);

            if (index >= 0) cache.accessories.splice(index, 1);

            writeFileSync(join(Paths.accessories, "cachedAccessories"), formatJson(State.bridges));
        } else {
            if (existsSync(join(Paths.data(), `${State.id}.persist`))) removeSync(join(Paths.data(), `${State.id}.persist`));

            ensureDirSync(join(Paths.data(), `${State.id}.persist`));

            if (existsSync(join(Paths.accessories, "cachedAccessories"))) removeSync(join(Paths.accessories, "cachedAccessories"));

            ensureDirSync(join(Paths.accessories, "cachedAccessories"));

            Console.notify(
                State.id,
                "Caches Purged",
                "Accessory and connection cache purged.",
                NotificationType.SUCCESS,
                "memory",
            );
        }
    }

    static async reset(): Promise<void> {
        await State.hub?.stop();
        await Bridges.backup();

        const bridges = Bridges.list().filter((item) => item.type === "bridge");

        for (let i = 0; i < bridges.length; i += 1) Bridges.uninstall(bridges[i].id);

        removeSync(join(Paths.data(), "hub"));
        removeSync(join(Paths.data(), "hub.accessories"));
        removeSync(join(Paths.data(), "hub.persist"));
        removeSync(join(Paths.data(), "hub.conf"));
        removeSync(join(Paths.data(), "hoobs.log"));
        removeSync(join(Paths.data(), "access"));

        State.users = [];
    }

    static export(id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            id = sanitize(id);

            const bridge = State.bridges.find((item) => item.id === id);

            writeFileSync(join(Paths.data(), "meta"), formatJson({
                date: (new Date()).getTime(),
                type: "bridge",
                data: {
                    name: bridge?.id,
                    type: bridge?.type,
                    ports: bridge?.ports,
                    autostart: bridge?.autostart,
                },
                product: "hoobs",
                generator: "hoobsd",
                version: State.version,
            }));

            if (!bridge) reject(new Error("bridge does not exist"));

            const filename = `${id}_${new Date().getTime()}`;
            const output = createWriteStream(join(Paths.backups, `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backups, `${filename}.zip`), join(Paths.backups, `${filename}.bridge`));
                unlinkSync(join(Paths.data(), "meta"));

                resolve(`${filename}.bridge`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            archive.file(join(Paths.data(), "meta"), { name: "meta" });
            archive.file(join(Paths.data(), `${bridge?.id}.conf`), { name: `${bridge?.id}.conf` });

            Bridges.dig(archive, join(Paths.data(), `${bridge?.id}`));

            archive.finalize();
        });
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            writeFileSync(join(Paths.data(), "meta"), formatJson({
                date: (new Date()).getTime(),
                type: "full",
                product: "hoobs",
                generator: "hoobsd",
                version: State.version,
            }));

            const filename = `${new Date().getTime()}`;
            const entries = readdirSync(Paths.data());
            const output = createWriteStream(join(Paths.backups, `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backups, `${filename}.zip`), join(Paths.backups, `${filename}.backup`));
                unlinkSync(join(Paths.data(), "meta"));

                resolve(`${filename}.backup`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.data(), entries[i]);

                if (path !== Paths.backups) {
                    if (lstatSync(path).isDirectory()) {
                        Bridges.dig(archive, path);
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
            Bridges.metadata(file).then((metadata) => {
                if (metadata.type === "bridge") {
                    const id = sanitize(name);
                    const filename = join(Paths.data(), `import-${new Date().getTime()}.zip`);

                    if (remove) {
                        renameSync(file, filename);
                    } else {
                        copySync(file, filename);
                    }

                    ensureDirSync(join(Paths.backups, "stage"));

                    createReadStream(filename).pipe(Unzip.Extract({
                        path: join(Paths.backups, "stage"),
                    })).on("finish", () => {
                        unlinkSync(filename);

                        setTimeout(async () => {
                            copySync(join(Paths.backups, "stage", `${metadata.data.name}.conf`), join(Paths.data(), `${id}.conf`));
                            copySync(join(Paths.backups, "stage", metadata.data.name), join(Paths.data(), id));

                            Bridges.create(name, port, pin, username);

                            const bridges = Bridges.list();
                            const index = bridges.findIndex((n) => n.id === id);

                            if (index >= 0) {
                                if (metadata.data.autostart !== undefined) bridges[index].autostart = metadata.data.autostart;
                                if (metadata.data.ports !== undefined) bridges[index].ports = metadata.data.ports;
                                if (metadata.data.autostart !== undefined || metadata.data.ports !== undefined) writeFileSync(Paths.bridges, formatJson(bridges));

                                execSync(`${Paths.yarn} install --unsafe-perm --ignore-engines`, {
                                    cwd: Paths.data(id),
                                    stdio: "inherit",
                                });
                            }

                            removeSync(join(Paths.backups, "stage"));
                            resolve();
                        }, BRIDGE_TEARDOWN_DELAY);
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    static restore(file: string, remove?: boolean): Promise<void> {
        return new Promise((resolve) => {
            Bridges.metadata(file).then((metadata) => {
                if (metadata.type === "full") {
                    const filename = join(Paths.data(), `restore-${new Date().getTime()}.zip`);
                    const entries = readdirSync(Paths.data());

                    for (let i = 0; i < entries.length; i += 1) {
                        const path = join(Paths.data(), entries[i]);

                        if (path !== Paths.backups) {
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
                        path: Paths.data(),
                    })).on("finish", () => {
                        unlinkSync(filename);

                        setTimeout(() => {
                            const bridges = loadJson<BridgeRecord[]>(Paths.bridges, []);

                            for (let i = 0; i < bridges.length; i += 1) {
                                execSync(`${Paths.yarn} install --unsafe-perm --ignore-engines`, {
                                    cwd: Paths.data(bridges[i].id),
                                    stdio: "inherit",
                                });
                            }

                            if (bridges.find((item) => item.type === "hub")) Bridges.install();

                            resolve();
                        }, BRIDGE_TEARDOWN_DELAY);
                    });
                } else {
                    resolve();
                }
            });
        });
    }
}
