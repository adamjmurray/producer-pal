// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

/** Stands in for `vst~`: answers `get` with the loaded plug-in's facts. */
function rigThatLoads(answers: Record<string, string | null>): {
  load: (request: object) => unknown;
  sent: unknown[][];
} {
  const sent: unknown[][] = [];
  let current: string | null = null;
  const rig = loadWrapper(null, (...args) => {
    sent.push(args.slice(1));

    const [, message, target] = args;
    const key = `${String(message)} ${String(target)}`;

    if (message === "unplug") {
      current = null;
    } else if (message === "subname") {
      current = current == null ? null : (answers[key] ?? current);
    } else if (typeof message === "string" && message.startsWith("plug")) {
      current = answers[key] ?? null;
    }
  });

  rig.run(`
    info = () => ({ loaded: __current(), numParams: 3, isSynth: true });
    nameDevice = () => {}; saveName = (...args) => { __saved = args; };
    showName = () => {}; readSlots = () => {};
    var __saved = null;
  `);
  rig.run("var __current = null;");
  (rig.run("(fn) => { __current = fn; }") as (fn: () => unknown) => void)(
    () => current,
  );

  return {
    load: (request) =>
      // Through JSON: values made in the wrapper's context aren't this one's.
      JSON.parse(
        (
          rig.run(
            "(request) => { load(JSON.parse(request)); return JSON.stringify(__saved); }",
          ) as (request: string) => string
        )(JSON.stringify(request)),
      ) as unknown,
    sent,
  };
}

const AALTO = {
  format: "VST2",
  file: "Aalto_x64",
  path: "C:/VST2/Aalto_x64.dll",
  name: "Aalto_x64",
  synth: true,
};

describe("wrapper load", () => {
  it("loads by name when the name is found", () => {
    const rig = rigThatLoads({ "plug_vst Aalto_x64": "C74_VST:/Aalto_x64" });

    expect(rig.load(AALTO)).toStrictEqual([
      "Aalto_x64",
      { format: "VST2", file: "Aalto_x64", path: AALTO.path, sub: null },
    ]);
    expect(rig.sent).toStrictEqual([["unplug"], ["plug_vst", "Aalto_x64"]]);
  });

  it("loads by path when the name finds nothing", () => {
    const rig = rigThatLoads({ "plug C:/VST2/Aalto_x64.dll": "Aalto_x64.dll" });

    expect(rig.load(AALTO)).toStrictEqual([
      "Aalto_x64",
      { format: "VST2", file: "Aalto_x64", path: AALTO.path, sub: null },
    ]);
    expect(rig.sent).toStrictEqual([
      ["unplug"],
      ["plug_vst", "Aalto_x64"],
      ["unplug"],
      ["plug", "C:/VST2/Aalto_x64.dll"],
    ]);
  });

  it("refuses when neither the name nor the path loads anything", () => {
    const rig = rigThatLoads({});

    expect(() => rig.load(AALTO)).toThrow(
      'could not load "Aalto_x64": nothing loaded from "Aalto_x64"',
    );
  });

  it("refuses a path load that left a shared file's first plug-in", () => {
    const rig = rigThatLoads({ "plug C:/VST3/Serum2.vst3": "Serum2.vst3" });

    expect(() =>
      rig.load({
        format: "VST3",
        file: "Serum2",
        path: "C:/VST3/Serum2.vst3",
        sub: "Serum 2 FX",
        name: "Serum 2 FX",
        synth: true,
      }),
    ).toThrow("loaded its first plug-in (Serum2.vst3) instead");
  });

  it("retries by path, with the subname, when the subname missed", () => {
    const rig = rigThatLoads({
      "plug_vst3 Filterscape(x64)": "C74_VST3:/Filterscape(x64)",
      "plug C:/VST3/Filterscape(x64).vst3": "Filterscape(x64).vst3",
    });

    const request = {
      format: "VST3",
      file: "Filterscape(x64)",
      path: "C:/VST3/Filterscape(x64).vst3",
      sub: "FilterscapeVA",
      name: "FilterscapeVA",
      synth: true,
    };

    expect(() => rig.load(request)).toThrow("loaded its first plug-in");
    expect(rig.sent.map(([message]) => message)).toStrictEqual([
      "unplug",
      "plug_vst3",
      "subname",
      "unplug",
      "plug",
      "subname",
      "unplug",
    ]);
  });

  it("never tries a path for an AU", () => {
    const rig = rigThatLoads({});

    expect(() =>
      rig.load({ ...AALTO, format: "AU", path: "/x/AUDelay.component" }),
    ).toThrow("nothing loaded");
    expect(rig.sent.map(([message]) => message)).not.toContain("plug");
  });
});

describe("wrapper loadedFile", () => {
  it("reads a path-loaded plug-in's bare file name without its extension", () => {
    expect(loadWrapper("Serum2.vst3").run("loadedFile()")).toBe("Serum2");
    expect(loadWrapper("Aalto_x64.dll").run("loadedFile()")).toBe("Aalto_x64");
  });
});

describe("wrapper replugStored", () => {
  /** Runs replugStored() with `stored` in vstname and a vst~ that knows `known`. */
  function replug(
    stored: Record<string, string> | null,
    known: string[],
    loaded: string | null = null,
  ): { result: unknown; sent: unknown[][] } {
    const sent: unknown[][] = [];
    let current = loaded;
    const rig = loadWrapper(null, (...args) => {
      sent.push(args.slice(1));

      const key = `${String(args[1])} ${String(args[2])}`;

      if (String(args[1]).startsWith("plug") && known.includes(key)) {
        current = "loaded";
      }
    });
    const set = rig.run(
      "(dict, current) => { storedNameDict = () => dict && { get: (key) => dict[key] }; loadedPlugin = current; }",
    ) as (dict: unknown, current: () => unknown) => void;

    set(stored, () => current);

    return { result: rig.run("replugStored()"), sent };
  }

  const STORED = {
    format: "VST3",
    file: "Diva(x64)",
    path: "C:/VST3/Diva.vst3",
  };

  it("loads by name with the stored format", () => {
    expect(replug(STORED, ["plug_vst3 Diva(x64)"])).toStrictEqual({
      result: true,
      sent: [["plug_vst3", "Diva(x64)"]],
    });
  });

  it("loads by path when the name finds nothing, with the subname", () => {
    expect(
      replug({ ...STORED, sub: "Q6" }, ["plug C:/VST3/Diva.vst3"]),
    ).toStrictEqual({
      result: true,
      sent: [
        ["plug_vst3", "Diva(x64)"],
        ["subname", "Q6"],
        ["plug", "C:/VST3/Diva.vst3"],
        ["subname", "Q6"],
      ],
    });
  });

  it("says so when nothing loads", () => {
    expect(replug(STORED, []).result).toBe(false);
  });

  it("does nothing when a plug-in is loaded, or no format was stored", () => {
    expect(replug(STORED, [], "C74_VST3:/Diva(x64)")).toStrictEqual({
      result: false,
      sent: [],
    });
    expect(replug({ file: "Diva(x64)" }, [])).toStrictEqual({
      result: false,
      sent: [],
    });
    expect(replug(null, [])).toStrictEqual({ result: false, sent: [] });
  });
});
