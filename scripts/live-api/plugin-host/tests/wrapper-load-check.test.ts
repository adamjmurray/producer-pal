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

    const [, message, target, id] = args;
    const key = [message, target, ...(id == null ? [] : [id])]
      .map(String)
      .join(" ");

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

  const SERUM_FX = {
    format: "VST3",
    file: "Serum2",
    path: "C:/VST3/Serum2.vst3",
    sub: "Serum 2 FX",
    name: "Serum 2 FX",
    ids: [111, 222],
    synth: true,
  };

  it("picks a shared file's plug-in by id when it only loads by path", () => {
    const rig = rigThatLoads({
      "plug C:/VST3/Serum2.vst3 222": "Serum2.vst3 222",
    });

    expect(rig.load(SERUM_FX)).toStrictEqual([
      "Serum 2 FX",
      {
        format: "VST3",
        file: "Serum2",
        path: SERUM_FX.path,
        sub: "Serum 2 FX",
        id: 222,
      },
    ]);
    expect(rig.sent.slice(-4)).toStrictEqual([
      ["unplug"],
      ["plug", SERUM_FX.path, 111],
      ["unplug"],
      ["plug", SERUM_FX.path, 222],
    ]);
  });

  it("refuses a path load that ignored the id", () => {
    const rig = rigThatLoads({
      "plug C:/VST3/Serum2.vst3 111": "Serum2.vst3",
    });

    expect(() => rig.load({ ...SERUM_FX, ids: [111] })).toThrow(
      "loaded its first plug-in (Serum2.vst3) instead",
    );
  });

  it("refuses when no id loads anything", () => {
    expect(() => rigThatLoads({}).load(SERUM_FX)).toThrow(
      'could not load "Serum 2 FX": nothing loaded from "Serum2"',
    );
  });

  const VA = {
    format: "VST3",
    file: "Filterscape(x64)",
    path: "C:/VST3/Filterscape(x64).vst3",
    sub: "FilterscapeVA",
    name: "FilterscapeVA",
    siblings: ["Filterscape"],
    synth: true,
  };

  it("tries the file, the name, each sibling, then the path", () => {
    const rig = rigThatLoads({
      "plug_vst3 Filterscape(x64)": "C74_VST3:/Filterscape(x64)",
      "plug C:/VST3/Filterscape(x64).vst3": "Filterscape(x64).vst3",
    });

    expect(() => rig.load(VA)).toThrow(
      "loaded its first plug-in (Filterscape(x64).vst3) instead",
    );
    expect(rig.sent).toStrictEqual([
      ["unplug"],
      ["plug_vst3", "Filterscape(x64)"],
      ["subname", "FilterscapeVA"],
      ["unplug"],
      ["plug_vst3", "FilterscapeVA"],
      ["unplug"],
      ["plug_vst3", "Filterscape"],
      ["subname", "FilterscapeVA"],
      ["unplug"],
      ["plug", "C:/VST3/Filterscape(x64).vst3"],
      ["subname", "FilterscapeVA"],
      ["unplug"],
    ]);
  });

  it("loads by the plug-in's name when the file's name finds nothing", () => {
    const rig = rigThatLoads({
      "plug_vst3 FilterscapeVA": "C74_VST3:/FilterscapeVA 77",
    });

    expect(rig.load(VA)).toStrictEqual([
      "FilterscapeVA",
      { format: "VST3", file: "FilterscapeVA", path: VA.path, sub: null },
    ]);
  });

  it("loads a sibling and picks the plug-in by subname", () => {
    const rig = rigThatLoads({
      "plug_vst3 Filterscape": "C74_VST3:/Filterscape 11",
      "subname FilterscapeVA": "C74_VST3:/Filterscape 22",
    });

    expect(rig.load(VA)).toStrictEqual([
      "FilterscapeVA",
      {
        format: "VST3",
        file: "Filterscape",
        path: VA.path,
        sub: "FilterscapeVA",
      },
    ]);
  });

  it("refuses a sibling whose subname changed nothing", () => {
    const rig = rigThatLoads({
      "plug_vst3 Filterscape": "C74_VST3:/Filterscape 11",
    });

    expect(() => rig.load({ ...VA, path: undefined })).toThrow(
      'the VST3 bundle "Filterscape" loaded its first plug-in (C74_VST3:/Filterscape 11) instead',
    );
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
    expect(loadWrapper("Serum2.vst3 -472297922").run("loadedFile()")).toBe(
      "Serum2",
    );
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

  it("loads a shared file by path with the stored id, not the subname", () => {
    expect(
      replug({ ...STORED, sub: "Q6", id: "222" }, ["plug C:/VST3/Diva.vst3"]),
    ).toStrictEqual({
      result: true,
      sent: [
        ["plug_vst3", "Diva(x64)"],
        ["subname", "Q6"],
        ["plug", "C:/VST3/Diva.vst3", 222],
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
