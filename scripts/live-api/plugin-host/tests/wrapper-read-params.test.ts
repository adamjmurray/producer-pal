// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper, type Rig } from "./wrapper-test-helpers.ts";

const REAL = ["Cutoff", "Main Vol", "Osc *"];
const STAND_INS = Array.from({ length: 130 }, (_, i) => `MIDI CC ${i}`);

// A plug-in with a few real params and a long run of MIDI stand-ins.
function rigWithStandIns(): Rig {
  const rig = loadWrapper("Plug", (...args) => {
    if (args[1] === "params") {
      const names = JSON.stringify([...REAL, ...STAND_INS]);

      rig.run(`pname(...${names})`);
    }
  });

  return rig;
}

function namesRead(rig: Rig, req: object): string[] {
  const { params } = rig.run(`readParams(${JSON.stringify(req)})`) as {
    params: Array<{ name: string }>;
  };

  return Array.from(params, (param) => param.name);
}

describe("wrapper readParams", () => {
  it("hides the MIDI stand-ins by default", () => {
    expect(namesRead(rigWithStandIns(), { limit: 500 })).toStrictEqual(REAL);
  });

  it("lists the stand-ins when `all` is set", () => {
    expect(
      namesRead(rigWithStandIns(), { all: true, limit: 500 }),
    ).toHaveLength(REAL.length + STAND_INS.length);
  });

  it("treats a search of * as a literal, not a switch", () => {
    expect(
      namesRead(rigWithStandIns(), { search: "*", limit: 500 }),
    ).toStrictEqual(["Osc *"]);
  });

  it("still filters by search when `all` is set", () => {
    const found = namesRead(rigWithStandIns(), {
      all: true,
      search: "cc 129",
      limit: 500,
    });

    expect(found).toStrictEqual(["MIDI CC 129"]);
  });
});
