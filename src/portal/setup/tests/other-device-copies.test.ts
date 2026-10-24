// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { chmodSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOtherDeviceCopies } from "../other-device-copies.ts";
import { makeScratchLibrary, put } from "./device-test-helpers.ts";

let library: string;

beforeEach(() => {
  library = makeScratchLibrary();
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
});

describe("findOtherDeviceCopies", () => {
  const installed = (): string =>
    join(library, "Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd");

  it("finds nothing when only the installed device is there", () => {
    put(installed(), "x");

    expect(findOtherDeviceCopies(library, installed())).toStrictEqual([]);
  });

  it("finds copies in the library root and other device folders, sorted", () => {
    const root = join(library, "Producer_Pal.amxd");
    const instrument = join(
      library,
      "Presets/Instruments/Max Instrument/Producer_Pal.amxd",
    );

    put(installed(), "x");
    put(instrument, "x");
    put(root, "x");

    expect(findOtherDeviceCopies(library, installed())).toStrictEqual(
      [instrument, root].toSorted(),
    );
  });

  it("matches renamed and numbered copies, ignoring case", () => {
    const numbered = join(library, "Presets/Producer_Pal 2.amxd");
    const lower = join(library, "producer_pal.AMXD");

    put(numbered, "x");
    put(lower, "x");
    put(join(library, "Presets/Other Device.amxd"), "x");
    put(join(library, "Presets/Producer_Pal.adv"), "x");
    put(join(library, "Presets/Producer_Pal.amxd.tmp-1"), "x");

    expect(findOtherDeviceCopies(library, installed())).toStrictEqual(
      [numbered, lower].toSorted(),
    );
  });

  it("doesn't count the installed device under a different case", () => {
    const path = join(
      library,
      "Presets/MIDI Effects/Max MIDI Effect/producer_pal.amxd",
    );

    put(path, "x");

    expect(findOtherDeviceCopies(library, installed())).toStrictEqual([]);
  });

  it("doesn't look in Samples or Remote Scripts", () => {
    put(join(library, "Samples/Producer_Pal.amxd"), "x");
    put(join(library, "Remote Scripts/Producer_Pal.amxd"), "x");

    expect(findOtherDeviceCopies(library, installed())).toStrictEqual([]);
  });

  it("stops at a depth limit", () => {
    put(join(library, "a/b/c/d/e/f/g/h/Producer_Pal.amxd"), "x");

    expect(findOtherDeviceCopies(library, installed())).toStrictEqual([]);
  });

  it("doesn't follow a symlinked folder", () => {
    const elsewhere = makeScratchLibrary();

    try {
      put(join(elsewhere, "Producer_Pal.amxd"), "x");
      symlinkSync(elsewhere, join(library, "Linked"));

      expect(findOtherDeviceCopies(library, installed())).toStrictEqual([]);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("skips a folder it can't read and keeps going", () => {
    const locked = join(library, "Locked");
    const open = join(library, "Open/Producer_Pal.amxd");

    put(join(locked, "Producer_Pal.amxd"), "x");
    put(open, "x");
    chmodSync(locked, 0);

    try {
      expect(findOtherDeviceCopies(library, installed())).toStrictEqual([open]);
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});
