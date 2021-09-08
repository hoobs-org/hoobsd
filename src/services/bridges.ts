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

import { execSync, ChildProcess } from "child_process";
import Path from "path";
import Socket from "../hub/services/socket";
import State from "../state";
import Paths from "./paths";
import Config from "./config";
import System, { ProcessQuery } from "./system";
import { Console, NotificationType } from "./logger";
import { sanitize } from "./formatters";

const BRIDGE_TEARDOWN_DELAY = 2000;

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
    advertiser?: string;
    project?: string,
    debugging?: boolean,
}

export interface BridgeProcess {
    bridge: BridgeRecord;
    port: number;
    process: ChildProcess;
    socket: Socket;
}

export default class Bridges {
    static running(pid: number): boolean {
        try {
            return process.kill(pid, 0) || false;
        } catch (_error) {
            return false;
        }
    }

    static locate() {
        if (State.mode === "development") return Path.join(Path.resolve(Paths.application), "debug");

        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (existsSync(Path.join(paths[i], "hoobsd"))) return paths[i];
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

    static list(): BridgeRecord[] {
        const host = Bridges.network()[0];

        let bridges: BridgeRecord[] = [];

        if (existsSync(Paths.bridges)) bridges = Paths.loadJson<BridgeRecord[]>(Paths.bridges, []);

        for (let i = 0; i < bridges.length; i += 1) {
            bridges[i].host = host;

            if (existsSync(Path.join(Paths.data(bridges[i].id), "package.json"))) bridges[i].plugins = Path.join(Paths.data(bridges[i].id), "node_modules");
        }

        if (State.mode !== "development") return bridges.filter((item) => item.type !== "dev");

        return bridges;
    }

    static kill(bridge: BridgeRecord) {
        System.kill(ProcessQuery.PORT, bridge.port);

        if (bridge.ports?.start && bridge.ports?.end) {
            for (let i = bridge.ports.start; i <= bridge.ports.end; i += 1) {
                System.kill(ProcessQuery.PORT, bridge.port);
            }
        }
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
                            execSync("systemctl restart hoobsd.service");

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
                            execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.plist && launchctl load -w /Library/LaunchDaemons/org.hoobsd.plist");

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
            info: (display: string, pin?: string, username?: string, autostart?: number, advertiser?: string, debugging?: boolean): Promise<boolean> => new Promise((resolve) => {
                if (!name) return resolve(false);

                const id = sanitize(name);
                const index = State.bridges.findIndex((n) => n.id === id);

                if (index >= 0) {
                    State.bridges[index].display = display;
                    State.bridges[index].pin = pin || State.bridges[index].pin || "031-45-154";
                    State.bridges[index].username = username || State.bridges[index].username || Config.generateUsername();
                    State.bridges[index].autostart = autostart || 0;
                    State.bridges[index].advertiser = advertiser || State.bridges[index].advertiser || "bonjour";
                    State.bridges[index].debugging = debugging;

                    Paths.saveJson(Paths.bridges, State.bridges);

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

                    Paths.saveJson(Paths.bridges, State.bridges);

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
        const display = index >= 0 ? State.bridges[index].display : name;

        if (index >= 0) {
            State.bridges.splice(index, 1);
            Paths.saveJson(Paths.bridges, State.bridges);

            removeSync(Path.join(Paths.data(), id));
            removeSync(Path.join(Paths.data(), `${id}.accessories`));
            removeSync(Path.join(Paths.data(), `${id}.persist`));
            removeSync(Path.join(Paths.data(), `${id}.conf`));

            Console.notify(
                "hub",
                "Bridge Removed",
                `${display} removed.`,
                NotificationType.WARN,
                "layers",
            );

            return true;
        }

        return false;
    }

    static append(id: string, display: string, type: string, port: number, pin: string, username: string, autostart: number, advertiser: string) {
        const bridges: BridgeRecord[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].id === "hub") {
                bridges.unshift({
                    id: State.bridges[i].id,
                    type: State.bridges[i].type,
                    display: State.bridges[i].display,
                    port: State.bridges[i].port,
                    pin: State.bridges[i].pin,
                    username: State.bridges[i].username,
                    autostart: 0,
                    advertiser: undefined,
                });
            } else {
                bridges.push({
                    id: State.bridges[i].id,
                    type: State.bridges[i].type,
                    display: State.bridges[i].display,
                    port: State.bridges[i].port,
                    pin: State.bridges[i].pin,
                    username: State.bridges[i].username,
                    ports: State.bridges[i].ports,
                    autostart: State.bridges[i].autostart,
                    advertiser: State.bridges[i].advertiser,
                    project: State.bridges[i].project,
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
                advertiser: undefined,
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
                advertiser,
            });
        }

        Paths.saveJson(Paths.bridges, bridges);
    }

    static create(name: string, port: number, pin: string, username: string, advertiser: string): void {
        if (!existsSync(Paths.bridges)) writeFileSync(Paths.bridges, "[]");

        Bridges.append(sanitize(name), name, sanitize(name) === "hub" ? "hub" : "bridge", port, pin, username, 0, advertiser);

        Console.notify(
            "hub",
            "Bridge Added",
            `${name} added.`,
            NotificationType.SUCCESS,
            "layers",
        );
    }

    static accessories(bridge: string): { [key: string]: any }[] {
        ensureDirSync(Path.join(Paths.data(), `${bridge}.persist`));
        ensureDirSync(Path.join(Paths.data(), `${bridge}.accessories`));

        return Paths.loadJson<{ [key: string]: any }[]>(Path.join(Paths.data(), `${bridge}.accessories`, "cachedAccessories"), [], undefined, true);
    }

    static parings(bridge: string): { [key: string]: any }[] {
        ensureDirSync(Path.join(Paths.data(), `${bridge}.persist`));
        ensureDirSync(Path.join(Paths.data(), `${bridge}.accessories`));

        const pairings = readdirSync(Path.join(Paths.data(), `${bridge}.persist`)).filter((d) => d.match(/AccessoryInfo\.([A-F,a-f,0-9]+)\.json/));
        const results = [];

        for (let i = 0; i < pairings.length; i += 1) {
            const pairing = Paths.loadJson<{ [key: string]: any }>(Path.join(Paths.data(), `${bridge}.persist`, pairings[i]), {});
            const [, id] = pairings[i].split(".");

            results.push({
                id,
                version: pairing.configVersion,
                username: ((id || "").match(/.{1,2}/g) || []).join(":"),
                display: pairing.displayName,
                category: pairing.category,
                setup_pin: pairing.pincode,
                setup_id: pairing.setupID,
                clients: pairing.pairedClients,
                permissions: pairing.pairedClientsPermission,
            });
        }

        return results;
    }

    static purge(name: string, uuid?: string): void {
        const id = sanitize(name);
        const index = State.bridges.findIndex((n) => n.id === id);

        if (index >= 0 && uuid) {
            ensureDirSync(Path.join(Paths.data(), `${id}.persist`));
            ensureDirSync(Path.join(Paths.data(), `${id}.accessories`));

            const working = Paths.loadJson<{ [key: string]: any }[]>(Path.join(Paths.data(), `${id}.accessories`, "cachedAccessories"), [], undefined, true);

            let accessory = working.findIndex((item: { [key: string]: any }) => item.UUID === uuid);

            while (accessory >= 0) {
                working.splice(accessory, 1);
                accessory = working.findIndex((item: { [key: string]: any }) => item.UUID === uuid);
            }

            Paths.saveJson(Path.join(Paths.data(), `${id}.accessories`, "cachedAccessories"), working, false, undefined, true);
        } else if (index >= 0) {
            if (existsSync(Path.join(Paths.data(), `${id}.persist`))) removeSync(Path.join(Paths.data(), `${id}.persist`));
            if (existsSync(Path.join(Paths.data(), `${id}.accessories`))) removeSync(Path.join(Paths.data(), `${id}.accessories`));

            ensureDirSync(Path.join(Paths.data(), `${id}.persist`));
            ensureDirSync(Path.join(Paths.data(), `${id}.accessories`));

            State.bridges[index].username = Config.generateUsername();

            Paths.saveJson(Paths.bridges, State.bridges);

            Console.notify(
                id,
                "Caches Purged",
                "Accessory and connection cache purged.",
                NotificationType.SUCCESS,
                "memory",
            );
        }
    }

    static async reset(): Promise<void> {
        State.restoring = true;

        await State.hub?.stop();
        await Bridges.backup();

        const bridges = Bridges.list().filter((item) => item.type !== "hub");

        for (let i = 0; i < bridges.length; i += 1) Bridges.uninstall(bridges[i].id);

        removeSync(Path.join(Paths.data(), "hub"));
        removeSync(Path.join(Paths.data(), "hub.accessories"));
        removeSync(Path.join(Paths.data(), "hub.persist"));
        removeSync(Path.join(Paths.data(), "hub.conf"));
        removeSync(Path.join(Paths.data(), "hoobs.log"));
        removeSync(Path.join(Paths.data(), "layout.conf"));
        removeSync(Path.join(Paths.data(), "access"));

        State.users = [];
    }

    static export(id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            id = sanitize(id);

            const bridge = State.bridges.find((item) => item.id === id);

            Paths.saveJson(Path.join(Paths.data(), "meta"), {
                date: (new Date()).getTime(),
                type: "bridge",
                data: {
                    name: bridge?.id,
                    type: bridge?.type,
                    ports: bridge?.ports,
                    autostart: bridge?.autostart,
                    advertiser: bridge?.advertiser,
                },
                product: "hoobs",
                generator: "hoobsd",
                version: State.version,
            });

            if (!bridge) reject(new Error("bridge does not exist"));

            const filename = `${id}_${new Date().getTime()}`;
            const output = createWriteStream(Path.join(Paths.backups, `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(Path.join(Paths.backups, `${filename}.zip`), Path.join(Paths.backups, `${filename}.bridge`));
                unlinkSync(Path.join(Paths.data(), "meta"));

                resolve(`${filename}.bridge`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            archive.file(Path.join(Paths.data(), "meta"), { name: "meta" });
            archive.file(Path.join(Paths.data(), `${bridge?.id}.conf`), { name: `${bridge?.id}.conf` });

            Bridges.dig(archive, Path.join(Paths.data(), `${bridge?.id}`));

            archive.finalize();
        });
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            Paths.saveJson(Path.join(Paths.data(), "meta"), {
                date: (new Date()).getTime(),
                type: "full",
                product: "hoobs",
                generator: "hoobsd",
                version: State.version,
            });

            const filename = `${new Date().getTime()}`;
            const entries = readdirSync(Paths.data());
            const output = createWriteStream(Path.join(Paths.backups, `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(Path.join(Paths.backups, `${filename}.zip`), Path.join(Paths.backups, `${filename}.backup`));
                unlinkSync(Path.join(Paths.data(), "meta"));

                resolve(`${filename}.backup`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            for (let i = 0; i < entries.length; i += 1) {
                const path = Path.join(Paths.data(), entries[i]);

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
            const path = Path.join(directory, entries[i]);

            if (Path.basename(path) !== "node_modules" && Path.basename(path) !== "cache" && Path.basename(path) !== "config.json") {
                if (lstatSync(path).isDirectory()) {
                    archive.directory(path, Path.join(Path.basename(directory), entries[i]));
                } else {
                    archive.file(path, { name: Path.join(Path.basename(directory), entries[i]) });
                }
            }
        }
    }

    static metadata(file: string): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            let results: { [key: string]: any } = {};

            createReadStream(file).pipe(Unzip.Parse()).on("entry", (entry) => {
                const filename = entry.path;
                const { type } = entry;

                if (type === "File" && filename === "meta") {
                    entry.buffer().then((content: any) => {
                        try {
                            results = JSON.parse(content);
                        } catch (_error) {
                            results = {};
                        }
                    });
                } else {
                    entry.autodrain();
                }
            }).on("finish", () => {
                Console.info(`restore type "${results.type}"`);

                resolve(results);
            });
        });
    }

    static import(name: string, port: number, pin: string, username: string, advertiser: string, file: string, remove?: boolean): Promise<void> {
        return new Promise((resolve) => {
            Console.warn("performing bridge import");

            Bridges.metadata(file).then((metadata) => {
                if (metadata.type === "bridge") {
                    const id = sanitize(name);
                    const filename = Path.join(Paths.data(), `import-${new Date().getTime()}.zip`);

                    if (remove) {
                        renameSync(file, filename);
                    } else {
                        copySync(file, filename);
                    }

                    ensureDirSync(Path.join(Paths.backups, "stage"));

                    createReadStream(filename).pipe(Unzip.Extract({
                        path: Path.join(Paths.backups, "stage"),
                    })).on("finish", () => {
                        unlinkSync(filename);

                        setTimeout(async () => {
                            copySync(Path.join(Paths.backups, "stage", `${metadata.data.name}.conf`), Path.join(Paths.data(), `${id}.conf`));
                            copySync(Path.join(Paths.backups, "stage", metadata.data.name), Path.join(Paths.data(), id));

                            Bridges.create(name, port, pin, username, advertiser);

                            const bridges = Bridges.list();
                            const index = bridges.findIndex((n) => n.id === id);

                            if (index >= 0) {
                                if (metadata.data.autostart !== undefined) bridges[index].autostart = metadata.data.autostart;
                                if (metadata.data.ports !== undefined) bridges[index].ports = metadata.data.ports;
                                if (metadata.data.autostart !== undefined || metadata.data.ports !== undefined) Paths.saveJson(Paths.bridges, bridges);

                                await System.execute(`${Paths.yarn} install --unsafe-perm --ignore-engines --network-timeout 100000 --network-concurrency 1 --force`, { cwd: Paths.data(id) });
                            }

                            removeSync(Path.join(Paths.backups, "stage"));
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
            Console.warn("performing restore");

            Bridges.metadata(file).then((metadata) => {
                if (metadata.type === "full") {
                    State.restoring = true;

                    const filename = Path.join(Paths.data(), `restore-${new Date().getTime()}.zip`);
                    const entries = readdirSync(Paths.data());

                    for (let i = 0; i < entries.length; i += 1) {
                        const path = Path.join(Paths.data(), entries[i]);

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

                    createReadStream(filename).pipe(Unzip.Extract({ path: Paths.data() })).on("finish", () => {
                        if (existsSync(filename)) unlinkSync(filename);
                        if (existsSync(Path.join(Paths.data(), "meta"))) unlinkSync(Path.join(Paths.data(), "meta"));

                        setTimeout(async () => {
                            const bridges = Paths.loadJson<BridgeRecord[]>(Paths.bridges, []);

                            for (let i = 0; i < bridges.length; i += 1) {
                                await System.execute(`${Paths.yarn} install --unsafe-perm --ignore-engines --network-timeout 100000 --network-concurrency 1 --force`, { cwd: Paths.data(bridges[i].id), detached: true });
                            }

                            State.restoring = false;

                            Console.info("restore complete");

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
