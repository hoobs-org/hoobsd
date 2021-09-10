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
        State.app?.get("/api/network", Security, (_request, response) => this.status(response));
        State.app?.post("/api/network/:iface/up", Security, (request, response) => this.up(request, response));
        State.app?.post("/api/network/:iface/down", Security, (request, response) => this.down(request, response));
        State.app?.get("/api/networks", Security, (_request, response) => this.networks(response));
        State.app?.post("/api/wireless/enable", Security, (_request, response) => this.state(true, response));
        State.app?.post("/api/wireless/disable", Security, (_request, response) => this.state(false, response));
        State.app?.post("/api/wireless/:iface/connect", Security, (request, response) => this.connect(request, response));
        State.app?.post("/api/wireless/:iface/disconnect", Security, (request, response) => this.disconnect(request, response));
        State.app?.post("/api/hotspot/start", Security, (request, response) => this.start(request, response));
        State.app?.post("/api/hotspot/stop", Security, (_request, response) => this.stop(response));
    }

    networkCheck() {
        if (!Network.connected && !Network.hotspot.running && Network.wireless.enabled) {
            const device = (Network.devices().filter((item: any) => item.type === "wifi")[0] || {}).iface || "wlan0";

            Network.wireless.disconnect(device);
            Network.hotspot.start("HOOBS", device);
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

    start(request: Request, response: Response) {
        if (!Network.hotspot.running && Network.wireless.enabled) {
            Network.wireless.disconnect(request.body.iface || "wlan0");
            Network.hotspot.start(request.body.ssid || "HOOBS", request.body.iface || "wlan0");
        }

        response.send();
    }

    stop(response: Response) {
        Network.hotspot.stop();

        this.networkCheck();

        response.send();
    }
}
