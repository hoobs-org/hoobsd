/**************************************************************************************************
 * hoobsd                                                                                         *
 * Copyright (C) 2020 HOOBS                                                                       *
 * Copyright (C) 2019 Oznu                                                                        *
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
import Request from "axios";
import { createHash } from "crypto";
import State from "../../state";
import { Services, Characteristics, Precedence } from "./types";

export default class Client {
    accessories(bridge: string, reload?: boolean): Promise<{ [key: string]: any }[]> {
        return new Promise((resolve) => {
            this.load(bridge, reload).then((results) => {
                this.updateAll(results);
                resolve(results);
            });
        });
    }

    accessory(bridge: string, value: string, reload?: boolean): Promise<{ [key: string]: any } | undefined> {
        return new Promise((resolve) => {
            if (!value || value === "") {
                resolve(undefined);

                return;
            }

            this.load(bridge, reload).then((results) => {
                const result = results.find((item) => item.accessory_identifier === value);

                this.updateOne(result);
                resolve(result);
            });
        });
    }

    private async cache(accessory: { [key: string]: any }): Promise<void> {
        const key = `bridge/${accessory.bridge}/accessories`;
        const accessories = await this.load(accessory.bridge);
        const index = accessories.findIndex((item) => item.accessory_identifier === accessory.accessory_identifier);

        if (index >= 0) {
            accessories[index] = accessory;
        }

        State.cache?.set(key, accessories, 30);
    }

    private load(bridge: string, reload?: boolean): Promise<{ [key: string]: any }[]> {
        return new Promise((resolve) => {
            const key = `bridge/${bridge}/accessories`;
            const data = State.bridges.find((item) => item.id === bridge);

            if (!data) {
                resolve([]);

                return;
            }

            if (!reload) {
                const cached = State.cache?.get<{ [key: string]: any }[]>(key);

                if (cached && Array.isArray(cached) && cached.length > 0) {
                    resolve(cached);

                    return;
                }
            }

            Request.get(`http://127.0.0.1:${data.port}/accessories`).then((response) => {
                const accessories = this.process(bridge, response.data.accessories);

                if (response.data.accessories) State.cache?.set(key, accessories, 30);

                resolve(accessories);
            }).catch(() => {
                resolve([]);
            });
        });
    }

    private process(bridge: string, accessories: { [key: string]: any }[]): { [key: string]: any }[] {
        const services: { [key: string]: any }[] = [];

        for (let i = 0; i < accessories.length; i += 1) {
            const information: { [key: string]: any } = accessories[i].services.find((x: { [key: string]: any }) => x.type === "3E");
            const details: { [key: string]: any } = {};

            if (information && Array.isArray(information.characteristics)) {
                for (let j = 0; j < information.characteristics.length; j += 1) {
                    if (information.characteristics[j].value) {
                        details[Client.decamel(information.characteristics[j].description)] = information.characteristics[j].value;
                    }
                }
            }

            for (let j = 0; j < accessories[i].services.length; j += 1) {
                if (accessories[i].services[j].type !== "3E" && accessories[i].services[j].type !== "49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE") {
                    let service: { [key: string]: any } = services.find((item) => item.id === accessories[i].aid) || {};

                    if (!service.id) {
                        service = {
                            id: accessories[i].aid,
                            accessory_identifier: "",
                            bridge_identifier: Client.identifier(bridge),
                            bridge,
                            plugin: "",
                            room: "default",
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

                        const data: string[] = (service.accessory_identifier || "").split("|");
                        const uuid = data.pop();
                        const plugin = data[0];

                        service.accessory_identifier = Client.identifier(bridge, uuid);
                        service.plugin = plugin;

                        if (service.accessory_identifier === service.bridge_identifier) {
                            delete service.bridge_identifier;
                            delete service.sequence;
                            delete service.room;

                            service.type = "bridge";
                            service.hidden = true;
                        }

                        services.push(service);
                    }

                    if (Precedence[Services[accessories[i].services[j].type]] && Precedence[Services[accessories[i].services[j].type]] < Precedence[service.type]) service.type = Services[accessories[i].services[j].type];

                    for (let k = 0; k < accessories[i].services[j].characteristics.length; k += 1) {
                        if (accessories[i].services[j].characteristics[k].type !== "23") {
                            const characteristic: { [key: string]: any } = {
                                id: accessories[i].services[j].characteristics[k].iid,
                                type: Characteristics[accessories[i].services[j].characteristics[k].type] || accessories[i].services[j].characteristics[k].type,
                                service_type: Services[accessories[i].services[j].type] || accessories[i].services[j].type,
                                value: accessories[i].services[j].characteristics[k].value,
                                format: accessories[i].services[j].characteristics[k].format,
                                unit: accessories[i].services[j].characteristics[k].unit,
                                max_value: accessories[i].services[j].characteristics[k].maxValue,
                                min_value: accessories[i].services[j].characteristics[k].minValue,
                                min_step: accessories[i].services[j].characteristics[k].minStep,
                                read: accessories[i].services[j].characteristics[k].perms.includes("pr"),
                                write: accessories[i].services[j].characteristics[k].perms.includes("pw"),
                            };

                            if (characteristic.service_type === "sensor" && (!service.main_sensor || Precedence[characteristic.type] < Precedence[service.main_sensor])) service.main_sensor = characteristic.type;

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
            if (accessories[i].type !== "bridge") {
                accessories[i].refresh = (): Promise<{ [key: string]: any }> => new Promise((resolve, reject) => {
                    const identifiers = accessories[i].characteristics.map((characteristic: { [key: string]: any }) => characteristic.id);

                    Request.get(`http://127.0.0.1:${State.homebridge?.port}/characteristics?id=${identifiers.map((id: string) => `${accessories[i].id}.${id}`).join(",")}`).then((response) => {
                        response.data.characteristics.forEach((characteristic: { [key: string]: any }) => {
                            const index = accessories[i].characteristics.findIndex((item: { [key: string]: any }) => item.id === characteristic.iid);

                            accessories[i].characteristics[index].value = characteristic.value;
                        });

                        this.cache(accessories[i]).finally(() => {
                            resolve(accessories[i]);
                        });
                    }).catch((error) => {
                        reject(error);
                    });
                });

                accessories[i].set = (type: string, value: any): Promise<{ [key: string]: any }> => new Promise((resolve, reject) => {
                    Request.defaults.headers.put.Authorization = State.homebridge?.settings.pin || "031-45-154";

                    const characteristic: { [key: string]: any } | undefined = accessories[i].characteristics.find((c: { [key: string]: any }) => c.type === type);

                    if (typeof value === "boolean") value = value ? 1 : 0;

                    if (characteristic) {
                        Request.put(`http://127.0.0.1:${State.homebridge?.port}/characteristics`, {
                            characteristics: [{ aid: accessories[i].id, iid: characteristic.id, value }],
                        }, {
                            headers: { "'Authorization'": State.homebridge?.settings.pin || "031-45-154" },
                        }).then(() => {
                            resolve(accessories[i]);
                        }).catch((error) => {
                            reject(error);
                        });
                    } else {
                        reject(new Error("type not found"));
                    }
                });

                accessories[i].get = (type: string): { [key: string]: any } | undefined => accessories[i].characteristics.find((c: { [key: string]: any }) => c.type === type);
            }
        }
    }

    private updateOne(accessory: { [key: string]: any } | undefined): void {
        if (!accessory) return;

        if (accessory.type !== "bridge") {
            accessory.refresh = (): Promise<{ [key: string]: any }> => new Promise((resolve, reject) => {
                const identifiers = accessory.characteristics.map((characteristic: { [key: string]: any }) => characteristic.id);

                Request.get(`http://127.0.0.1:${State.homebridge?.port}/characteristics?id=${identifiers.map((id: string) => `${accessory.id}.${id}`).join(",")}`).then((response) => {
                    response.data.characteristics.forEach((characteristic: { [key: string]: any }) => {
                        const index = accessory.characteristics.findIndex((item: { [key: string]: any }) => item.id === characteristic.iid);

                        accessory.characteristics[index].value = characteristic.value;
                    });

                    this.cache(accessory).finally(() => {
                        resolve(accessory);
                    });
                }).catch((error) => {
                    reject(error);
                });
            });

            accessory.set = (type: string, value: any): Promise<{ [key: string]: any }> => new Promise((resolve, reject) => {
                Request.defaults.headers.put.Authorization = State.homebridge?.settings.pin || "031-45-154";

                const characteristic: { [key: string]: any } | undefined = accessory.characteristics.find((c: { [key: string]: any }) => c.type === type);

                if (typeof value === "boolean") value = value ? 1 : 0;

                if (characteristic) {
                    Request.put(`http://127.0.0.1:${State.homebridge?.port}/characteristics`, {
                        characteristics: [{ aid: accessory.id, iid: characteristic.id, value }],
                    }, {
                        headers: { "'Authorization'": State.homebridge?.settings.pin || "031-45-154" },
                    }).then(() => {
                        resolve(accessory);
                    }).catch((error) => {
                        reject(error);
                    });
                } else {
                    reject(new Error("type not found"));
                }
            });

            accessory.get = (type: string): { [key: string]: any } | undefined => accessory.characteristics.find((c: { [key: string]: any }) => c.type === type);
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
