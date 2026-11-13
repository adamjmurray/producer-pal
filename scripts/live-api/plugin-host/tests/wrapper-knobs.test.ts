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

// A rig whose plug-in answers a "get" with the value given for that param.
function answering(values: Record<number, number>): Rig {
  const rig: Rig = mapped((_outlet, message, index) => {
    if (message === "get" && values[index as number] != null) {
      rig.run(`pval(${String(index)}, ${values[index as number]}, "")`);
    }
  });

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
    // The plug-in doesn't answer here, so the knob takes its slot's dial.
    expect(sentTo(rig, "knob3")).toStrictEqual([
      ["set", 0],
      ["active", 1],
    ]);
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

    rig.run("showKnobs(slotCache.map)");
    rig.sent.length = 0;
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

  // Making a knob active sends the value it holds, which is not a turn.
  it("ignores the value a knob sends when a page change activates it", () => {
    const rig = answering({ 206: 0.4, 300: 0.9 });

    rig.run("showKnobs(slotCache.map)");
    rig.run("knobpage(1)");
    rig.sent.length = 0;
    // Knob 3 drove slot 3 at 0.4; on page 2 it drives slot 19, which reads 0.9.
    rig.run("knob(3, 0.9)");

    expect(sentTo(rig, "slotdial19")).toHaveLength(0);
    expect(rig.run("edited")).toBe(false);
  });

  it("sets every knob of a param two slots drive before activating it", () => {
    const rig = answering({ 5: 0.6 });
    const both =
      '{ "1": { index: 5, name: "A" }, "2": { index: 5, name: "A" } }';

    rig.run(`slotCache = { at: Date.now(), map: ${both} }`);
    rig.run("routeSlots(slotCache.map)");
    rig.run("showKnobs(slotCache.map)");

    for (const knob of ["knob1", "knob2"]) {
      expect(sentTo(rig, knob).slice(0, 2)).toStrictEqual([
        ["set", 0.6],
        ["active", 1],
      ]);
    }

    // What each knob sends on becoming active is the value it was just set to.
    rig.sent.length = 0;
    rig.run("knob(1, 0.6)");
    rig.run("knob(2, 0.6)");
    expect(rig.sent).toHaveLength(0);
    expect(rig.run("edited")).toBe(false);

    // Both follow the plug-in afterwards.
    rig.run('pval(5, 0.2, "2")');
    expect(sentTo(rig, "knob1")).toStrictEqual([["set", 0.2]]);
    expect(sentTo(rig, "knob2")).toStrictEqual([["set", 0.2]]);
  });

  it("takes the slot's dial when the plug-in doesn't answer", () => {
    const rig = mapped();

    rig.dials.slotdial3 = 0.3;
    rig.run("showKnobs(slotCache.map)");

    expect(sentTo(rig, "knob3")).toStrictEqual([
      ["set", 0.3],
      ["active", 1],
    ]);

    rig.sent.length = 0;
    rig.run("knob(3, 0.3)");
    expect(rig.sent).toHaveLength(0);
  });

  it("takes a turn back to the value the knob started at", () => {
    const rig = mapped();

    rig.run('pval(206, 0.5, "500")');
    rig.run("knob(3, 0.51)");
    // The echo lands inside the drag hold, so the knob isn't set again.
    rig.run('pval(206, 0.51, "510")');
    rig.run("knob(3, 0.5)");

    expect(sentTo(rig, "slotdial3")).toStrictEqual([[0.51], [0.5]]);
  });

  it("ignores a turn on an unmapped knob", () => {
    const rig = mapped();

    rig.run("knob(1, 0.7)");

    expect(rig.sent).toHaveLength(0);
    expect(rig.run("edited")).toBe(false);
  });
});
