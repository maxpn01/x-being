import { EventEmitter } from "events";

export const bus = new EventEmitter();
export const emit = (topic, payload) => bus.emit(topic, payload);
export const on = (topic, fn) => bus.on(topic, fn);
