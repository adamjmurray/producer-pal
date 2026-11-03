// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

const wrapperCode = readFileSync(
  join(
    import.meta.dirname,
    "../../../max-for-live-device/plugin-host/wrapper.js",
  ),
  "utf8",
);

interface Rig {
  run: (code: string) => unknown;
  writes: string[];
  mirror: { state: string };
  stored: { state: string | null };
  failWrites: { on: boolean };
  cancelled: () => number;
}

// Runs wrapper.js against stand-ins for the Max objects it talks to.
function loadWrapper(plugin: string | null = "Plug"): Rig {
  const writes: string[] = [];
  const mirror = { state: '{"snapshot":{"a":1}}' };
  const stored: { state: string | null } = { state: null };
  const failWrites = { on: false };
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
    vstmirror: {
      getvalueof: () => ({ stringify: () => mirror.state }),
      message: () => {},
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
    vst: { getattr: () => plugin },
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
    outlet: () => {},
    patcher: { getnamed: (name: string) => objects[name] },
  });

  vm.runInContext(wrapperCode, context);

  return {
    run: (code) => vm.runInContext(code, context),
    writes,
    mirror,
    stored,
    failWrites,
    cancelled: () => cancels,
  };
}

describe("wrapper saveState clears the pending edit", () => {
  let rig: Rig;

  beforeEach(() => {
    rig = loadWrapper();
    rig.run("lastSaved = null; restoredAt = 0; savedAt = 0; slotWriteAt = 0;");
    rig.stored.state = rig.mirror.state;
    rig.run("lastSaved = storedState();");
  });

  const pendingEdit = (): unknown => rig.run("markEdited(); edited");
  const edited = (): unknown => rig.run("edited");

  it("clears it after a write", () => {
    rig.mirror.state = '{"snapshot":{"a":2}}';
    pendingEdit();

    expect(rig.run('saveState("edit")')).toBeNull();
    expect(rig.writes).toStrictEqual(['{"snapshot":{"a":2}}']);
    expect(edited()).toBe(false);
  });

  it("clears it when an edit left the state unchanged", () => {
    expect(pendingEdit()).toBe(true);

    expect(rig.run('saveState("edit")')).toBeNull();
    expect(rig.writes).toStrictEqual([]);
    expect(edited()).toBe(false);
  });

  it("clears it when the edit lands in the restore settle window", () => {
    rig.mirror.state = '{"snapshot":{"a":2}}';
    rig.run("restoredAt = Date.now();");
    pendingEdit();

    expect(rig.run('saveState("edit")')).toBeNull();
    expect(rig.writes).toStrictEqual([]);
    expect(edited()).toBe(false);
  });

  it("clears it when Live already stores the current state", () => {
    rig.mirror.state = '{"snapshot":{"a":2}}';
    rig.stored.state = rig.mirror.state;
    pendingEdit();

    expect(rig.run('saveState("edit")')).toBeNull();
    expect(rig.writes).toStrictEqual([]);
    expect(edited()).toBe(false);
  });

  it("lets the poll save a later change after a no-op edit", () => {
    pendingEdit();
    rig.run('saveState("edit")');
    rig.mirror.state = '{"snapshot":{"a":3}}';
    rig.run("pollState()");

    expect(rig.writes).toStrictEqual(['{"snapshot":{"a":3}}']);
  });

  it("clears it when there is no plug-in to store", () => {
    const empty = loadWrapper(null);

    expect(empty.run("lastSaved = null; markEdited(); edited")).toBe(true);
    expect(empty.run('saveState("edit")')).toBeNull();
    expect(empty.run("edited")).toBe(false);
  });

  it("reports a failed write and lets the poll retry it", () => {
    rig.mirror.state = '{"snapshot":{"a":4}}';
    rig.failWrites.on = true;
    pendingEdit();

    expect(rig.run('saveState("edit")')).toBe(
      "could not save the plug-in state: boom",
    );
    expect(edited()).toBe(false);

    rig.failWrites.on = false;
    rig.run("pollState()");

    expect(rig.writes).toStrictEqual(['{"snapshot":{"a":4}}']);
  });
});
