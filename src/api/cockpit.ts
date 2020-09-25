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

import _ from "lodash";
import Socket from "ws";
import PTY from "node-pty";
import { existsSync } from "fs-extra";
import { join } from "path";
import Paths from "../shared/paths";
import Instances from "../shared/instances";
import { Console } from "../shared/logger";

export default class Cockpit {
    declare socket: Socket;

    declare standalone: boolean;

    declare registration: string;

    declare shell: PTY.IPty | undefined;

    declare enviornment: { [key: string]: string };

    static register(): Promise<string> {
        return new Promise((resolve, reject) => {
            const handshake = new Socket("wss://cockpit.hoobs.org/handshake");

            handshake.on("open", () => {
                handshake.send("connect");

                handshake.onmessage = (results) => {
                    const args = (`${results.data || ""}`).split(" ");

                    if (args.length > 1) {
                        switch (args[0]) {
                            case "connected":
                                resolve(args[1]);
                                break;

                            default:
                                break;
                        }
                    } else {
                        reject(new Error("server error"));
                    }
                };
            });
        });
    }

    disconnect(): void {
        this.socket.close();

        if (this.shell) {
            this.shell.write("exit\r");
        }

        this.shell = undefined;

        if (this.standalone) {
            process.exit(1);
        }
    }

    start(standalone: boolean): Promise<string> {
        this.standalone = standalone;

        return new Promise((resolve, reject) => {
            Cockpit.register().then((registration) => {
                this.registration = registration;

                const instances = Instances.list();
                const paths = [];

                for (let i = 0; i < instances.length; i += 1) {
                    if (instances[i].plugins && existsSync(join(instances[i].plugins, "node_modules", ".bin"))) {
                        paths.push(join(instances[i].plugins, "node_modules", ".bin"));
                    }
                }

                this.enviornment = {
                    PATH: `${process.env.PATH}:${paths.join(":")}`,
                };

                if (existsSync("/etc/ssl/certs/cacert.pem")) {
                    this.enviornment.SSL_CERT_FILE = "/etc/ssl/certs/cacert.pem";
                }

                this.shell = PTY.spawn(process.env.SHELL || "sh", [], {
                    name: "xterm-color",
                    cwd: Paths.storagePath(),
                    env: _.create(process.env, this.enviornment),
                });

                this.socket = new Socket(`wss://cockpit.hoobs.org/${this.registration}`);

                this.socket.on("open", () => {
                    Console.info("Remote session started");

                    this.shell?.onData((data) => {
                        this.socket.send(data);
                    });

                    this.socket.onmessage = (message) => {
                        if (message.data === "{EXIT}") {
                            Console.info("Remote session stopped");

                            this.disconnect();
                        } else {
                            this.shell?.write(`${message.data}`);
                        }
                    };
                });

                resolve(((this.registration || "").match(/.{1,3}/g) || []).join("-"));
            }).catch((error) => {
                reject(error);
            });
        });
    }
}
