/**************************************************************************************************
 * HOOBSD                                                                                         *
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
import Request from "axios";
import Instance from "../shared/instance";
import { Services, Characteristics } from "./types";

export default class Client {
    accessories(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const key = "hap/accessories";
            const cached = <any[]>Instance.cache?.get(key);

            if (cached) {
                resolve(this.process(cached));
            } else {
                Request.get(`http://127.0.0.1:${Instance.bridge?.port}/accessories`).then((response) => {
                    Instance.cache?.set(key, response.data.accessories, 30);
                    resolve(this.process(response.data.accessories));
                }).catch((error) => {
                    reject(error);
                });
            }
        });
    }

    accessory(aid: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.accessories().then((services) => {
                resolve(services.find((item) => item.aid === aid));
            }).catch((error) => {
                reject(error);
            });
        });
    }

    process(accessories: any[]): any[] {
        const services = [];

        for (let i = 0; i < accessories.length; i += 1) {
            const information = accessories[i].services.find((x: { [key: string]: any }) => x.type === "3E");
            const details: any = {};

            for (let j = 0; j < ((information || {}).characteristics || []).length; j += 1) {
                if (information.characteristics[j].value) {
                    details[Client.decamel(information.characteristics[j].description)] = information.characteristics[j].value;
                }
            }

            for (let j = 0; j < accessories[i].services.length; j += 1) {
                if (accessories[i].services[j].type !== "3E" && accessories[i].services[j].type !== "49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE") {
                    const service: { [key: string]: any } = {
                        aid: accessories[i].aid,
                        type: Services[accessories[i].services[j].type],
                        linked: accessories[i].services[j].linked,
                        characteristics: [],
                    };

                    const keys: string[] = _.keys(details);

                    for (let k = 0; k < keys.length; k += 1) {
                        service[keys[k]] = details[keys[k]];
                    }

                    for (let k = 0; k < accessories[i].services[j].characteristics.length; k += 1) {
                        if (accessories[i].services[j].characteristics[k].type !== "23") {
                            service.characteristics.push({
                                iid: accessories[i].services[j].characteristics[k].iid,
                                type: Characteristics[accessories[i].services[j].characteristics[k].type] || accessories[i].services[j].characteristics[k].type,
                                service_type: Services[accessories[i].services[j].type] || accessories[i].services[j].type,
                                value: accessories[i].services[j].characteristics[k].value,
                                format: accessories[i].services[j].characteristics[k].format,
                                perms: accessories[i].services[j].characteristics[k].perms,
                                unit: accessories[i].services[j].characteristics[k].unit,
                                max_value: accessories[i].services[j].characteristics[k].maxValue,
                                min_value: accessories[i].services[j].characteristics[k].minValue,
                                min_step: accessories[i].services[j].characteristics[k].minStep,
                                read: accessories[i].services[j].characteristics[k].perms.includes("pr"),
                                write: accessories[i].services[j].characteristics[k].perms.includes("pw"),
                            });
                        }
                    }

                    service.refresh = () => new Promise((resolve, reject) => {
                        Client.refresh(service).then((results) => {
                            resolve(results);
                        }).catch((error) => {
                            reject(error);
                        });
                    });

                    service.set = (iid: string, value: any) => new Promise((resolve, reject) => {
                        this.set(service, iid, value).then((results) => {
                            resolve(results);
                        }).catch((error) => {
                            reject(error);
                        });
                    });

                    service.get = (type: string) => service.characteristics.find((c: any) => c.type === type);

                    for (let k = 0; k < service.characteristics.length; k += 1) {
                        service.characteristics[k].set = (value: any) => new Promise((resolve, reject) => {
                            this.set(
                                service,
                                service.characteristics[k].iid,
                                value,
                            ).then((results) => {
                                resolve(results);
                            }).catch((error) => {
                                reject(error);
                            });
                        });

                        service.characteristics[k].get = () => new Promise((resolve, reject) => {
                            Client.get(service, service.characteristics[k].iid).then((results) => {
                                resolve(results);
                            }).catch((error) => {
                                reject(error);
                            });
                        });
                    }

                    services.push(service);
                }
            }
        }

        return services;
    }

    static refresh(service: {
        [key: string]: any
    }) {
        return new Promise((resolve, reject) => {
            const iids = service.characteristics.map((c: { [key: string]: any }) => c.iid);

            Request.get(`http://127.0.0.1:${Instance.bridge?.port}/characteristics?id=${iids.map((iid: string) => `${service.aid}.${iid}`).join(",")}`).then((response) => {
                response.data.characteristics.forEach((c: { [key: string]: any }) => {
                    const idx = service.characteristics.findIndex((x: { [key: string]: any }) => x.iid === c.iid);

                    service.characteristics[idx].value = c.value;
                });

                resolve(service);
            }).catch((error) => {
                reject(error);
            });
        });
    }

    static get(service: { [key: string]: any }, iid: string) {
        return new Promise((resolve, reject) => {
            Request.get(`http://127.0.0.1:${Instance.bridge?.port}/characteristics?id=${service.aid}.${iid}`).then((response) => {
                const idx = service.characteristics.findIndex((item: { [key: string]: any }) => item.iid === response.data.characteristics[0].iid);

                service.characteristics[idx].value = response.data.characteristics[0].value;
                resolve(service);
            }).catch((error) => {
                reject(error);
            });
        });
    }

    set(service: { [key: string]: any }, iid: string, value: any) {
        return new Promise((resolve, reject) => {
            Request.defaults.headers.put.Authorization = Instance.bridge?.settings.pin || "031-45-154";

            Request.put(`http://127.0.0.1:${Instance.bridge?.port}/characteristics`, {
                characteristics: [{
                    aid: service.aid,
                    iid,
                    value,
                }],
            }, {
                headers: {
                    "'Authorization'": Instance.bridge?.settings.pin || "031-45-154",
                },
            }).then(() => {
                this.accessory(service.aid).then((results) => {
                    resolve(results);
                }).catch((error) => {
                    reject(error);
                });
            }).catch((error) => {
                reject(error);
            });
        });
    }

    static decamel(value: string) {
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
