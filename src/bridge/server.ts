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
import storage, { LocalStorage } from "node-persist";
import { existsSync } from "fs-extra";

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

import { HomebridgeConfig, BridgeConfiguration, ExternalPortsConfiguration } from "homebridge/lib/server";
import { PlatformAccessory, SerializedPlatformAccessory } from "homebridge/lib/platformAccessory";
import { Logger, Logging } from "homebridge/lib/logger";
import { User } from "homebridge/lib/user";
import * as mac from "homebridge/lib/util/mac";
import { MacAddress } from "homebridge/lib/util/mac";
import { PluginManager, PluginManagerOptions } from "homebridge/lib/pluginManager";
import { Plugin } from "homebridge/lib/plugin";
import Paths from "../services/paths";
import State from "../state";
import Plugins from "../services/plugins";
import Config from "../services/config";
import Client from "./services/client";
import { BridgeRecord } from "../services/bridges";
import { Console, Prefixed, Events } from "../services/logger";

const INSTANCE_KILL_DELAY = 3000;
const PERSISTED_CACHE: LocalStorage = storage.create();

// @ts-ignore
PluginManager.PLUGIN_IDENTIFIER_PATTERN = /^((@[\S]*)\/)?([\S-]*)$/;

User.setStoragePath(Paths.storagePath());

export default class Server extends EventEmitter {
    public running: boolean;

    public readonly port: number;

    public readonly settings: BridgeConfiguration;

    public readonly instance: BridgeRecord | undefined;

    public readonly client: Client;

    private readonly api: HomebridgeAPI;

    private readonly pluginManager: PluginManager;

    private readonly bridge: Bridge;

    private readonly config: HomebridgeConfig;

    private readonly keepOrphanedCachedAccessories: boolean;

    private readonly allowInsecureAccess: boolean;

    private readonly externalPorts?: ExternalPortsConfiguration;

    private nextExternalPort?: number;

    private cachedPlatformAccessories: PlatformAccessory[] = [];

    private cachedAccessoriesFileCreated = false;

    private readonly publishedExternalAccessories: Map<MacAddress, PlatformAccessory> = new Map();

    constructor(port?: number) {
        super();

        Logger.setTimestampEnabled(false);

        if (State.debug) Logger.setDebugEnabled(true);

        // @ts-ignore
        Logger.internal = Console;

        (async () => {
            await PERSISTED_CACHE.init({
                dir: Paths.cachedAccessoryPath(),
            });
        })();

        this.running = false;
        this.instance = State.bridges.find((n: any) => n.id === State.id);

        this.config = {
            bridge: {
                name: this.instance?.display || "HOOBS",
                pin: this.instance?.pin || "031-45-154",
                username: this.instance?.username || "",
            },
            plugins: [],
            accessories: [],
            platforms: [],
        };

        if (this.instance?.ports?.start && this.instance?.ports?.start) {
            this.config.ports = {
                start: this.instance.ports.start,
                end: this.instance.ports.end,
            };
        }

        this.config = _.extend(this.config, Config.configuration());

        for (let i = 0; i < this.config.accessories.length; i += 1) {
            delete this.config.accessories[i].plugin_map;
        }

        for (let i = 0; i < this.config.platforms.length; i += 1) {
            delete this.config.platforms[i].plugin_map;
        }

        this.settings = this.config.bridge;
        this.port = port || 51826;
        this.keepOrphanedCachedAccessories = false;
        this.allowInsecureAccess = true;
        this.externalPorts = this.config.ports;
        this.api = new HomebridgeAPI();
        this.client = new Client();

        this.api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, this.handleRegisterPlatformAccessories.bind(this));
        this.api.on(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, this.handleUpdatePlatformAccessories.bind(this));
        this.api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, this.handleUnregisterPlatformAccessories.bind(this));
        this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, this.handlePublishExternalAccessories.bind(this));

        const pluginManagerOptions: PluginManagerOptions = {
            activePlugins: this.config.plugins,
            customPluginPath: join(Paths.storagePath(State.id), "node_modules"),
        };

        this.pluginManager = new PluginManager(this.api, pluginManagerOptions);
        this.bridge = new Bridge(this.settings.name, uuid.generate("HomeBridge"));
    }

    public async start(): Promise<void> {
        const promises: Promise<void>[] = [];

        Plugins.linkLibs();

        this.loadCachedPlatformAccessoriesFromDisk();

        Plugins.load(State.id, (identifier, name, scope, directory, pjson, library) => {
            if ((this.config.plugins || []).indexOf(identifier) >= 0 && existsSync(join(directory, library))) {
                // @ts-ignore
                if (!this.pluginManager.plugins.get(identifier)) {
                    const plugin = new Plugin(name, directory, pjson, scope);

                    // @ts-ignore
                    this.pluginManager.plugins.set(identifier, plugin);

                    try {
                        plugin.load();
                    } catch (error) {
                        Console.error(`Error loading plugin "${identifier}"`);
                        Console.error(error.stack);

                        // @ts-ignore
                        this.pluginManager.plugins.delete(identifier);
                    }

                    Console.info(`Loaded plugin '${identifier}'`);

                    // @ts-ignore
                    if (this.pluginManager.plugins.get(identifier)) {
                        try {
                            // @ts-ignore
                            this.pluginManager.currentInitializingPlugin = plugin;

                            plugin.initialize(this.api);
                        } catch (error) {
                            Console.error(`Error initializing plugin '${identifier}'`);
                            Console.error(error.stack);

                            // @ts-ignore
                            this.pluginManager.plugins.delete(identifier);
                        }
                    }
                }
            }
        });

        // @ts-ignore
        this.pluginManager.currentInitializingPlugin = undefined;

        // @ts-ignore
        if (this.pluginManager.plugins.size === 0) {
            Console.warn("No plugins installed.");
        }

        if (this.config.platforms.length > 0) promises.push(...this.loadPlatforms());
        if (this.config.accessories.length > 0) this.loadAccessories();

        this.restoreCachedPlatformAccessories();
        this.api.signalFinished();

        await Promise.all(promises);

        this.publishBridge();
        this.running = true;

        this.emit(Events.LISTENING, this.port);
    }

    public stop(): Promise<void> {
        return new Promise((resolve) => {
            this.running = false;

            this.saveCachedPlatformAccessoriesOnDisk();
            this.bridge.unpublish();

            for (const accessory of this.publishedExternalAccessories.values()) {
                accessory._associatedHAPAccessory.unpublish();
            }

            this.api.signalShutdown();

            setTimeout(() => {
                this.emit(Events.SHUTDOWN);

                resolve();
            }, INSTANCE_KILL_DELAY);
        });
    }

    public setupURI(): string {
        return this.bridge.setupURI();
    }

    private publishBridge(): void {
        const info = this.bridge.getService(Service.AccessoryInformation)!;

        info.setCharacteristic(Characteristic.Manufacturer, this.settings.manufacturer || "HOOBS");
        info.setCharacteristic(Characteristic.Model, this.settings.model || "HOOBS");
        info.setCharacteristic(Characteristic.SerialNumber, this.settings.username);
        info.setCharacteristic(Characteristic.FirmwareRevision, State.version);

        this.bridge.on(AccessoryEventTypes.LISTENING, (port: number) => {
            Console.info("Homebridge is running on port %s.", port);
        });

        const publishInfo: PublishInfo = {
            username: this.settings.username,
            port: this.port,
            pincode: this.settings.pin,
            category: Categories.BRIDGE,
            mdns: this.config.mdns,
        };

        if (this.settings.setupID && this.settings.setupID.length === 4) publishInfo.setupID = this.settings.setupID;

        this.bridge.publish(publishInfo, this.allowInsecureAccess);
        this.emit(Events.PUBLISH_SETUP_URI, this.setupURI());
    }

    private async loadCachedPlatformAccessoriesFromDisk(): Promise<void> {
        const cachedAccessories: SerializedPlatformAccessory[] = await PERSISTED_CACHE.getItem("cachedAccessories");

        if (cachedAccessories) {
            this.cachedPlatformAccessories = cachedAccessories.map((serialized) => PlatformAccessory.deserialize(serialized));
            this.cachedAccessoriesFileCreated = true;
        }
    }

    private restoreCachedPlatformAccessories(): void {
        this.cachedPlatformAccessories = this.cachedPlatformAccessories.filter((accessory) => {
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

                if (!this.keepOrphanedCachedAccessories) return false;
            } else {
                accessory.getService(Service.AccessoryInformation)!.setCharacteristic(Characteristic.FirmwareRevision, plugin!.version);

                platformPlugins.configureAccessory(accessory);
            }

            this.bridge.addBridgedAccessory(accessory._associatedHAPAccessory);

            return true;
        });
    }

    private async saveCachedPlatformAccessoriesOnDisk(): Promise<void> {
        if (this.cachedPlatformAccessories.length > 0) {
            this.cachedAccessoriesFileCreated = true;

            const serializedAccessories = this.cachedPlatformAccessories.map((accessory) => PlatformAccessory.serialize(accessory));

            await PERSISTED_CACHE.setItem("cachedAccessories", serializedAccessories);
        } else if (this.cachedAccessoriesFileCreated) {
            this.cachedAccessoriesFileCreated = false;

            await PERSISTED_CACHE.removeItem("cachedAccessories");
        }
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
                this.bridge.addBridgedAccessory(accessory);
            } else {
                logger("Accessory %s returned empty set of services. Won't adding it to the bridge!", accessoryIdentifier);
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
                        this.bridge.addBridgedAccessory(accessory);
                    } else {
                        logger("Platform %s returned an accessory at index %d with an empty set of services. Won't adding it to the bridge!", platformType, index);
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
            return AccessoryLoader.parseAccessoryJSON({
                displayName,
                services,
            });
        }

        const accessoryUUID = uuid.generate(`${accessoryType}:${uuidBase || displayName}`);
        const accessory = new Accessory(displayName, accessoryUUID);

        if (accessoryInstance.identify) {
            accessory.on(AccessoryEventTypes.IDENTIFY, (_paired, callback) => {
                // @ts-ignore
                accessoryInstance.identify!(() => {});

                callback();
            });
        }

        const informationService = accessory.getService(Service.AccessoryInformation)!;

        informationService.addOptionalCharacteristic(Characteristic.AccessoryIdentifier);

        services.forEach((service) => {
            if (service instanceof Service.AccessoryInformation) {
                service.setCharacteristic(Characteristic.Name, displayName);
                service.getCharacteristic(Characteristic.Identify).removeAllListeners(CharacteristicEventTypes.SET);

                informationService.replaceCharacteristicsFromService(service);
            } else {
                accessory.addService(service);
            }
        });

        if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
            informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
        }

        informationService.updateCharacteristic(Characteristic.AccessoryIdentifier, accessory.UUID);

        accessory.on(AccessoryEventTypes.SERVICE_CHARACTERISTIC_CHANGE, (data: any) => {
            this.client.accessory(accessory.UUID).then((service) => {
                if (service) {
                    service.refresh((results: any) => {
                        service.values = results.values;
                    }).finally(() => {
                        this.emit(Events.ACCESSORY_CHANGE, service, data.newValue);
                    });
                }
            });
        });

        controllers.forEach((controller) => {
            accessory.configureController(controller);
        });

        return accessory;
    }

    private handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
        const hapAccessories = accessories.map((accessory) => {
            this.cachedPlatformAccessories.push(accessory);

            const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);

            if (plugin) {
                const informationService = accessory.getService(Service.AccessoryInformation)!;

                informationService.addOptionalCharacteristic(Characteristic.AccessoryIdentifier);

                if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
                    informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
                }

                informationService.updateCharacteristic(Characteristic.AccessoryIdentifier, accessory._associatedHAPAccessory.UUID);

                const platforms = plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);

                if (!platforms) {
                    Console.warn("The plugin '%s' registered a new accessory for the platform '%s'. The platform couldn't be found though!", accessory._associatedPlugin!, accessory._associatedPlatform!);
                }
            } else {
                Console.warn("A platform configured a new accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
            }

            accessory._associatedHAPAccessory.on(AccessoryEventTypes.SERVICE_CHARACTERISTIC_CHANGE, (data: any) => {
                this.client.accessory(accessory._associatedHAPAccessory.UUID).then((service) => {
                    if (service) {
                        service.refresh((results: any) => {
                            service.values = results.values;
                        }).finally(() => {
                            this.emit(Events.ACCESSORY_CHANGE, service, data.newValue);
                        });
                    }
                });
            });

            return accessory._associatedHAPAccessory;
        });

        this.bridge.addBridgedAccessories(hapAccessories);
        this.saveCachedPlatformAccessoriesOnDisk();
    }

    private handleUpdatePlatformAccessories(accessories: PlatformAccessory[]): void {
        this.saveCachedPlatformAccessoriesOnDisk();
    }

    private handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
        const hapAccessories = accessories.map((accessory) => {
            const index = this.cachedPlatformAccessories.indexOf(accessory);

            if (index >= 0) this.cachedPlatformAccessories.splice(index, 1);

            return accessory._associatedHAPAccessory;
        });

        this.bridge.removeBridgedAccessories(hapAccessories);
        this.saveCachedPlatformAccessoriesOnDisk();
    }

    private handlePublishExternalAccessories(accessories: PlatformAccessory[]): void {
        const accessoryPin = this.config.bridge.pin;

        accessories.forEach((accessory) => {
            let accessoryPort = 0;

            if (this.externalPorts) {
                if (this.nextExternalPort === undefined) this.nextExternalPort = this.externalPorts.start;

                if (this.nextExternalPort <= this.externalPorts.end) {
                    this.nextExternalPort += 1;

                    accessoryPort = this.nextExternalPort;
                } else {
                    Console.warn("External port pool ran out of ports. Fallback to random assign.");
                }
            }

            const hapAccessory = accessory._associatedHAPAccessory;
            const advertiseAddress = mac.generate(hapAccessory.UUID);

            if (this.publishedExternalAccessories.has(advertiseAddress)) {
                throw new Error(`Accessory ${hapAccessory.displayName} experienced an address collision.`);
            } else {
                this.publishedExternalAccessories.set(advertiseAddress, accessory);
            }

            const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);

            if (plugin) {
                const informationService = hapAccessory.getService(Service.AccessoryInformation)!;

                if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
            } else if (PluginManager.isQualifiedPluginIdentifier(accessory._associatedPlugin!)) {
                Console.warn("A platform configured a external accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
            }

            hapAccessory.on(AccessoryEventTypes.LISTENING, (port: number) => {
                Console.info("%s is running on port %s.", hapAccessory.displayName, port);
            });

            hapAccessory.publish({
                username: advertiseAddress,
                pincode: accessoryPin,
                category: accessory.category,
                port: accessoryPort,
                mdns: this.config.mdns,
            }, this.allowInsecureAccess);
        });
    }
}
