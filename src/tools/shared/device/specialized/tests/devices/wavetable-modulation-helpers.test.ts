// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import {
  MOD_SOURCES,
  readModulations,
} from "../../devices/wavetable-modulation-helpers.ts";
import { applySpecializedActions } from "../../specialized-device-registry.ts";
import {
  buildModMethods,
  registerWavetable,
} from "./wavetable-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// Edge cases of the Wavetable mod-matrix helpers: the index-0 boundaries (source
// "Amp" and target slot 0 are both real values, not "not found"), the ±1 amount
// contract, whitespace tolerance on LLM-supplied names, and the warning text
// that tells the model what it should have passed. The happy paths live in
// wavetable.test.ts.

describe("modulation source resolution", () => {
  it("accepts the first source in the matrix (index 0)", () => {
    // "Amp" is column 0 — a `> 0` found-check would reject it and fall through
    // to the numeric branch, making the source unusable.
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, ["setModulation('Osc 1 Pos', 'Amp', 0.5)"]);

    expect(device.call).toHaveBeenCalledWith("set_modulation_value", 0, 0, 0.5);
  });

  it("accepts a bare source index and trims whitespace off a source name", () => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      "setModulation('Osc 1 Pos', 4, 0.25)",
      "setModulation('Osc 1 Pos', '  LFO 1  ', 0.75)",
    ]);

    expect(device.call).toHaveBeenCalledWith(
      "set_modulation_value",
      0,
      4,
      0.25,
    );
    expect(device.call).toHaveBeenCalledWith(
      "set_modulation_value",
      0,
      3,
      0.75,
    );
  });

  it.each([-1, 13, 99])("rejects out-of-range source index %s", (index) => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      `setModulation('Osc 1 Pos', ${index}, 0.5)`,
    ]);

    expect(device.call).not.toHaveBeenCalledWith(
      "set_modulation_value",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("names every valid source when the source is invalid", () => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      "setModulation('Osc 1 Pos', 'Nope', 0.5)",
      "clearModulation('Osc 1 Pos', 'Nope')",
    ]);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `setModulation source "Nope" is invalid. Valid: ${MOD_SOURCES.join(", ")}`,
      ),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clearModulation source "Nope" is invalid. Valid: ${MOD_SOURCES.join(", ")}`,
      ),
    );
  });
});

describe("modulation target resolution", () => {
  it("trims whitespace off a target name", () => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      "setModulation('  Osc 1 Pos  ', 'LFO 1', 0.5)",
    ]);

    expect(device.call).toHaveBeenCalledWith("set_modulation_value", 0, 3, 0.5);
  });

  it("trims whitespace when looking up a parameter to add", () => {
    // findParamChild is only reached for a target that is NOT yet in the
    // matrix, so the empty-matrix mock is what exercises its trim.
    const device = registerWavetable({}, buildModMethods([]));

    applySpecializedActions(device, ["addModulationTarget('  Osc 1 Pos  ')"]);

    expect(device.call).toHaveBeenCalledWith(
      "add_parameter_to_modulation_matrix",
      "id p1",
    );
  });

  it("does not re-add a target already in slot 0", () => {
    // Slot 0 is a valid existing target: a `> 0` check would treat it as
    // missing and re-add it to the matrix.
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      "setModulation('Osc 1 Pos', 'LFO 1', 0.5)",
    ]);

    expect(device.call).not.toHaveBeenCalledWith(
      "add_parameter_to_modulation_matrix",
      expect.anything(),
    );
    expect(device.call).toHaveBeenCalledWith("set_modulation_value", 0, 3, 0.5);
  });

  it("does not warn when an auto-added target lands in slot 0", () => {
    // The matrix starts empty, so the added target resolves to index 0 — the
    // post-add check must accept it rather than report "could not add".
    const targets: string[] = [];
    const device = registerWavetable(
      {},
      {
        ...buildModMethods(targets),
        add_parameter_to_modulation_matrix: () => {
          targets.push("Osc 1 Pos");

          return null;
        },
      },
    );

    applySpecializedActions(device, [
      "setModulation('Osc 1 Pos', 'LFO 1', 0.5)",
    ]);

    expect(device.call).toHaveBeenCalledWith("set_modulation_value", 0, 3, 0.5);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("could not add to matrix"),
    );
  });

  it("returns -1 for an unknown target in a non-empty matrix", () => {
    // Exercises the resolve loop's non-matching path: the scan must run past a
    // real target and still report "not in the modulation matrix".
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      "clearModulation('Filter Freq', 'LFO 1')",
    ]);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'clearModulation target "Filter Freq" is not in the modulation matrix',
      ),
    );
  });
});

describe("setModulation amount contract", () => {
  it.each([1, -1])("accepts the boundary amount %s", (amount) => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      `setModulation('Osc 1 Pos', 'LFO 1', ${amount})`,
    ]);

    expect(device.call).toHaveBeenCalledWith(
      "set_modulation_value",
      0,
      3,
      amount,
    );
  });

  it.each([1.5, -1.5])("rejects the out-of-range amount %s", (amount) => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(device, [
      `setModulation('Osc 1 Pos', 'LFO 1', ${amount})`,
    ]);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(`amount must be in -1..1 (got ${amount})`),
    );
  });
});

describe("readModulations", () => {
  it("omits zero-amount cells", () => {
    const device = registerWavetable(
      {},
      buildModMethods(["Osc 1 Pos"], { "0,3": 0.5, "0,4": 0 }),
    );

    expect(readModulations(device)).toStrictEqual([
      { target: "Osc 1 Pos", source: "LFO 1", amount: 0.5 },
    ]);
  });

  it("reads exactly the 13 known sources per target", () => {
    // Every cell is nonzero, so the scan's source bound is what limits the
    // result: one entry per MOD_SOURCES column, none past the last.
    const cells: Record<string, number> = {};

    for (let s = 0; s < 20; s++) {
      cells[`0,${s}`] = 0.5;
    }

    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"], cells));
    const result = readModulations(device) as { source: string }[];

    expect(result.map((r) => r.source)).toStrictEqual([...MOD_SOURCES]);
  });
});
