// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type Rig, loadWrapper } from "./wrapper-test-helpers.ts";

// Slot 3 drives param 206, slot 19 (page 2, knob 3) drives param 300.
const MAP =
  '{ "3": { index: 206, name: "Cutoff" }, "19": { index: 300, name: "Res" } }';

function mapped(outlet?: (...args: unknown[]) => void): Rig {
  const rig = loadWrapper("Plug", outlet);

  rig.run(`slotCache = { at: Date.now(), map: ${MAP} }`);
  rig.run("routeSlots(slotCache.map)");

  return rig;
}

function sentTo(rig: Rig, box: string): unknown[][] {
  return rig.sent.filter(([name]) => name === box).map(([, ...args]) => args);
}

describe("wrapper panel knobs", () => {
  it("labels a page of knobs and enables only the mapped ones", () => {
    const asked: unknown[][] = [];
    const rig = mapped((...args) => asked.push(args));

    rig.run("showKnobs(slotCache.map)");

    expect(sentTo(rig, "knoblabel1")).toStrictEqual([["set", "Auto 001"]]);
    expect(sentTo(rig, "knobname3")).toStrictEqual([["set", "Cutoff"]]);
    expect(sentTo(rig, "knobname1")).toStrictEqual([["set", "—"]]);
    expect(sentTo(rig, "knob3")).toStrictEqual([["active", 1]]);
    expect(sentTo(rig, "knob1")).toStrictEqual([
      ["set", 0],
      ["active", 0],
    ]);
    expect(asked).toStrictEqual([[0, "get", 206]]);

    rig.sent.length = 0;
    rig.run("showKnobs(slotCache.map)");
    expect(rig.sent).toHaveLength(0);
  });

  it("shows the next page of slots when the tab changes", () => {
    const rig = mapped();

    rig.run("knobpage(1)");

    expect(sentTo(rig, "knoblabel1")).toStrictEqual([["set", "Auto 017"]]);
    expect(sentTo(rig, "knobname3")).toStrictEqual([["set", "Res"]]);
  });

  it("follows the plug-in's value for knobs on the shown page", () => {
    const rig = mapped();

    rig.run('pval(206, 0.4, "500")');
    rig.run('pval(300, 0.9, "9")');
    rig.run('pval(207, 0.1, "1")');

    expect(sentTo(rig, "knob3")).toStrictEqual([["set", 0.4]]);
    expect(rig.sent).toHaveLength(1);
  });

  it("moves the slot's dial when a knob turns, and saves it as an edit", () => {
    const rig = mapped();

    rig.run("knob(3, 0.7)");

    expect(sentTo(rig, "slotdial3")).toStrictEqual([[0.7]]);
    expect(rig.run("edited")).toBe(true);

    // The trailing echo doesn't pull the knob back mid-drag.
    rig.run('pval(206, 0.65, "600")');
    expect(sentTo(rig, "knob3")).toHaveLength(0);
  });

  it("cuts a name too long for two lines under a knob", () => {
    const rig = mapped();

    rig.run(
      'showKnobs({ "1": { index: 1, name: "Oscillator 1 Wavetable Position" } })',
    );

    expect(sentTo(rig, "knobname1")).toStrictEqual([
      ["set", "Oscillator 1 Wavetable …"],
    ]);
  });

  it("ignores the old value a knob sends when a page change activates it", () => {
    const rig = mapped();

    rig.run("showKnobs(slotCache.map)");
    rig.run("knobpage(1)");
    // Knob 2 read 0 on page 1 (slot 2 is unmapped); on page 2 it drives slot 18.
    rig.run("knob(2, 0)");

    expect(sentTo(rig, "slotdial18")).toHaveLength(0);
    expect(rig.run("edited")).toBe(false);
  });

  it("ignores a turn on an unmapped knob", () => {
    const rig = mapped();

    rig.run("knob(1, 0.7)");

    expect(rig.sent).toHaveLength(0);
    expect(rig.run("edited")).toBe(false);
  });
});
