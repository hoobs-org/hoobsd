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

import { Request, Response } from "express-serve-static-core";
import { PluginManager } from "homebridge/lib/pluginManager";
import State from "../../state";
import Config from "../../services/config";
import Security from "../../services/security";
import Plugins from "../../services/plugins";

export default class PluginsController {
    constructor() {
        State.app?.get("/api/plugins", Security, (request, response) => this.all(request, response));
        State.app?.get("/api/plugins/:bridge", Security, (request, response) => this.installed(request, response));
        State.app?.put("/api/plugins/:bridge/:name", Security, (request, response) => this.install(request, response));
        State.app?.put("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.install(request, response));
        State.app?.post("/api/plugins/:bridge/:name", Security, (request, response) => this.upgrade(request, response));
        State.app?.post("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.upgrade(request, response));
        State.app?.delete("/api/plugins/:bridge/:name", Security, (request, response) => this.uninstall(request, response));
        State.app?.delete("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.uninstall(request, response));
    }

    all(_request: Request, response: Response): void {
        const results:{ [key: string]: any }[] = [];
        const waits: Promise<void>[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type !== "hub") {
                waits.push(new Promise((resolve) => {
                    this.bridge(State.bridges[i].id, (State.mode === "development" && State.bridges[i].type === "dev")).then((plugins) => {
                        if (plugins) {
                            for (let j = 0; j < plugins.length; j += 1) {
                                plugins[j].bridge = State.bridges[i].id;

                                results.push(plugins[j]);
                                resolve();
                            }
                        }
                    });
                }));
            }
        }

        Promise.allSettled(waits).then(() => {
            response.send(results);
        });
    }

    installed(request: Request, response: Response): void {
        this.bridge(request.params.bridge).then((installed) => {
            response.send(installed);
        });
    }

    install(request: Request, response: Response): void {
        if (!request.user?.permissions?.plugins) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        let name: string | undefined = request.params?.scope ? `${request.params.scope}/${request.params.name}` : request.params?.name;
        let scope: string | undefined = "";

        if ((name || "").startsWith("@")) {
            name = (name || "").substring(1);
            scope = name.split("/").shift();
            name = name.split("/").pop();
        }

        let tag: string | undefined = "latest";

        if ((name || "").indexOf("@") >= 0) {
            tag = (name || "").split("@").pop();
            name = (name || "").split("@").shift();
        }

        const identifier = (scope || "") !== "" ? `@${scope}/${name}` : (name || "");

        State.cache?.remove(`plugin/definition:${identifier}`);
        State.cache?.remove(`plugin/schema:${identifier}`);

        Plugins.install(request.params.bridge, identifier, (tag || "")).then(() => {
            response.send({ success: true });
        }).catch(() => {
            response.send({ error: "plugin can not be installed" });
        });
    }

    upgrade(request: Request, response: Response): void {
        if (!request.user?.permissions?.plugins) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        let name: string | undefined = request.params?.scope ? `${request.params.scope}/${request.params.name}` : request.params?.name;
        let scope: string | undefined = "";

        if ((name || "").startsWith("@")) {
            name = (name || "").substring(1);
            scope = name.split("/").shift();
            name = name.split("/").pop();
        }

        let tag: string | undefined = "latest";

        if ((name || "").indexOf("@") >= 0) {
            tag = (name || "").split("@").pop();
            name = (name || "").split("@").shift();
        }

        const identifier = (scope || "") !== "" ? `@${scope}/${name}` : (name || "");

        State.cache?.remove(`plugin/definition:${identifier}`);
        State.cache?.remove(`plugin/schema:${identifier}`);

        Plugins.upgrade(request.params.bridge, identifier, (tag || "")).then(async () => {
            response.send({ success: true });
        }).catch(() => {
            response.send({ error: "plugin can not be upgraded" });
        });
    }

    async uninstall(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions?.plugins) {
            response.send({ token: false, error: "Unauthorized." });

            return;
        }

        let name: string | undefined = request.params?.scope ? `${request.params.scope}/${request.params.name}` : request.params?.name;
        let scope: string | undefined = "";

        if ((name || "").startsWith("@")) {
            name = (name || "").substring(1);
            scope = name.split("/").shift();
            name = name.split("/").pop();
        }

        if ((name || "").indexOf("@") >= 0) name = (name || "").split("@").shift();

        const identifier = (scope || "") !== "" ? `@${scope}/${name}` : (name || "");
        const accessories = await this.accessories(request.params.bridge, identifier);

        State.cache?.remove(`plugin/definition:${identifier}`);
        State.cache?.remove(`plugin/schema:${identifier}`);

        Plugins.uninstall(request.params.bridge, identifier).then(() => {
            if (State.hub?.config.dashboard && State.hub?.config.dashboard.items) {
                const { ...config } = State.hub?.config;

                for (let i = 0; i < accessories.length; i += 1) {
                    let index = config.dashboard.items.findIndex((item: { [key: string]: any }) => item.component === "accessory-widget" && item.id === accessories[i]);

                    while (index >= 0) {
                        config.dashboard.items.splice(index, 1);

                        index = config.dashboard.items.findIndex((item: { [key: string]: any }) => item.component === "accessory-widget" && item.id === accessories[i]);
                    }
                }

                Config.saveConfig(config);
            }

            response.send({ success: true, accessories });
        }).catch(() => {
            response.send({ error: "plugin can not be removed" });
        });
    }

    private async bridge(id: string, development?: boolean): Promise<{ [key:string]: any }[]> {
        const results: { [key:string]: any }[] = [];
        const bridge = State.bridges.find((item) => item.id === id);
        const plugins = Plugins.installed(id, development);
        const waits: Promise<void>[] = [];

        for (let i = 0; i < plugins.length; i += 1) {
            waits.push(new Promise((resolve) => {
                const plugin = plugins[i];
                const directory = bridge?.type === "dev" ? bridge?.project || "" : plugin.getPluginPath();
                const pjson = Plugins.loadPackage(directory) || {};
                const identifier = bridge?.type === "dev" ? pjson.name : plugin.getPluginIdentifier();

                const name = PluginManager.extractPluginName(identifier);
                const scope = PluginManager.extractPluginScope(identifier);

                let latest = (plugin.version || "").replace(/v/gi, "");
                let certified = false;
                let rating = 0;
                let icon = "";

                let definition: { [key: string]: any } | undefined;
                let schema: { [key: string]: any } | undefined;
                let details: any[] = [];

                const intermediate: Promise<void>[] = [];

                if (bridge?.type === "dev") {
                    intermediate.push(new Promise((complete) => {
                        Plugins.pluginSchema(bridge, identifier, {}).then((response) => {
                            schema = response;
                            details = [{ name: identifier, alias: schema.alias, type: schema.accessory ? "accessory" : "platform" }];
                        }).finally(() => complete());
                    }));
                } else {
                    intermediate.push(new Promise((complete) => Plugins.pluginDefinition(identifier).then((response) => { definition = response; }).finally(() => complete())));
                    intermediate.push(new Promise((complete) => Plugins.pluginSchema(bridge, identifier, definition || {}).then((response) => { schema = response; }).finally(() => complete())));
                    intermediate.push(new Promise((complete) => Plugins.getPluginType(id, identifier, directory, pjson).then((response) => { details = response || []; }).finally(() => complete())));
                }

                Promise.allSettled(intermediate).then(() => {
                    if (definition) {
                        if ((definition.tags || {}).latest) {
                            latest = (definition.tags.latest || "").replace(/v/gi, "");
                        } else if (definition.versions) {
                            latest = (Object.keys(definition.versions).pop() || "").replace(/v/gi, "");
                        }

                        certified = definition.certified;
                        rating = definition.rating;
                        icon = definition.icon;
                    }

                    results.push({
                        identifier,
                        scope,
                        name,
                        icon,
                        alias: schema?.alias || schema?.plugin_alias || schema?.pluginAlias || (details[0] || {}).alias || name,
                        version: (plugin.version || "").replace(/v/gi, ""),
                        latest,
                        certified,
                        rating,
                        keywords: pjson.keywords || [],
                        details,
                        schema,
                        description: pjson.description,
                    });

                    resolve();
                });
            }));
        }

        await Promise.allSettled(waits);

        return results;
    }

    private async accessories(bridge: string, plugin: string): Promise<string[]> {
        const results = (await State.ipc?.fetch(bridge, "accessories:list")).filter((item: { [key: string]: any }) => item.plugin === plugin).map((item: { [key: string]: any }) => item.accessory_identifier);

        return results;
    }
}
