/**************************************************************************************************
 * hoobsd                                                                                         *
 * Copyright (C) 2021 HOOBS                                                                       *
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

import Network from "@hoobs/network";
import { Request, Response } from "express-serve-static-core";
import State from "../../state";
import System from "../../services/system";
import Security from "../../services/security";

export default class NetworkController {
    constructor() {
        State.app?.get("/api/network", (request, response, next) => Security(request, response, next), (_request, response) => this.status(response));
        State.app?.post("/api/network/:iface/up", (request, response, next) => Security(request, response, next), (request, response) => this.up(request, response));
        State.app?.post("/api/network/:iface/down", (request, response, next) => Security(request, response, next), (request, response) => this.down(request, response));
        State.app?.get("/api/networks", (request, response, next) => Security(request, response, next), (_request, response) => this.networks(response));
        State.app?.post("/api/wireless/enable", (request, response, next) => Security(request, response, next), (_request, response) => this.state(true, response));
        State.app?.post("/api/wireless/disable", (request, response, next) => Security(request, response, next), (_request, response) => this.state(false, response));
        State.app?.post("/api/wireless/:iface/connect", (request, response, next) => Security(request, response, next), (request, response) => this.connect(request, response));
        State.app?.post("/api/wireless/:iface/disconnect", (request, response, next) => Security(request, response, next), (request, response) => this.disconnect(request, response));
    }

    networkCheck() {
        if (!Network.connected && !Network.hotspot.running && Network.wireless.enabled) {
            System.reboot();
        } else {
            System.shell("systemctl restart avahi-daemon");

            State.cache?.remove("system/info");
        }
    }

    status(response: Response) {
        response.send({
            connected: Network.connected,
            connections: Network.current(),
            wireless: Network.wireless.enabled,
            hotspot: Network.hotspot.status,
            devices: Network.devices(),
        });
    }

    up(request: Request, response: Response) {
        Network.ethernet.up(request.params.iface);

        this.networkCheck();

        response.send();
    }

    down(request: Request, response: Response) {
        Network.ethernet.down(request.params.iface);

        this.networkCheck();

        response.send();
    }

    networks(response: Response) {
        if (Network.wireless.enabled) {
            response.send(Network.wireless.scan(undefined));
        } else {
            response.send([]);
        }
    }

    state(enabled: boolean, response: Response) {
        Network.wireless.enabled = enabled;

        this.networkCheck();

        response.send();
    }

    connect(request: Request, response: Response) {
        if (Network.wireless.enabled) {
            Network.wireless.connect(request.body.ssid, request.body.password, request.params.iface);

            if (Network.wireless.current().find((connection) => connection.ssid === request.body.ssid)) {
                if (Network.hotspot.running) {
                    Network.hotspot.stop();

                    System.shell(`nmcli device reapply '${(request.params.iface || "").replace(/'/gi, "'\"'\"'")}'`);
                }

                System.shell("systemctl restart avahi-daemon");

                State.cache?.remove("system/info");
            }
        }

        this.networkCheck();

        response.send();
    }

    disconnect(request: Request, response: Response) {
        if (Network.wireless.enabled) {
            Network.wireless.disconnect(request.params.iface);
            Network.wireless.forget(request.body.ssid);
        }

        this.networkCheck();

        response.send();
    }
}
