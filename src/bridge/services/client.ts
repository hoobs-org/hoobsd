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
import State from "../../state";
import { Services, Characteristics } from "./types";

export default class Client {
    accessories(): Promise<{ [key: string]: any }[]> {
        return new Promise((resolve) => {
            Request.get(`http://127.0.0.1:${State.homebridge?.port}/accessories`).then((response) => {
                resolve(this.process(response.data.accessories));
            }).catch(() => {
                resolve([]);
            });
        });
    }

    accessory(value: string): Promise<{ [key: string]: any } | undefined> {
        return new Promise((resolve) => {
            if (!value || value === "") {
                resolve(undefined);
            } else {
                this.accessories().then((services) => {
                    resolve(services.find((item) => item.accessory_identifier === value));
                }).catch(() => {
                    resolve(undefined);
                });
            }
        });
    }

    process(accessories: { [key: string]: any }[]): { [key: string]: any }[] {
        const services: { [key: string]: any }[] = [];

        for (let i = 0; i < accessories.length; i += 1) {
            const information: { [key: string]: any } = accessories[i].services.find((x: { [key: string]: any }) => x.type === "3E");
            const details: { [key: string]: any } = {};

            for (let j = 0; j < ((information || {}).characteristics || []).length; j += 1) {
                if (information.characteristics[j].value) {
                    details[Client.decamel(information.characteristics[j].description)] = information.characteristics[j].value;
                }
            }

            for (let j = 0; j < accessories[i].services.length; j += 1) {
                if (accessories[i].services[j].type !== "3E" && accessories[i].services[j].type !== "49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE") {
                    let service: { [key: string]: any } = services.find((item) => item._id === accessories[i].aid) || {};

                    if (!service._id) {
                        service = {
                            _id: accessories[i].aid,
                            accessory_identifier: "",
                            bridge: State.id,
                            type: Services[accessories[i].services[j].type],
                            linked: accessories[i].services[j].linked,
                            characteristics: [],
                        };

                        const keys: string[] = _.keys(details);

                        for (let k = 0; k < keys.length; k += 1) {
                            service[keys[k]] = details[keys[k]];
                        }

                        if (!service.accessory_identifier || service.accessory_identifier === "") delete service.accessory_identifier;

                        service.refresh = (): Promise<{ [key: string]: any }> => new Promise((resolve, reject) => {
                            const _ids = service.characteristics.map((characteristic: { [key: string]: any }) => characteristic._id);

                            Request.get(`http://127.0.0.1:${State.homebridge?.port}/characteristics?id=${_ids.map((_id: string) => `${service._id}.${_id}`).join(",")}`).then((response) => {
                                response.data.characteristics.forEach((characteristic: { [key: string]: any }) => {
                                    const idx = service.characteristics.findIndex((item: { [key: string]: any }) => item._id === characteristic.iid);

                                    service.characteristics[idx].value = characteristic.value;
                                });

                                resolve(service);
                            }).catch((error) => {
                                reject(error);
                            });
                        });

                        service.set = (type: string, value: any): Promise<{ [key: string]: any }> => new Promise((resolve, reject) => {
                            Request.defaults.headers.put.Authorization = State.homebridge?.settings.pin || "031-45-154";

                            const characteristic: { [key: string]: any } | undefined = service.characteristics.find((c: { [key: string]: any }) => c.type === type);

                            if (characteristic) {
                                Request.put(`http://127.0.0.1:${State.homebridge?.port}/characteristics`, {
                                    characteristics: [{ aid: service._id, iid: characteristic._id, value }],
                                }, {
                                    headers: { "'Authorization'": State.homebridge?.settings.pin || "031-45-154" },
                                }).then(() => {
                                    resolve(service);
                                }).catch((error) => {
                                    reject(error);
                                });
                            } else {
                                reject(new Error("type not found"));
                            }
                        });

                        service.get = (type: string): { [key: string]: any } | undefined => service.characteristics.find((c: { [key: string]: any }) => c.type === type);

                        services.push(service);
                    }

                    for (let k = 0; k < accessories[i].services[j].characteristics.length; k += 1) {
                        if (accessories[i].services[j].characteristics[k].type !== "23") {
                            const characteristic: { [key: string]: any } = {
                                _id: accessories[i].services[j].characteristics[k].iid,
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

                            service.characteristics.push(characteristic);
                        }
                    }
                }
            }
        }

        return services;
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
