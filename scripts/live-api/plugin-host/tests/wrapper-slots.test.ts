// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

describe("wrapper unmapSlot", () => {
  it("refuses with no plug-in loaded, keeping the stored mappings", () => {
    const rig = loadWrapper(null);

    rig.run("slotsReady = true");

    // The rig has no vstslots object, so a save would throw something else.
    expect(() => rig.run("unmapSlot({ slot: 1 })")).toThrow(
      "no plug-in loaded",
    );
  });
});

describe("wrapper slot routing", () => {
  it("points each slot's prepend at its param, once", () => {
    const rig = loadWrapper();

    rig.run('routeSlots({ "3": { index: 206 } })');

    expect(rig.prepends).toHaveLength(128);
    expect(rig.prepends).toContainEqual(["slotprep3", "set", 206]);
    expect(rig.prepends).toContainEqual(["slotprep4", "set", "ignore"]);

    rig.prepends.length = 0;
    rig.run('routeSlots({ "3": { index: 206 } })');
    expect(rig.prepends).toHaveLength(0);

    rig.run("routeSlots({})");
    expect(rig.prepends).toStrictEqual([["slotprep3", "set", "ignore"]]);
  });

  it("takes a slot param's echo as a slot write, not an edit", () => {
    const rig = loadWrapper();

    rig.run('routeSlots({ "3": { index: 206 } })');
    rig.run("playing = true");
    rig.run('pval(206, 0.5, "718")');

    expect(rig.run("slotWriteAt > 0")).toBe(true);
    expect(rig.run("edited")).toBe(false);

    rig.run('pval(207, 0.5, "1")');
    expect(rig.run("edited")).toBe(true);
  });

  it("takes a slot param's change as an edit while stopped", () => {
    const rig = loadWrapper();

    rig.run('routeSlots({ "3": { index: 206 } })');
    rig.run('pval(206, 0.5, "718")');

    expect(rig.run("slotWriteAt")).toBe(0);
    expect(rig.run("edited")).toBe(true);
  });

  it("takes a stopped change that matches the slot's dial as a slot write", () => {
    const rig = loadWrapper();

    rig.dials.slotdial3 = 0.2;
    rig.run('routeSlots({ "3": { index: 206 } })');
    rig.run('pval(206, 0.20001, "100")');

    expect(rig.run("edited")).toBe(false);
  });

  it("adopts a stopped slot change that slot writes follow", () => {
    const rig = loadWrapper();

    rig.run("lastSaved = '{}'; savedAt = 1");
    rig.run('routeSlots({ "3": { index: 206 } })');
    rig.run('pval(206, 0.5, "718")');
    rig.run("playing = true");
    rig.run('pval(206, 0.6, "800")');
    rig.run('saveState("edit")');

    expect(rig.writes).toHaveLength(0);
  });

  it("saves a stopped slot change that no slot write follows", () => {
    const rig = loadWrapper();

    rig.run("lastSaved = '{}'; savedAt = 1");
    rig.run('routeSlots({ "3": { index: 206 } })');
    rig.run('pval(206, 0.5, "718")');
    rig.run('saveState("edit")');

    expect(rig.writes).toHaveLength(1);
  });

  it("takes any slot param change just after a stop as a slot write", () => {
    const rig = loadWrapper();

    rig.run('routeSlots({ "3": { index: 206 } })');
    rig.run("playing = true");
    rig.run('onTransport(["is_playing", 0])');
    rig.run('pval(206, 0.5, "718")');

    expect(rig.run("edited")).toBe(false);
  });
});
