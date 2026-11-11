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
  let cancels = 0;
  let lastParsed = "";

  class Task {
    interval = 0;
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
      getcount = () => 0;
      get = () => 0;
    },
    post: () => {},
    outlet,
    patcher: {
      getnamed: (name: string) =>
        objects[name] ??
        (name.startsWith("slotprep")
          ? { message: (...args: unknown[]) => prepends.push([name, ...args]) }
          : name.startsWith("slotdial")
            ? { getvalueof: () => dials[name] ?? 0 }
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
  };
}
