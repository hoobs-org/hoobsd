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
import { cloneJson } from "../../services/json";

export default class PluginsController {
    constructor() {
        State.app?.get("/api/plugins", (request, response, next) => Security(request, response, next), (request, response) => this.all(request, response));
        State.app?.get("/api/plugins/:bridge", (request, response, next) => Security(request, response, next), (request, response) => this.installed(request, response));
        State.app?.put("/api/plugins/:bridge/:name", (request, response, next) => Security(request, response, next), (request, response) => this.install(request, response));
        State.app?.put("/api/plugins/:bridge/:scope/:name", (request, response, next) => Security(request, response, next), (request, response) => this.install(request, response));
        State.app?.post("/api/plugins/:bridge/:name", (request, response, next) => Security(request, response, next), (request, response) => this.upgrade(request, response));
        State.app?.post("/api/plugins/:bridge/:scope/:name", (request, response, next) => Security(request, response, next), (request, response) => this.upgrade(request, response));
        State.app?.delete("/api/plugins/:bridge/:name", (request, response, next) => Security(request, response, next), (request, response) => this.uninstall(request, response));
        State.app?.delete("/api/plugins/:bridge/:scope/:name", (request, response, next) => Security(request, response, next), (request, response) => this.uninstall(request, response));
    }

    all(_request: Request, response: Response): void {
        const plugins: { [key: string]: any }[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            plugins.push(...this.list(State.bridges[i].id, State.bridges[i].type === "dev"));
        }

        this.schemas(plugins).then((results) => response.send(results)).catch(() => response.send([]));
    }

    installed(request: Request, response: Response): void {
        const bridge = State.bridges.find((item) => item.id === request.params.bridge);

        if (bridge) {
            this.schemas(this.list(bridge.id, bridge.type === "dev")).then((results) => response.send(results)).catch(() => response.send([]));
        } else {
            response.send([]);
        }
    }

    install(request: Request, response: Response): void {
        if (!request.user?.permissions?.plugins) {
            response.send({ token: false, error: "Unauthorized." });
        } else {
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

            Plugins.install(request.params.bridge, identifier, (tag || "")).then(() => response.send({ success: true })).catch(() => response.send({ error: "plugin can not be installed" }));
        }
    }

    upgrade(request: Request, response: Response): void {
        if (!request.user?.permissions?.plugins) {
            response.send({ token: false, error: "Unauthorized." });
        } else {
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

            Plugins.upgrade(request.params.bridge, identifier, (tag || "")).then(() => response.send({ success: true })).catch(() => response.send({ error: "plugin can not be upgraded" }));
        }
    }

    async uninstall(request: Request, response: Response): Promise<void> {
        if (!request.user?.permissions?.plugins) {
            response.send({ token: false, error: "Unauthorized." });
        } else {
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
                    const config = cloneJson(State.hub?.config);

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
            }).catch(() => response.send({ error: "plugin can not be removed" }));
        }
    }

    private list(id: string, development?: boolean): { [key:string]: any }[] {
        const results: { [key:string]: any }[] = [];
        const bridge = State.bridges.find((item) => item.id === id);
        const plugins = Plugins.installed(id, development);

        for (let i = 0; i < plugins.length; i += 1) {
            const plugin = plugins[i];
            const directory = bridge?.type === "dev" ? bridge?.project || "" : plugin.getPluginPath();
            const pjson = Plugins.loadPackage(directory) || {};
            const identifier = bridge?.type === "dev" ? pjson.name : plugin.getPluginIdentifier();

            results.push({
                identifier,
                version: (plugin.version || "").replace(/v/gi, ""),
                bridge,
                directory,
                scope: PluginManager.extractPluginScope(identifier),
                name: PluginManager.extractPluginName(identifier),
                pjson,
            });
        }

        return results;
    }

    private async schemas(plugins: { [key:string]: any }[]): Promise<{ [key:string]: any }[]> {
        const identifiers: string[] = [...new Set(plugins.map((item) => item.identifier))];
        const definitions = await Plugins.schemas(identifiers);
        const results: { [key:string]: any }[] = [];

        for (let i = 0; i < plugins.length; i += 1) {
            const record: { [key:string]: any } = definitions[plugins[i].identifier] || {};

            if (plugins[i].bridge.type === "dev") {
                record.schema = (Plugins.development(plugins[i].bridge, plugins[i].identifier) || {}).schema || {};
                record.details = [{ name: plugins[i].identifier, alias: record.schema.alias, type: record.schema.accessory ? "accessory" : "platform" }];
            } else if (!record.override_schema) {
                record.schema = (Plugins.schema(plugins[i].bridge, plugins[i].identifier) || {}).schema || {};
                record.details = await Plugins.getPluginType(plugins[i].bridge.id, plugins[i].identifier, plugins[i].directory, plugins[i].pjson);
            } else {
                record.details = await Plugins.getPluginType(plugins[i].bridge.id, plugins[i].identifier, plugins[i].directory, plugins[i].pjson);
            }

            let latest = plugins[i].version;
            let certified = false;
            let rating = 0;
            let icon = "";

            if (record.definition) {
                if ((record.definition.tags || {}).latest) {
                    latest = (record.definition.tags.latest || "").replace(/v/gi, "");
                } else if (record.definition.versions) {
                    latest = (Object.keys(record.definition.versions).pop() || "").replace(/v/gi, "");
                }

                certified = record.definition.certified;
                rating = record.definition.rating;
                icon = record.definition.icon;
            }

            results.push({
                bridge: plugins[i].bridge.id,
                identifier: plugins[i].identifier,
                scope: plugins[i].scope,
                name: plugins[i].name,
                icon,
                alias: record.schema.alias || record.schema.plugin_alias || record.schema.pluginAlias || (record.details[0] || {}).alias || plugins[i].name,
                version: plugins[i].version,
                latest,
                certified,
                rating,
                keywords: plugins[i].pjson.keywords || [],
                details: record.details,
                schema: record.schema,
                description: plugins[i].pjson.description,
            });
        }

        return results;
    }

    private async accessories(bridge: string, plugin: string): Promise<string[]> {
        const results = ((await State.ipc?.fetch(bridge, "accessories:list")) || []).filter((item: { [key: string]: any }) => item.plugin === plugin).map((item: { [key: string]: any }) => item.accessory_identifier);

        return results;
    }
}
