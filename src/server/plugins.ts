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

import { PluginManager } from "homebridge/lib/pluginManager";
import Instance from "../services/instance";
import Plugins from "../services/plugins";
import { SocketRequest, SocketResponse } from "./socket";

export default class PluginsController {
    constructor() {
        Instance.socket?.route("plugins:get", (request: SocketRequest, response: SocketResponse) => this.installed(request, response));
        Instance.socket?.route("plugins:install", (request: SocketRequest, response: SocketResponse) => this.install(request, response));
        Instance.socket?.route("plugins:upgrade", (request: SocketRequest, response: SocketResponse) => this.upgrade(request, response));
        Instance.socket?.route("plugins:uninstall", (request: SocketRequest, response: SocketResponse) => this.uninstall(request, response));
    }

    async installed(_request: SocketRequest, response: SocketResponse): Promise<void> {
        const results = [];
        const plugins = Plugins.installed();

        for (let i = 0; i < plugins.length; i += 1) {
            const plugin = plugins[i];
            const identifier = plugin.getPluginIdentifier();
            const directory = plugin.getPluginPath();
            const pjson = Plugins.loadPackage(directory) || {};
            const schema = Plugins.loadSchema(directory) || {};
            const details: any[] = (await Plugins.getPluginType(identifier, directory, pjson)) || [];

            const name = PluginManager.extractPluginName(identifier);
            const scope = PluginManager.extractPluginScope(identifier);

            results.push({
                identifier,
                scope,
                name,
                alias: schema.plugin_alias || schema.pluginAlias || details[0].alias || name,
                version: plugin.version,
                keywords: pjson.keywords || [],
                details,
                schema,
                description: pjson.description,
            });
        }

        response.send(results);
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

        Plugins.install((scope || "") !== "" ? `@${scope}/${name}` : (name || ""), (tag || "")).then(async () => {
            if (Instance.bridge) await Instance.bridge.restart();

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

        Plugins.upgrade((scope || "") !== "" ? `@${scope}/${name}` : (name || ""), (tag || "")).then(async () => {
            if (Instance.bridge) await Instance.bridge.restart();

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

        Plugins.uninstall((scope || "") !== "" ? `@${scope}/${name}` : (name || "")).then(async () => {
            if (Instance.bridge) await Instance.bridge.restart();

            response.send({
                success: true,
            });
        }).catch(() => response.send({
            error: "plugin can not be removed",
        }));
    }
}
