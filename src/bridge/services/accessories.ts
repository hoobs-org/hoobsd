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

import _ from "lodash";
import { createHash } from "crypto";

import {
    Perms,
    Accessory,
    SerializedService,
    SerializedCharacteristic,
} from "hap-nodejs";

import { toShortForm } from "hap-nodejs/dist/lib/util/uuid";
import { PlatformAccessory } from "homebridge/lib/platformAccessory";
import State from "../../state";

import {
    ExcludeServices,
    Services,
    Characteristics,
    Precedence,
} from "./types";

export default class Accessories {
    public list(reload?: boolean): { [key: string]: any }[] {
        const results = this.load(reload);

        this.updateAll(results);

        return results;
    }

    public get(id: string, reload?: boolean): { [key: string]: any } | undefined {
        if (!id || id === "") return undefined;

        const result = this.load(reload).find((item) => item.accessory_identifier === id);

        if (!result) return undefined;

        this.updateOne(result);

        return result;
    }

    private cache(accessory: { [key: string]: any }): void {
        const key = `bridge/${accessory.bridge}/accessories`;
        const accessories = this.load(accessory.bridge);
        const index = accessories.findIndex((item) => item.accessory_identifier === accessory.accessory_identifier);

        if (index >= 0) {
            accessories[index] = accessory;
        }

        State.cache?.set(key, accessories, 30);
    }

    private load(reload?: boolean): { [key: string]: any }[] {
        const key = `bridge/${State.id}/accessories`;

        if (!reload) {
            const cached = State.cache?.get<{ [key: string]: any }[]>(key);

            if (cached && Array.isArray(cached) && cached.length > 0) return cached;
        }

        const accessories = this.transform(State.homebridge?.getAccessories.map((cached) => this.seralizeAccessory(cached)) || []);

        State.cache?.set(key, accessories, 30);

        return accessories;
    }

    private loadOne(accessory: string): { [key: string]: any } {
        return this.transform(State.homebridge?.getAccessories.filter((item) => item.UUID === accessory).map((cached) => this.seralizeAccessory(cached)) || [])[0];
    }

    private seralizeAccessory(cached: PlatformAccessory | Accessory): { [key: string]: any } {
        const accessory = cached instanceof PlatformAccessory ? PlatformAccessory.serialize(cached) : Accessory.serialize(cached);

        return {
            uuid: accessory.UUID,
            bridge_identifier: Accessories.identifier(State.id),
            bridge: State.id,
            category: accessory.category,
            name: accessory.displayName,
            services: accessory.services.map((service) => this.seralizeService(service)),
        };
    }

    private seralizeService(service: SerializedService): { [key: string]: any } {
        return {
            uuid: service.UUID,
            type: toShortForm(service.UUID),
            hidden: service.hiddenService,
            primary: service.primaryService,
            characteristics: service.characteristics.map((characteristic) => this.seralizeCharacteristic(service, characteristic)),
            optional: service.optionalCharacteristics?.map((characteristic) => this.seralizeCharacteristic(service, characteristic)),
        };
    }

    private seralizeCharacteristic(service: SerializedService, characteristic: SerializedCharacteristic): { [key: string]: any } {
        return {
            uuid: characteristic.UUID,
            type: Characteristics[toShortForm(characteristic.UUID)] || toShortForm(characteristic.UUID),
            service: {
                uuid: service.UUID,
                type: Services[toShortForm(service.UUID)] || toShortForm(service.UUID),
            },
            description: characteristic.displayName,
            value: characteristic.value,
            format: characteristic.props.format,
            unit: characteristic.props.unit,
            max_value: characteristic.props.maxValue,
            min_value: characteristic.props.minValue,
            min_step: characteristic.props.minStep,
            max_length: characteristic.props.maxLen || characteristic.props.maxDataLen,
            valid_values: characteristic.props.validValues,
            read: characteristic.props.perms.includes(Perms.PAIRED_READ),
            write: characteristic.props.perms.includes(Perms.PAIRED_WRITE),
        };
    }

    private transform(accessories: { [key: string]: any }[]): { [key: string]: any }[] {
        const services: { [key: string]: any }[] = [];

        for (let i = 0; i < accessories.length; i += 1) {
            const information: { [key: string]: any } = accessories[i].services.find((x: { [key: string]: any }) => x.type === "3E");
            const details: { [key: string]: any } = {};

            if (information && Array.isArray(information.characteristics)) {
                for (let j = 0; j < information.characteristics.length; j += 1) {
                    if (information.characteristics[j].value) {
                        details[Accessories.decamel(information.characteristics[j].description)] = information.characteristics[j].value;
                    }
                }
            }

            for (let j = 0; j < accessories[i].services.length; j += 1) {
                if (ExcludeServices.indexOf(accessories[i].services[j].type) === -1) {
                    let service: { [key: string]: any } = services.find((item) => item.uuid === accessories[i].uuid) || {};

                    if (!service.uuid) {
                        service = {
                            uuid: accessories[i].uuid,
                            accessory_identifier: "",
                            bridge_identifier: accessories[i].bridge_identifier,
                            bridge: accessories[i].bridge,
                            plugin: "",
                            room: "default",
                            category: accessories[i].category,
                            name: accessories[i].displayName,
                            sequence: 0,
                            hidden: false,
                            type: Services[accessories[i].services[j].type],
                            linked: accessories[i].services[j].linked,
                            characteristics: [],
                        };

                        const keys: string[] = _.keys(details);

                        for (let k = 0; k < keys.length; k += 1) {
                            service[keys[k]] = details[keys[k]];
                        }

                        service.accessory_identifier = Accessories.identifier(State.id, service.device_id);
                        service.plugin = service.plugin_id;

                        if (service.accessory_identifier === service.bridge_identifier) {
                            delete service.bridge_identifier;
                            delete service.sequence;
                            delete service.room;

                            service.type = "bridge";
                            service.hidden = true;
                        }

                        delete service.device_id;
                        delete service.plugin_id;

                        services.push(service);
                    }

                    if (Precedence[Services[accessories[i].services[j].type]] && Precedence[Services[accessories[i].services[j].type]] < Precedence[service.type]) service.type = Services[accessories[i].services[j].type];

                    for (let k = 0; k < accessories[i].services[j].characteristics.length; k += 1) {
                        if (accessories[i].services[j].characteristics[k].type !== "23") {
                            const characteristic: { [key: string]: any } = accessories[i].services[j].characteristics[k];

                            if (characteristic.service.type === "sensor" && (!service.main_sensor || Precedence[characteristic.type] < Precedence[service.main_sensor])) service.main_sensor = characteristic.type;

                            service.characteristics.push(characteristic);
                        }
                    }
                }
            }
        }

        return services;
    }

    private updateAll(accessories: { [key: string]: any }[]): void {
        for (let i = 0; i < accessories.length; i += 1) {
            this.updateOne(accessories[i]);
        }
    }

    private updateOne(accessory: { [key: string]: any } | undefined): void {
        if (!accessory) return;

        if (accessory.type !== "bridge") {
            accessory.refresh = (): { [key: string]: any } => {
                const updated = this.loadOne(accessory.uuid);

                if (updated) this.cache(updated);

                return updated;
            };

            accessory.set = (type: string, value: any): { [key: string]: any } => {
                const characteristic: { [key: string]: any } | undefined = accessory.characteristics.find((c: { [key: string]: any }) => c.type === type);

                if (typeof value === "boolean") value = value ? 1 : 0;

                if (characteristic) {
                    State.homebridge?.getAccessories.filter((item) => item.UUID === accessory.uuid).forEach((a) => {
                        a.services.filter((s) => s.UUID === characteristic.service.uuid).forEach((s) => {
                            const char = s.characteristics.find((c) => c.UUID === characteristic.uuid);

                            if (char) s.setCharacteristic(char.displayName, value);
                        });
                    });
                }

                return accessory;
            };

            accessory.get = (type: string): { [key: string]: any } | undefined => accessory.characteristics.find((c: { [key: string]: any }) => c.type === type);

            if (accessory.type === "camera") {
                accessory.snapshot = (): Promise<string | undefined> => new Promise((resolve) => {
                    const cached = State.homebridge?.getAccessories.filter((item) => item.UUID === accessory.uuid)[0];

                    // @ts-ignore
                    const context: any = cached instanceof PlatformAccessory ? cached._associatedHAPAccessory.controllers.camera : cached?.controllers.camera;

                    if (context && context.controller) {
                        context.controller.delegate.handleSnapshotRequest({ width: 640, height: 360 }, (_error: any, buffer: Buffer) => {
                            if (!buffer && context.controller.cachedSnapshot) {
                                resolve(context.controller.cachedSnapshot.toString("base64"));
                            } else if (buffer) {
                                resolve(buffer.toString("base64"));
                            } else {
                                resolve(undefined);
                            }
                        });
                    }
                });

                accessory.stream = (): string | undefined => {
                    const cached = State.homebridge?.getAccessories.filter((item) => item.UUID === accessory.uuid)[0];

                    // @ts-ignore
                    const context: any = cached instanceof PlatformAccessory ? cached._associatedHAPAccessory.controllers.camera : cached?.controllers.camera;

                    if (context && context.controller && context.controller.delegate.videoConfig) {
                        const matches = (` ${context.controller.delegate.videoConfig.source} `).match(/(rtsp)+[:.].*?(?=\s)/i);

                        if (matches) return matches[0];
                    }

                    return undefined;
                };
            }
        }
    }

    static identifier(bridge: string, id?: string): string {
        const hash = createHash("md5").update(`${bridge}-${id || ""}`).digest("hex");

        return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20)}`;
    }

    static decamel(value: string): string {
        let results = value;

        results = results.replace(/ /gi, "_");
        results = results.replace(/-/gi, "_");
        results = results.replace(/,/gi, "");
        results = results.replace(/'/gi, "");
        results = results.replace(/"/gi, "");
        results = results.replace(/!/gi, "");
        results = results.replace(/\./gi, "");
        results = results.replace(/\[/gi, "");
        results = results.replace(/\]/gi, "");
        results = results.replace(/\\/gi, "");
        results = results.replace(/\//gi, "");
        results = results.replace(/\^/gi, "");
        results = results.replace(/\$/gi, "");
        results = results.replace(/\|/gi, "");
        results = results.replace(/\?/gi, "");
        results = results.replace(/\*/gi, "");
        results = results.replace(/\+/gi, "");
        results = results.replace(/\(/gi, "");
        results = results.replace(/\)/gi, "");

        return results.toLowerCase();
    }
}
