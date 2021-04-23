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
        const accessories = this.load();
        const index = accessories.findIndex((item) => item.accessory_identifier === accessory.accessory_identifier);

        if (index >= 0) accessories[index] = accessory;

        State.cache?.set(key, accessories, 30);
    }

    private load(reload?: boolean): { [key: string]: any }[] {
        const key = `bridge/${State.id}/accessories`;

        if (!reload) {
            const cached = State.cache?.get<{ [key: string]: any }[]>(key);

            if (cached && Array.isArray(cached) && cached.length > 0) return cached;
        }

        const accessories: { [key: string]: any }[] = [];
        const hap = State.homebridge?.getAccessories || [];

        for (let i = 0; i < hap.length; i += 1) {
            const item = this.seralizeAccessory(hap[i]);
            const index = accessories.findIndex((existing) => existing.uuid === item.uuid);

            if (index >= 0) {
                accessories[index].characteristics = [...accessories[index].characteristics, ...item.characteristics];
                accessories[index].optional_characteristics = [...accessories[index].optional_characteristics, ...item.optional_characteristics];

                if (!accessories[index].main_sensor && item.main_sensor) accessories[index].main_sensor = item.main_sensor;
                if (accessories[index].main_sensor && item.main_sensor && Precedence[item.main_sensor] < Precedence[accessories[index].main_sensor]) accessories[index].main_sensor = item.main_sensor;
            } else {
                accessories.push(item);
            }
        }

        State.cache?.set(key, accessories, 30);

        return accessories;
    }

    private loadOne(accessory: string): { [key: string]: any } {
        const accessories: { [key: string]: any }[] = [];
        const hap = (State.homebridge?.getAccessories || []).filter((item) => item.UUID === accessory);

        for (let i = 0; i < hap.length; i += 1) {
            const item = this.seralizeAccessory(hap[i]);
            const index = accessories.findIndex((existing) => existing.uuid === item.uuid);

            if (index >= 0) {
                accessories[index].characteristics = [...accessories[index].characteristics, ...item.characteristics];

                if ((Precedence[item.type] || Number.MAX_SAFE_INTEGER) < Precedence[accessories[index].type]) accessories[index].type = item.type;
                if (!accessories[index].main_sensor && item.main_sensor) accessories[index].main_sensor = item.main_sensor;

                if (accessories[index].main_sensor && item.main_sensor && (Precedence[item.main_sensor] || Number.MAX_SAFE_INTEGER) < Precedence[accessories[index].main_sensor]) {
                    accessories[index].main_sensor = item.main_sensor;
                }
            } else {
                accessories.push(item);
            }
        }

        return accessories[0];
    }

    private seralizeAccessory(cached: PlatformAccessory | Accessory): { [key: string]: any } {
        const accessory = cached instanceof PlatformAccessory ? PlatformAccessory.serialize(cached) : Accessory.serialize(cached);

        // @ts-ignore
        const context: any = cached instanceof PlatformAccessory ? cached._associatedHAPAccessory.controllers.camera : cached?.controllers.camera;

        let source: string | undefined;

        if (context && context.controller && context.controller.delegate.videoConfig) {
            const matches = (` ${context.controller.delegate.videoConfig.source} `).match(/(rtsp)+[:.].*?(?=\s)/i);

            if (matches && matches[0]) [source] = matches;
        }

        const searilized: { [key: string]: any } = {
            uuid: accessory.UUID,
            accessory_identifier: undefined,
            bridge_identifier: Accessories.identifier(State.id),
            bridge: State.id,
            plugin: "",
            room: "default",
            category: accessory.category,
            name: accessory.displayName,
            sequence: 0,
            hidden: false,
            type: undefined,
            supports_streaming: source ? true : undefined,
            streaming_source: source,
        };

        const characteristics: { [key: string]: any }[] = [];

        for (let i = 0; i < accessory.services.length; i += 1) {
            this.seralizeService(accessory.services[i], searilized, characteristics);
        }

        if (searilized.accessory_identifier === searilized.bridge_identifier) {
            delete searilized.bridge_identifier;
            delete searilized.sequence;
            delete searilized.room;

            searilized.type = "bridge";
            searilized.hidden = true;
        }

        searilized.characteristics = characteristics;

        return searilized;
    }

    private seralizeService(service: SerializedService, accessory: { [key: string]: any }, characteristics: { [key: string]: any }[]): void {
        const type = Services[toShortForm(service.UUID)] || toShortForm(service.UUID);

        for (let i = 0; i < service.characteristics.length; i += 1) {
            const item = this.seralizeCharacteristic(accessory, service, service.characteristics[i]);

            if (item) {
                if (type === "accessory_information") {
                    const key = Accessories.decamel(item.description);

                    switch (key) {
                        case "plugin_id":
                            if (!accessory.plugin) accessory.plugin = item.value;
                            break;

                        case "device_id":
                            if (!accessory.accessory_identifier) accessory.accessory_identifier = Accessories.identifier(State.id, item.value);
                            break;

                        default:
                            if (!accessory[key]) accessory[key] = item.value;
                            break;
                    }
                } else if (ExcludeServices.indexOf(type) === -1) {
                    if (!accessory.type) accessory.type = type;
                    if (accessory.type && (Precedence[type] || Number.MAX_SAFE_INTEGER) < Precedence[accessory.type]) accessory.type = type;

                    characteristics.push(<{ [key: string]: any }>item);
                }
            }
        }

        if (Precedence[Services[type]] && Precedence[Services[type]] < Precedence[accessory.type]) accessory.type = Services[type];
    }

    private seralizeCharacteristic(accessory: { [key: string]: any }, service: SerializedService, characteristic: SerializedCharacteristic): { [key: string]: any } | undefined {
        const cuid = toShortForm(characteristic.UUID);
        const suid = toShortForm(service.UUID);

        const ctype = Characteristics[cuid] || cuid;
        const stype = Services[suid] || suid;

        if (cuid === "23") return undefined;
        if (stype === "sensor" && !accessory.main_sensor) accessory.main_sensor = ctype;
        if (stype === "sensor" && accessory.main_sensor && (Precedence[ctype] || Number.MAX_SAFE_INTEGER) < Precedence[accessory.main_sensor]) accessory.main_sensor = ctype;

        return {
            uuid: characteristic.UUID,
            type: ctype,
            service: { uuid: service.UUID, type: stype },
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
                    State.homebridge?.getAccessories.filter((item) => item.UUID === accessory.uuid).forEach((hap) => {
                        hap.services.filter((s) => s.UUID === characteristic.service.uuid).forEach((service) => {
                            const char = service.characteristics.find((key) => key.UUID === characteristic.uuid);

                            if (char) service.setCharacteristic(char.displayName, value);
                        });
                    });
                }

                return accessory;
            };

            accessory.get = (type: string): { [key: string]: any } | undefined => accessory.characteristics.find((c: { [key: string]: any }) => c.type === type);

            if (accessory.type === "camera") {
                accessory.snapshot = (): Promise<string | undefined> => new Promise((resolve) => {
                    const key = `bridge/${accessory.accessory_identifier}/snapshot`;
                    const cached = State.cache?.get<any>(key);

                    if (cached) {
                        resolve(cached);
                    } else {
                        const hap = State.homebridge?.getAccessories.filter((item) => item.UUID === accessory.uuid)[0];

                        // @ts-ignore
                        const context: any = hap instanceof PlatformAccessory ? hap._associatedHAPAccessory.controllers.camera : hap?.controllers.camera;

                        if (context && context.controller) {
                            context.controller.delegate.handleSnapshotRequest({ width: 480, height: 270 }, (_error: any, buffer: Buffer) => {
                                if (!buffer && context.controller.cachedSnapshot) {
                                    const screenshot = context.controller.cachedSnapshot.toString("base64");

                                    State.cache?.set(key, screenshot, 0.0166);

                                    resolve(screenshot);
                                } else if (buffer) {
                                    const screenshot = buffer.toString("base64");

                                    State.cache?.set(key, screenshot, 0.0166);

                                    resolve(screenshot);
                                } else {
                                    resolve(undefined);
                                }
                            });
                        }
                    }
                });

                accessory.stream = (): string | undefined => accessory.streaming_source;
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
