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

import Axios from "axios";
import { join } from "path";
import { Request, Response } from "express-serve-static-core";
import { PluginManager } from "homebridge/lib/pluginManager";
import State from "../../state";
import Config from "../../services/config";
import Security from "../../services/security";
import Plugins from "../../services/plugins";
import Client from "../../bridge/services/client";
import { Console } from "../../services/logger";
import { loadJson } from "../../services/formatters";

export default class PluginsController {
    private readonly client: Client;

    constructor() {
        this.client = new Client();

        State.app?.get("/api/plugins", Security, (request, response) => this.all(request, response));
        State.app?.get("/api/plugins/:bridge", Security, (request, response) => this.installed(request, response));
        State.app?.put("/api/plugins/:bridge/:name", Security, (request, response) => this.install(request, response));
        State.app?.put("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.install(request, response));
        State.app?.post("/api/plugins/:bridge/:name", Security, (request, response) => this.upgrade(request, response));
        State.app?.post("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.upgrade(request, response));
        State.app?.delete("/api/plugins/:bridge/:name", Security, (request, response) => this.uninstall(request, response));
        State.app?.delete("/api/plugins/:bridge/:scope/:name", Security, (request, response) => this.uninstall(request, response));
    }

    async all(_request: Request, response: Response): Promise<Response> {
        const results = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            if (State.bridges[i].type !== "hub") {
                const plugins = await this.bridge(State.bridges[i].id, (State.mode === "development" && State.bridges[i].type === "dev"));

                if (plugins) {
                    for (let j = 0; j < plugins.length; j += 1) {
                        const { ...plugin } = plugins[j];

                        plugin.bridge = State.bridges[i].id;

                        results.push(plugin);
                    }
                }
            }
        }

        return response.send(results);
    }

    async installed(request: Request, response: Response): Promise<Response> {
        return response.send(await this.bridge(request.params.bridge));
    }

    install(request: Request, response: Response): void {
        if (!request.user?.permissions.plugins) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

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

        State.cache?.remove(`plugin/definition:${(scope || "") !== "" ? `@${scope}/${name}` : (name || "")}`);
        State.cache?.remove(`plugin/schema:${(scope || "") !== "" ? `@${scope}/${name}` : (name || "")}`);

        Plugins.install(request.params.bridge, (scope || "") !== "" ? `@${scope}/${name}` : (name || ""), (tag || "")).then(async () => {
            response.send({
                success: true,
            });
        }).catch(() => response.send({
            error: "plugin can not be installed",
        }));
    }

    upgrade(request: Request, response: Response): void {
        if (!request.user?.permissions.plugins) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

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

        State.cache?.remove(`plugin/definition:${(scope || "") !== "" ? `@${scope}/${name}` : (name || "")}`);
        State.cache?.remove(`plugin/schema:${(scope || "") !== "" ? `@${scope}/${name}` : (name || "")}`);

        Plugins.upgrade(request.params.bridge, (scope || "") !== "" ? `@${scope}/${name}` : (name || ""), (tag || "")).then(async () => {
            response.send({
                success: true,
            });
        }).catch(() => response.send({
            error: "plugin can not be upgraded",
        }));
    }

    async uninstall(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions.plugins) {
            response.send({
                token: false,
                error: "Unauthorized.",
            });

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

        const plugin = (scope || "") !== "" ? `@${scope}/${name}` : (name || "");

        const accessories = await this.accessories(request.params.bridge, plugin);

        State.cache?.remove(`plugin/definition:${plugin}`);
        State.cache?.remove(`plugin/schema:${plugin}`);

        Plugins.uninstall(request.params.bridge, plugin).then(() => {
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

            response.send({
                success: true,
                accessories,
            });
        }).catch(() => response.send({
            error: "plugin can not be removed",
        }));
    }

    private async bridge(id: string, development?: boolean): Promise<{ [key:string]: any }[]> {
        const results = [];
        const bridge = State.bridges.find((item) => item.id === id);
        const plugins = Plugins.installed(id, development);

        for (let i = 0; i < plugins.length; i += 1) {
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
            let details: any[];

            if (bridge?.type === "dev") {
                const raw: { [key: string]: any } = loadJson(join(bridge?.project || "", "config.schema.json"), {});

                schema = {
                    name: pjson.name,
                    alias: pjson.name,
                    accessory: false,
                    config: {
                        type: "object",
                        properties: {},
                    },
                };

                if (raw) {
                    schema = {
                        name: pjson.name,
                        alias: raw.alias || raw.pluginAlias || pjson.name,
                        accessory: raw.pluginType === "accessory",
                        config: {
                            type: "object",
                            properties: (raw.schema || raw.config).properties || {},
                        },
                    };
                }

                details = [{
                    name: pjson.name,
                    alias: schema.alias,
                    type: schema.accessory ? "accessory" : "platform",
                }];
            } else {
                definition = await this.pluginDefinition(identifier);
                schema = await this.pluginSchema(identifier);
                details = (await Plugins.getPluginType(id, identifier, directory, pjson)) || [];
            }

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
                alias: schema?.alias || schema?.plugin_alias || schema?.pluginAlias || details[0].alias || name,
                version: (plugin.version || "").replace(/v/gi, ""),
                latest,
                certified,
                rating,
                keywords: pjson.keywords || [],
                details,
                schema,
                description: pjson.description,
            });
        }

        return results;
    }

    private async pluginDefinition(identifier: string): Promise<{ [key: string]: any } | undefined> {
        const key = `plugin/definition:${identifier}`;
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        try {
            const definition = ((await Axios.get(`https://plugins.hoobs.org/api/plugin/${identifier}`)).data || {}).results;

            State.cache?.set(key, definition, 60);

            return definition;
        } catch (_error) {
            Console.warn("plugin site unavailable");
        }

        return undefined;
    }

    private async pluginSchema(identifier: string): Promise<{ [key: string]: any }> {
        const key = `plugin/schema:${identifier}`;
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        try {
            const schema = ((await Axios.get(`https://plugins.hoobs.org/api/schema/${identifier}`)).data || {}).results || {};

            State.cache?.set(key, schema, 60);

            return schema;
        } catch (_error) {
            Console.warn("plugin site unavailable");
        }

        return {};
    }

    private accessories(bridge: string, plugin: string): Promise<string[]> {
        return new Promise((resolve) => {
            this.client.accessories(bridge).then((services: { [key: string]: any }[]) => {
                if (!services) {
                    resolve([]);

                    return;
                }

                if (!Array.isArray(services)) services = [services];

                services = [...services];
                services = services.filter((item) => item.plugin === plugin);

                resolve(services.map((item) => item.accessory_identifier));
            });
        });
    }
}
