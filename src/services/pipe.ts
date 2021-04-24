/* eslint-disable no-underscore-dangle */

import { Writable } from "stream";

export default class Pipe extends Writable {
    declare callback: any;

    constructor(callback: (chunk: any) => void) {
        super();

        this.callback = callback;
    }

    _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error) => void) {
        this.callback(chunk);

        callback();
    }
}
