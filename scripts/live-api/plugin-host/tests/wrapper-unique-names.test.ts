// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

const NAMES = 'pname("Attack", "Decay", "Cutoff", "Attack", "Decay", "Attack")';

// A plug-in with two envelopes: "Attack" and "Decay" each come twice.
function rigWithRepeats(): { json: (code: string) => unknown } {
  const rig = loadWrapper("Plug", (...args) => {
    if (args[1] === "get") {
      rig.run(`pval(${String(args[2])}, 0.5, "half")`);
    } else if (args[1] === "params") {
      rig.run(NAMES);
    }
  });

  rig.run(NAMES);

  return {
    // Through JSON, as a reply goes: the result is from another realm.
    json: (code) => JSON.parse(rig.run(`JSON.stringify(${code})`) as string),
  };
}

describe("wrapper names for params the plug-in names alike", () => {
  it("numbers each repeat, in the plug-in's order", () => {
    const { json } = rigWithRepeats();

    expect(json("paramNames()")).toStrictEqual([
      "Attack",
      "Decay",
      "Cutoff",
      "Attack (2)",
      "Decay (2)",
      "Attack (3)",
    ]);
  });

  it("reaches each one by its own name", () => {
    const { json } = rigWithRepeats();

    expect(
      json(
        '["Attack", "attack (2)", "Attack (3)", "Decay (2)", "Attack (4)"].map((name) => resolveEntry({ name }))',
      ),
    ).toStrictEqual([
      { index: 1 },
      { index: 4 },
      { index: 6 },
      { index: 5 },
      { kind: "missing", error: "no param with that name" },
    ]);
  });

  it("reads and names them that way", () => {
    const { json } = rigWithRepeats();
    const read = json('readParams({ search: "attack" })') as {
      total: number;
      params: { index: number; name: string }[];
    };

    expect(read.params.map(({ index, name }) => [index, name])).toStrictEqual([
      [1, "Attack"],
      [4, "Attack (2)"],
      [6, "Attack (3)"],
    ]);
    expect(
      json('readParams({ names: ["Attack (2)"] }).params.map((p) => p.index)'),
    ).toStrictEqual([4]);
  });

  it("looks a name up, exactly first and then ignoring case", () => {
    const { json } = rigWithRepeats();

    expect(json('lookupName({ name: "decay (2)" })')).toStrictEqual({
      matches: [{ index: 5, name: "Decay (2)" }],
    });
    expect(json('lookupName({ name: "Resonance" })')).toStrictEqual({
      matches: [],
    });
  });

  it("follows the plug-in's names when they change", () => {
    const { json } = rigWithRepeats();

    json("paramNames()");
    json('(state.names = ["Mix", "Mix"], 0)');

    expect(json("paramNames()")).toStrictEqual(["Mix", "Mix (2)"]);
  });

  it("never makes up a name another param already has", () => {
    const { json } = rigWithRepeats();

    json('(state.names = ["Attack", "Attack (2)", "Attack"], 0)');
    expect(json("paramNames()")).toStrictEqual([
      "Attack",
      "Attack (2)",
      "Attack (3)",
    ]);

    json('(state.names = ["Attack", "Attack", "Attack (2)"], 0)');
    expect(json("paramNames()")).toStrictEqual([
      "Attack",
      "Attack (3)",
      "Attack (2)",
    ]);
    expect(json('resolveEntry({ name: "Attack (2)" })')).toStrictEqual({
      index: 3,
    });
  });
});
