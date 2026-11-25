// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { toolCall, turnsOf } from "../../../helpers/turns-test-helpers.ts";
import { noteWrites, refusedNoteWrites, strayWrites } from "./stray-writes.ts";

const REFUSED = toolCall(
  "ppal-update-clip",
  { path: "t0/s0", notes: "2|1 D1" },
  "notes ignored: the clip is a step sequencer",
  true,
);
const LANDED = toolCall(
  "ppal-update-clip",
  { path: "t0/s1", notes: "2|1 D1" },
  '{id:"1",noteCount:5}',
);
const READ = toolCall("ppal-read-clip", { path: "t0/s0" });

describe("noteWrites", () => {
  it("lists calls that carried notes, refused or not", () => {
    expect(noteWrites(turnsOf([READ, REFUSED, LANDED]))).toStrictEqual([
      REFUSED,
      LANDED,
    ]);
  });

  it("skips an update that sends no notes", () => {
    const rename = toolCall("ppal-update-clip", { path: "t0/s0", name: "x" });

    expect(noteWrites(turnsOf([rename]))).toStrictEqual([]);
  });
});

describe("refusedNoteWrites", () => {
  it("keeps only the refused ones", () => {
    expect(refusedNoteWrites(turnsOf([LANDED], [REFUSED]))).toStrictEqual([
      REFUSED,
    ]);
  });
});

describe("strayWrites", () => {
  it("is empty for reads and a refused write", () => {
    expect(strayWrites(turnsOf([READ, REFUSED]))).toStrictEqual([]);
  });

  it("names notes that landed", () => {
    expect(strayWrites(turnsOf([LANDED]))).toStrictEqual([
      "ppal-update-clip wrote notes to t0/s1",
    ]);
  });

  it("names any create-clip and delete, even one that failed", () => {
    const create = toolCall("ppal-create-clip", { path: "t0/s0" }, "no", true);
    const remove = toolCall("ppal-delete", { type: "clip", path: "t0/s0" });

    expect(strayWrites(turnsOf([create, remove]))).toStrictEqual([
      "ppal-create-clip t0/s0",
      "ppal-delete t0/s0",
    ]);
  });
});
