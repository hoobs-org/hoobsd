/**************************************************************************************************
 * hoobsd                                                                                         *
 * Copyright (C) 2020 HOOBS                                                                       *
 * Copyright (C) 2020 Homebridge                                                                  *
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

import _ from "lodash";
import { join } from "path";
import { EventEmitter } from "events";
import { existsSync, copyFileSync, unlinkSync } from "fs-extra";
import Watcher from "chokidar";

import {
    Accessory,
    AccessoryEventTypes,
    AccessoryLoader,
    Bridge,
    Categories,
    Characteristic,
    CharacteristicEventTypes,
    once,
    PublishInfo,
    MacAddress,
    MDNSAdvertiser,
    Service,
    uuid,
} from "hap-nodejs";

import {
    AccessoryIdentifier,
    AccessoryName,
    AccessoryPlugin,
    AccessoryPluginConstructor,
    HomebridgeAPI,
    InternalAPIEvent,
    PlatformIdentifier,
    PlatformName,
    PlatformPlugin,
    PlatformPluginConstructor,
    StaticPlatformPlugin,
} from "homebridge/lib/api";

import { toShortForm } from "hap-nodejs/dist/lib/util/uuid";
import { HomebridgeConfig, BridgeConfiguration } from "homebridge/lib/bridgeService";
import { PlatformAccessory, SerializedPlatformAccessory } from "homebridge/lib/platformAccessory";
import { ExternalPortService } from "homebridge/lib/externalPortService";
import { Logger, Logging } from "homebridge/lib/logger";
import { User } from "homebridge/lib/user";
import * as mac from "homebridge/lib/util/mac";
import { PluginManager, PluginManagerOptions } from "homebridge/lib/pluginManager";
import { Plugin } from "homebridge/lib/plugin";
import { HOOBSService, DeviceID, PluginID } from "./services/extentions";
import Paths from "../services/paths";
import State from "../state";
import Plugins from "../services/plugins";
import Config from "../services/config";
import Accessories from "./services/accessories";
import { BridgeRecord } from "../services/bridges";
import { Console, Prefixed, Events } from "../services/logger";
import { Services, Characteristics } from "./services/types";
import { jsonEquals } from "../services/json";

const INSTANCE_KILL_DELAY = 2 * 1000;

// @ts-ignore
PluginManager.PLUGIN_IDENTIFIER_PATTERN = /^((@[\S]*)\/)?([\S-]*)$/;

export default class Server extends EventEmitter {
    public running: boolean;

    public readonly port: number;

    public readonly settings: BridgeConfiguration;

    public readonly instance: BridgeRecord | undefined;

    public readonly accessories: Accessories;

    private readonly api: HomebridgeAPI;

    private readonly pluginManager: PluginManager;

    private readonly bridge: Bridge;

    private readonly config: HomebridgeConfig;

    private readonly externalPorts: ExternalPortService;

    private hapAccessories: (PlatformAccessory | Accessory)[] = [];

    private platformAccessories: PlatformAccessory[] = [];

    private development = false;

    private watcher: Watcher.FSWatcher | undefined;

    private readonly unbridgedAccessories: Map<MacAddress, PlatformAccessory> = new Map();

    constructor(port?: number, development?: boolean) {
        super();

        User.setStoragePath(Paths.data(State.id));
        Logger.setTimestampEnabled(false);

        if (State.debug) Logger.setDebugEnabled(true);

        // @ts-ignore
        Logger.internal = Console;

        this.running = false;
        this.development = development || false;
        this.instance = State.bridges.find((n: any) => n.id === State.id);

        this.config = {
            bridge: {
                name: this.instance?.display || "HOOBS",
                pin: this.instance?.pin || "031-45-154",
                username: this.instance?.username || "",
                advertiser: this.getAdvertiser(this.instance?.advertiser),
            },
            accessories: [],
            platforms: [],
        };

        if (this.instance?.ports?.start && this.instance?.ports?.start) this.config.ports = { start: this.instance.ports.start, end: this.instance.ports.end };

        this.config = _.extend(this.config, Config.configuration());

        for (let i = 0; i < this.config.accessories.length; i += 1) {
            delete this.config.accessories[i].plugin_map;
        }

        for (let i = 0; i < this.config.platforms.length; i += 1) {
            delete this.config.platforms[i].plugin_map;
        }

        this.settings = this.config.bridge;
        this.port = port || 51826;
        this.externalPorts = new ExternalPortService(this.config.ports);
        this.api = new HomebridgeAPI();
        this.accessories = new Accessories();

        this.api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, (accessories) => this.handleRegisterPlatformAccessories(accessories));
        this.api.on(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, () => this.handleUpdatePlatformAccessories());
        this.api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, (accessories) => this.handleUnregisterPlatformAccessories(accessories));
        this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, (accessories) => this.handlePublishExternalAccessories(accessories));

        const pluginManagerOptions: PluginManagerOptions = { customPluginPath: join(Paths.data(State.id), "node_modules") };

        this.pluginManager = new PluginManager(this.api, pluginManagerOptions);
        this.bridge = new Bridge(this.settings.name, uuid.generate("HomeBridge"));
    }

    public async start(): Promise<void> {
        let promises: Promise<void>[] = [];

        await Plugins.linkLibs(State.id);

        Paths.saveJson(join(Paths.data(State.id), "config.json"), this.config);

        this.watcher = Watcher.watch(join(Paths.data(State.id), "config.json")).on("change", (path: string) => {
            setTimeout(() => {
                const config = Paths.loadJson<any>(path, {});
                const modified = Config.configuration();

                _.merge(modified, { accessories: config.accessories || [], platforms: config.platforms || [] });

                Config.saveConfig(modified, State.id, false, true);
            }, 100);
        });

        this.loadCachedPlatformAccessoriesFromDisk();

        const plugins = Plugins.load(State.id, this.development);

        for (let i = 0; i < plugins.length; i += 1) {
            if (existsSync(join(plugins[i].directory, plugins[i].library))) {
                // @ts-ignore
                if (!this.pluginManager.plugins.get(plugins[i].identifier)) {
                    if (this.development) {
                        Console.info(`Development plugin "${plugins[i].name}"`);
                        Console.info(`Project path "${plugins[i].directory}"`);
                    }

                    const plugin = new Plugin(plugins[i].name, plugins[i].directory, plugins[i].pjson, plugins[i].scope);

                    // @ts-ignore
                    this.pluginManager.plugins.set(plugins[i].identifier, plugin);

                    try {
                        plugin.load();
                        Console.info(`Loaded plugin '${plugins[i].identifier}'`);
                    } catch (error) {
                        Console.error(`Error loading plugin "${plugins[i].identifier}"`);
                        Console.error(error.message || "");
                        Console.error(error.stack.toString());

                        // @ts-ignore
                        this.pluginManager.plugins.delete(plugins[i].identifier);
                    }

                    // @ts-ignore
                    if (this.pluginManager.plugins.get(plugins[i].identifier)) {
                        try {
                            // @ts-ignore
                            this.pluginManager.currentInitializingPlugin = plugin;

                            plugin.initialize(this.api);
                        } catch (error) {
                            Console.error(`Error initializing plugin '${plugins[i].identifier}'`);
                            Console.error(error.stack);

                            // @ts-ignore
                            this.pluginManager.plugins.delete(plugins[i].identifier);
                        }
                    }
                }
            }
        }

        // @ts-ignore
        this.pluginManager.currentInitializingPlugin = undefined;

        // @ts-ignore
        if (this.pluginManager.plugins.size === 0) Console.warn("No plugins installed.");
        if (this.config.platforms.length > 0) promises.push(...this.loadPlatforms());
        if (this.config.accessories.length > 0) this.loadAccessories();

        this.restoreCachedPlatformAccessories();
        this.api.signalFinished();

        await Promise.allSettled(promises);

        promises = [];

        this.publishBridge();
        this.running = true;

        this.emit(Events.LISTENING, this.port);
    }

    public stop(): Promise<void> {
        return new Promise((resolve) => {
            const waits: Promise<void>[] = [];

            this.running = false;
            this.bridge.unpublish();

            if (this.watcher) waits.push(this.watcher.close());

            for (const accessory of this.unbridgedAccessories.values()) {
                accessory._associatedHAPAccessory.unpublish();
            }

            this.saveCachedPlatformAccessoriesOnDisk();
            this.api.signalShutdown();

            Promise.allSettled(waits).then(() => {
                setTimeout(() => {
                    this.emit(Events.SHUTDOWN);

                    try {
                        if (existsSync(join(Paths.data(State.id), "config.json"))) unlinkSync(join(Paths.data(State.id), "config.json"));
                    } catch (error) {
                        Console.warn(error.message);
                    }

                    resolve();
                }, INSTANCE_KILL_DELAY);
            });
        });
    }

    public setupURI(): string {
        return this.bridge.setupURI();
    }

    private getAdvertiser(value?: string): MDNSAdvertiser {
        switch (value) {
            case "ciao":
                return MDNSAdvertiser.CIAO;

            default:
                return MDNSAdvertiser.BONJOUR;
        }
    }

    private publishBridge(): void {
        const info = this.bridge.getService(Service.AccessoryInformation)!;

        info.setCharacteristic(Characteristic.Manufacturer, this.settings.manufacturer || "HOOBS");
        info.setCharacteristic(Characteristic.Model, this.settings.model || "HOOBS");
        info.setCharacteristic(Characteristic.SerialNumber, this.settings.username);
        info.setCharacteristic(Characteristic.FirmwareRevision, State.version);

        this.bridge.on(AccessoryEventTypes.LISTENING, (port: number) => Console.info(`Bridge is running on port ${port}.`));

        const publishInfo: PublishInfo = {
            username: this.settings.username,
            port: this.port,
            pincode: this.settings.pin,
            category: Categories.BRIDGE,
            bind: this.settings.bind,
            addIdentifyingMaterial: true,
            advertiser: this.settings.advertiser,
        };

        if (this.settings.setupID && this.settings.setupID.length === 4) publishInfo.setupID = this.settings.setupID;

        this.bridge.publish(publishInfo, true);
        this.emit(Events.PUBLISH_SETUP_URI, this.setupURI());
    }

    public get getAccessories(): (PlatformAccessory | Accessory)[] {
        return this.hapAccessories.concat(this.platformAccessories || []);
    }

    private loadCachedPlatformAccessoriesFromDisk(): void {
        const backup = Paths.loadJson<SerializedPlatformAccessory[]>(join(Paths.accessories, ".cachedAccessories.bak"), [], undefined, true);
        const cached = Paths.loadJson<SerializedPlatformAccessory[]>(join(Paths.accessories, "cachedAccessories"), backup, undefined, true);

        if (cached && cached.length > 0) {
            this.resetAccessoryMemCache();

            this.platformAccessories = cached.map((serialized) => {
                const accessory = PlatformAccessory.deserialize(serialized);

                this.addHoobsEvents(accessory._associatedHAPAccessory);

                return accessory;
            });

            copyFileSync(join(Paths.accessories, "cachedAccessories"), join(Paths.accessories, ".cachedAccessories.bak"));
        }
    }

    public saveCachedPlatformAccessoriesOnDisk(): void {
        Paths.saveJson(join(Paths.accessories, "cachedAccessories"), this.platformAccessories.map((accessory) => PlatformAccessory.serialize(accessory)), false, undefined, true);
    }

    private restoreCachedPlatformAccessories(): void {
        this.resetAccessoryMemCache();

        this.platformAccessories = this.platformAccessories.filter((accessory) => {
            let plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);

            if (!plugin) {
                try {
                    plugin = this.pluginManager.getPluginByActiveDynamicPlatform(accessory._associatedPlatform!);

                    if (plugin) accessory._associatedPlugin = plugin.getPluginIdentifier();
                } catch (error) {
                    Console.info(`Could not find the associated plugin for the accessory '${accessory.displayName}'.`);
                }
            }

            const platformPlugins = plugin && plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);

            if (!platformPlugins) {
                Console.info(`Failed to find plugin to handle accessory ${accessory._associatedHAPAccessory.displayName}`);

                return false;
            }

            this.addHoobsEvents(accessory._associatedHAPAccessory);

            accessory.getService(Service.AccessoryInformation)!.setCharacteristic(Characteristic.FirmwareRevision, plugin!.version);
            platformPlugins.configureAccessory(accessory);

            try {
                this.bridge.addBridgedAccessory(accessory._associatedHAPAccessory);
            } catch (_error) {
                return false;
            }

            return true;
        });
    }

    private resetAccessoryMemCache() {
        State.cache?.remove(`bridge/${State.id}/accessories`);
    }

    private loadAccessories(): void {
        Console.info(`Loading ${this.config.accessories.length} accessories...`);

        this.config.accessories.forEach((accessoryConfig) => {
            if (!accessoryConfig.accessory) return;

            const accessoryIdentifier: AccessoryName | AccessoryIdentifier = accessoryConfig.accessory;
            const displayName = accessoryConfig.name;

            if (!displayName) return;

            let plugin: Plugin;
            let constructor: AccessoryPluginConstructor;

            try {
                plugin = this.pluginManager.getPluginForAccessory(accessoryIdentifier);
                constructor = plugin.getAccessoryConstructor(accessoryIdentifier);
            } catch (_error) {
                return;
            }

            const logger = Prefixed(plugin.getPluginIdentifier(), displayName);

            const accessoryInstance: AccessoryPlugin = new constructor(<Logging>logger, accessoryConfig, this.api);
            const accessory = this.createHAPAccessory(plugin, accessoryInstance, displayName, accessoryIdentifier, accessoryConfig.uuid_base);

            if (accessory) {
                this.resetAccessoryMemCache();
                this.hapAccessories.push(accessory);
                this.bridge.addBridgedAccessory(accessory);
            } else {
                logger(`Accessory ${accessoryIdentifier} returned empty set of services. Won't adding it to the bridge.`);
            }
        });
    }

    private loadPlatforms(): Promise<void>[] {
        Console.info(`Loading ${this.config.platforms.length} platforms...`);

        const promises: Promise<void>[] = [];

        this.config.platforms.forEach((platformConfig) => {
            if (!platformConfig.platform) return;

            const platformIdentifier: PlatformName | PlatformIdentifier = platformConfig.platform;
            const displayName = platformConfig.name || platformIdentifier;

            let plugin: Plugin;
            let constructor: PlatformPluginConstructor;

            try {
                plugin = this.pluginManager.getPluginForPlatform(platformIdentifier);
                constructor = plugin.getPlatformConstructor(platformIdentifier);
            } catch (error) {
                return;
            }

            const logger = Prefixed(plugin.getPluginIdentifier(), displayName);
            const platform: PlatformPlugin = new constructor(logger, platformConfig, this.api);

            if (HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
                plugin.assignDynamicPlatform(platformIdentifier, platform);
            } else if (HomebridgeAPI.isStaticPlatformPlugin(platform)) {
                promises.push(this.loadPlatformAccessories(plugin, platform, platformIdentifier, logger));
            }
        });

        return promises;
    }

    private async loadPlatformAccessories(plugin: Plugin, platformInstance: StaticPlatformPlugin, platformType: PlatformName | PlatformIdentifier, logger: Logging): Promise<void> {
        return new Promise((resolve) => {
            platformInstance.accessories(once((accessories: AccessoryPlugin[]) => {
                accessories.forEach((accessoryInstance, index) => {
                    // @ts-ignore
                    const accessoryName = accessoryInstance.name;

                    // @ts-ignore
                    const uuidBase: string | undefined = accessoryInstance.uuid_base;
                    const accessory = this.createHAPAccessory(plugin, accessoryInstance, accessoryName, platformType, uuidBase);

                    if (accessory) {
                        this.resetAccessoryMemCache();
                        this.hapAccessories.push(accessory);
                        this.bridge.addBridgedAccessory(accessory);
                    } else {
                        logger(`Platform %${platformType} returned an accessory at index ${index} with an empty set of services. Won't adding it to the bridge.`);
                    }
                });

                resolve();
            }));
        });
    }

    private createHAPAccessory(plugin: Plugin, accessoryInstance: AccessoryPlugin, displayName: string, accessoryType: AccessoryName | AccessoryIdentifier, uuidBase?: string): Accessory | undefined {
        const services = (accessoryInstance.getServices() || []).filter((service) => !!service);
        const controllers = (accessoryInstance.getControllers ? accessoryInstance.getControllers() || [] : []).filter((controller) => !!controller);

        if (services.length === 0 && controllers.length === 0) return undefined;

        if (!(services[0] instanceof Service)) {
            for (let i = 0; i < services.length; i += 1) {
                // @ts-ignore
                services[i].sType = services[i].sType || services[i].UUID;
            }

            return AccessoryLoader.parseAccessoryJSON({
                displayName,
                services,
            });
        }

        const accessoryUUID = uuid.generate(`${accessoryType}:${uuidBase || displayName}`);
        const accessory = new Accessory(displayName, accessoryUUID);

        this.addHoobsInformation(accessory, plugin);
        this.addHoobsEvents(accessory);

        if (accessoryInstance.identify) {
            accessory.on(AccessoryEventTypes.IDENTIFY, (_paired, callback) => {
                // @ts-ignore
                accessoryInstance.identify!(() => {});

                callback();
            });
        }

        const informationService = accessory.getService(Service.AccessoryInformation)!;

        services.forEach((service) => {
            if (service instanceof Service.AccessoryInformation) {
                service.setCharacteristic(Characteristic.Name, displayName);
                service.getCharacteristic(Characteristic.Identify).removeAllListeners(CharacteristicEventTypes.SET);

                informationService.replaceCharacteristicsFromService(service);
            } else {
                accessory.addService(service);
            }
        });

        if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);

        controllers.forEach((controller) => accessory.configureController(controller));

        return accessory;
    }

    private handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
        const hapAccessories = accessories.map((accessory) => {
            const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);

            this.resetAccessoryMemCache();
            this.addHoobsInformation(accessory._associatedHAPAccessory, plugin);
            this.addHoobsEvents(accessory._associatedHAPAccessory);
            this.platformAccessories.push(accessory);

            if (plugin) {
                const informationService = accessory.getService(Service.AccessoryInformation)!;

                if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);

                const platforms = plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);

                if (!platforms) Console.warn(`The plugin "${accessory._associatedPlugin!}" registered a new accessory for the platform "${accessory._associatedPlatform!}". The platform couldn't be found though.`);
            } else {
                Console.warn(`A platform configured a new accessory under the plugin name "${accessory._associatedPlugin}". However no loaded plugin could be found for the name.`);
            }

            return accessory._associatedHAPAccessory;
        });

        this.bridge.addBridgedAccessories(hapAccessories);
        this.saveCachedPlatformAccessoriesOnDisk();
    }

    private handleUpdatePlatformAccessories(): void {
        this.saveCachedPlatformAccessoriesOnDisk();
    }

    private handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
        const hapAccessories = accessories.map((accessory) => {
            const index = this.platformAccessories.indexOf(accessory);

            this.resetAccessoryMemCache();

            if (index >= 0) this.platformAccessories.splice(index, 1);

            return accessory._associatedHAPAccessory;
        });

        this.bridge.removeBridgedAccessories(hapAccessories);
        this.saveCachedPlatformAccessoriesOnDisk();
    }

    private async handlePublishExternalAccessories(accessories: PlatformAccessory[]): Promise<void> {
        for (let i = 0; i < accessories.length; i += 1) {
            const accessory = accessories[i]._associatedHAPAccessory;
            const username = mac.generate(accessory.UUID);

            if (this.unbridgedAccessories.has(username)) {
                Console.error(`Accessory ${accessory.displayName} experienced an address collision.`);
            } else {
                const plugin = this.pluginManager.getPlugin(accessories[i]._associatedPlugin!);

                this.unbridgedAccessories.set(username, accessories[i]);
                this.addHoobsInformation(accessory, plugin);
                this.addHoobsEvents(accessory);

                if (plugin) {
                    const informationService = accessory.getService(Service.AccessoryInformation)!;

                    if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);

                    accessory.on(AccessoryEventTypes.LISTENING, (port: number) => Console.info(`${accessory.displayName} is running on port ${port}.`));

                    this.resetAccessoryMemCache();
                    this.hapAccessories.push(accessory);

                    accessory.publish({
                        username,
                        pincode: this.config.bridge.pin,
                        category: accessories[i].category,
                        port: await this.externalPorts.requestPort(username),
                        bind: this.settings.bind,
                        addIdentifyingMaterial: true,
                        advertiser: this.settings.advertiser,
                    }, true);
                } else {
                    Console.warn(`A platform configured a external accessory under the plugin name "${accessories[i]._associatedPlugin}". However no loaded plugin could be found for the name.`);
                }
            }
        }
    }

    private addHoobsInformation(accessory: Accessory, plugin: Plugin | undefined): void {
        const hoobs = new HOOBSService();

        if (plugin) hoobs.updateCharacteristic(PluginID, plugin.getPluginIdentifier());

        hoobs.updateCharacteristic(DeviceID, accessory.UUID);
        accessory.addService(hoobs);
    }

    private addHoobsEvents(accessory: Accessory): void {
        let service: string | undefined;

        for (let i = 0; i < accessory.services.length; i += 1) {
            const type = Services[toShortForm(accessory.services[i].UUID)];

            if (type === "camera") {
                service = "camera";

                break;
            }

            if (type === "television") {
                service = "television";

                break;
            }
        }

        switch (service) {
            case "camera":
                for (let i = 0; i < accessory.services.length; i += 1) {
                    switch (Services[toShortForm(accessory.services[i].UUID)]) {
                        case "sensor":
                            accessory.services[i].on("characteristic-change", (data: any) => {
                                if (data && data.newValue !== data.oldValue) {
                                    switch (Characteristics[toShortForm(data.characteristic.UUID)]) {
                                        case "motion_detected":
                                            this.emit(Events.ACCESSORY_CHANGE, this.accessories.get(Accessories.identifier(State.id, accessory.UUID))?.refresh(), data.newValue);
                                            break;
                                    }
                                }
                            });

                            break;
                    }
                }

                break;

            case "television":
                for (let i = 0; i < accessory.services.length; i += 1) {
                    switch (Services[toShortForm(accessory.services[i].UUID)]) {
                        case "switch":
                            accessory.services[i].on("characteristic-change", (data: any) => {
                                if (data && data.newValue !== data.oldValue) {
                                    switch (Characteristics[toShortForm(data.characteristic.UUID)]) {
                                        case "brightness":
                                        case "on":
                                            this.emit(Events.ACCESSORY_CHANGE, this.accessories.get(Accessories.identifier(State.id, accessory.UUID))?.refresh(), data.newValue);
                                            break;
                                    }
                                }
                            });

                            break;

                        case "speaker":
                            accessory.services[i].on("characteristic-change", (data: any) => {
                                if (data && data.newValue !== data.oldValue) {
                                    switch (Characteristics[toShortForm(data.characteristic.UUID)]) {
                                        case "active":
                                        case "volume":
                                            this.emit(Events.ACCESSORY_CHANGE, this.accessories.get(Accessories.identifier(State.id, accessory.UUID))?.refresh(), data.newValue);
                                            break;
                                    }
                                }
                            });

                            break;
                    }
                }

                break;

            default:
                accessory.removeAllListeners(AccessoryEventTypes.SERVICE_CHARACTERISTIC_CHANGE);

                accessory.on(AccessoryEventTypes.SERVICE_CHARACTERISTIC_CHANGE, (data: any) => {
                    if (data && data.newValue !== data.oldValue) {
                        this.emit(Events.ACCESSORY_CHANGE, this.accessories.get(Accessories.identifier(State.id, accessory.UUID))?.refresh(), data.newValue);
                    }
                });

                break;
        }
    }
}
