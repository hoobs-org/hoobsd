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

import Request from "axios";
import { PluginManager } from "homebridge/lib/pluginManager";
import State from "../../state";
import Plugins from "../../services/plugins";
import { Console } from "../../services/logger";
import { SocketRequest, SocketResponse } from "../services/socket";

export default class PluginsController {
    constructor() {
        State.socket?.route("plugins:get", (request: SocketRequest, response: SocketResponse) => this.installed(request, response));
        State.socket?.route("plugins:install", (request: SocketRequest, response: SocketResponse) => this.install(request, response));
        State.socket?.route("plugins:upgrade", (request: SocketRequest, response: SocketResponse) => this.upgrade(request, response));
        State.socket?.route("plugins:uninstall", (request: SocketRequest, response: SocketResponse) => this.uninstall(request, response));
    }

    async installed(_request: SocketRequest, response: SocketResponse): Promise<void> {
        const results = [];
        const plugins = Plugins.installed();

        for (let i = 0; i < plugins.length; i += 1) {
            const plugin = plugins[i];
            const identifier = plugin.getPluginIdentifier();
            const directory = plugin.getPluginPath();
            const pjson = Plugins.loadPackage(directory) || {};
            const details: any[] = (await Plugins.getPluginType(identifier, directory, pjson)) || [];

            const name = PluginManager.extractPluginName(identifier);
            const scope = PluginManager.extractPluginScope(identifier);

            let latest = (plugin.version || "").replace(/v/gi, "");
            let certified = false;
            let rating = 0;
            let icon = "";

            const definition = await this.pluginDefinition(identifier);
            const schema = await this.pluginSchema(identifier);

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
                alias: schema.alias || schema.plugin_alias || schema.pluginAlias || details[0].alias || name,
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

        response.send(results);
    }

    private async pluginDefinition(identifier: string): Promise<{ [key: string]: any } | undefined> {
        const key = `plugin/definition:${identifier}`;
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        try {
            const definition = ((await Request.get(`https://plugins.hoobs.org/api/plugin/${identifier}`)).data || {}).results;

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
            const schema = ((await Request.get(`https://plugins.hoobs.org/api/schema/${identifier}`)).data || {}).results || {};

            State.cache?.set(key, schema, 60);

            return schema;
        } catch (_error) {
            Console.warn("plugin site unavailable");
        }

        return {};
    }

    install(request: SocketRequest, response: SocketResponse): void {
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

        Plugins.install((scope || "") !== "" ? `@${scope}/${name}` : (name || ""), (tag || "")).then(async () => {
            response.send({
                success: true,
            });
        }).catch(() => response.send({
            error: "plugin can not be installed",
        }));
    }

    upgrade(request: SocketRequest, response: SocketResponse): void {
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

        Plugins.upgrade((scope || "") !== "" ? `@${scope}/${name}` : (name || ""), (tag || "")).then(async () => {
            response.send({
                success: true,
            });
        }).catch(() => response.send({
            error: "plugin can not be upgraded",
        }));
    }

    uninstall(request: SocketRequest, response: SocketResponse): void {
        let name: string | undefined = request.params?.scope ? `${request.params.scope}/${request.params.name}` : request.params?.name;
        let scope: string | undefined = "";

        if ((name || "").startsWith("@")) {
            name = (name || "").substring(1);
            scope = name.split("/").shift();
            name = name.split("/").pop();
        }

        if ((name || "").indexOf("@") >= 0) name = (name || "").split("@").shift();

        State.cache?.remove(`plugin/definition:${(scope || "") !== "" ? `@${scope}/${name}` : (name || "")}`);
        State.cache?.remove(`plugin/schema:${(scope || "") !== "" ? `@${scope}/${name}` : (name || "")}`);

        Plugins.uninstall((scope || "") !== "" ? `@${scope}/${name}` : (name || "")).then(async () => {
            response.send({
                success: true,
            });
        }).catch(() => response.send({
            error: "plugin can not be removed",
        }));
    }
}
