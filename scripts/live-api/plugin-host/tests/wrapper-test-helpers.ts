// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const wrapperCode = readFileSync(
  join(
    import.meta.dirname,
    "../../../../max-for-live-device/plugin-host/wrapper.js",
  ),
  "utf8",
);

export interface Rig {
  run: (code: string) => unknown;
  writes: string[];
  mirror: { state: string };
  stored: { state: string | null };
  failWrites: { on: boolean };
  cancelled: () => number;
  /** Messages sent to the slot prepends, as [box, ...args] */
  prepends: unknown[][];
  /** The slot dials' values, by box name */
  dials: Record<string, number>;
  /** Messages sent to the slot dials and the panel's knobs, as [box, ...args] */
  sent: unknown[][];
  /** The Live device's name, as `this_device` reports it (null: unreadable) */
  device: { name: string | null };
  /** The panel's name row: its text and hidden flag */
  nameRow: { text: string | null; hidden: number | null };
  /** LiveAPI objects made with a callback, to observe a property */
  observers: { callback: unknown; path: unknown; api: { property: unknown } }[];
}

/**
 * Runs wrapper.js against stand-ins for the Max objects it talks to.
 * @param plugin - The loaded plug-in's name, or null for none
 * @param outlet - What the wrapper's `outlet()` calls do
 * @returns A rig to run code in the wrapper's scope and inspect what it did
 */
export function loadWrapper(
  plugin: string | null = "Plug",
  outlet: (...args: unknown[]) => void = () => {},
): Rig {
  const writes: string[] = [];
  const mirror = { state: '{"snapshot":{"a":1}}' };
  const stored: { state: string | null } = { state: null };
  const failWrites = { on: false };
  const prepends: unknown[][] = [];
  const dials: Record<string, number> = {};
  const sent: unknown[][] = [];
  const device: { name: string | null } = { name: "Plug" };
  const nameRow: Rig["nameRow"] = { text: null, hidden: null };
  const recorder = (name: string) => ({
    message: (...args: unknown[]) => sent.push([name, ...args]),
  });
  const observers: Rig["observers"] = [];
  let cancels = 0;
  let lastParsed = "";

  class Task {
    interval = 0;
    constructor(readonly fn?: () => void) {}

    schedule(): void {}
    repeat(): void {}
    cancel(): void {
      cancels++;
    }
  }
  class Dict {
    name = "dict";
    parse(json: string): void {
      lastParsed = json;
    }

    stringify(): string {
      return lastParsed;
    }
  }
  const objects: Record<string, unknown> = {
    pluginname: {
      message: (_set: string, text: string) => {
        nameRow.text = text;
      },
      set hidden(value: number) {
        nameRow.hidden = value;
      },
    },
    vststate: {
      getvalueof: () =>
        stored.state == null ? 0 : { stringify: () => stored.state },
      message: () => {
        if (failWrites.on) {
          throw new Error("boom");
        }

        stored.state = lastParsed;
        writes.push(lastParsed);
      },
    },
    vst: {
      getattr: () => plugin,
      getvalueof: () => ({ stringify: () => mirror.state }),
    },
  };
  const context = vm.createContext({
    Task,
    Dict,
    MaxobjListener: class {},
    LiveAPI: class {
      id = "1";
      property: unknown;
      constructor(callback?: unknown, path?: unknown) {
        if (typeof callback === "function") {
          observers.push({ callback, path, api: this });
        }
      }

      getcount = () => 0;
      get = () => {
        if (device.name == null) {
          throw new Error("not ready");
        }

        return [device.name];
      };
    },
    post: () => {},
    outlet,
    patcher: {
      getnamed: (name: string) =>
        objects[name] ??
        (name.startsWith("slotprep")
          ? { message: (...args: unknown[]) => prepends.push([name, ...args]) }
          : name.startsWith("slotdial")
            ? { ...recorder(name), getvalueof: () => dials[name] ?? 0 }
            : name.startsWith("knob")
              ? recorder(name)
              : undefined),
      newdefault: () => ({ message: () => {} }),
      remove: () => {},
    },
  });

  vm.runInContext(wrapperCode, context);

  return {
    run: (code) => vm.runInContext(code, context),
    writes,
    mirror,
    stored,
    failWrites,
    cancelled: () => cancels,
    prepends,
    dials,
    sent,
    device,
    nameRow,
    observers,
  };
}
