// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { loadWrapper, type Rig } from "./wrapper-test-helpers.ts";

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
