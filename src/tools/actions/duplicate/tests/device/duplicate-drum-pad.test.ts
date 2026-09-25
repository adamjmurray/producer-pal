// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import * as consoleMock from "#src/shared/max/v8-max-console.ts";

const RACK_PATH = String(livePath.track(0).device(0));

interface PadSpec {
  /** MIDI note the pad sits on */
  note: number;
  /** Chain ids on the pad, in order */
  chainIds: string[];
}

/**
 * Register one drum pad and the chains on it.
 * @param note - MIDI note the pad sits on
 * @param chainIds - Chain ids on the pad, in order
 * @returns The registered pad mock
 */
function registerPad(note: number, chainIds: string[]): RegisteredMockObject {
  for (const chainId of chainIds) {
    registerMockObject(chainId, {
      path: `${RACK_PATH} chains ${chainId}`,
      type: "DrumChain",
    });
  }

  return registerMockObject(`pad${note}`, {
    path: `${RACK_PATH} drum_pads ${note}`,
    type: "DrumPad",
    properties: { note: [note], chains: children(...chainIds) },
  });
}

/**
 * Register a Drum Rack with the given pads.
 * @param pads - The pads to register
 * @param rackProperties - Overrides for the rack's own properties
 * @returns The registered rack mock
 */
function registerDrumRack(
  pads: PadSpec[],
  rackProperties: Record<string, unknown> = {},
): RegisteredMockObject {
  for (const { note, chainIds } of pads) {
    registerPad(note, chainIds);
  }

  return registerMockObject("rack", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      can_have_drum_pads: [1],
      has_drum_pads: [1],
      drum_pads: children(...pads.map(({ note }) => `pad${note}`)),
      ...rackProperties,
    },
  });
}

/**
 * Make copy_pad land: afterward the destination pad reports the chains listed
 * for its note. A note with no entry is left alone, standing in for a no-op.
 * @param rack - The rack mock
 * @param chainsByNote - Chain ids each destination pad ends up with, by note
 */
function whenCopied(
  rack: RegisteredMockObject,
  chainsByNote: Record<number, string[]>,
): void {
  rack.call.mockImplementation((method: string, ...args: unknown[]) => {
    const note = args[1] as number;
    const chainIds = chainsByNote[note];

    if (method === "copy_pad" && chainIds != null) {
      registerPad(note, chainIds);
    }

    return ["id", 0];
  });
}

/**
 * Assert copy_pad never ran. Every guard has to come before the call, because
 * some inputs crash Live outright rather than failing.
 * @param rack - The rack mock
 */
function expectNoCopy(rack: RegisteredMockObject): void {
  expect(rack.call).not.toHaveBeenCalledWith(
    "copy_pad",
    expect.anything(),
    expect.anything(),
  );
}

/**
 * The common setup: C1 (36) holds a chain, D1 (38) is empty and takes the copy.
 * @param destinationChainIds - Chains D1 ends up with; defaults to just the copy
 * @returns The rack mock
 */
function registerCopyReadyRack(
  destinationChainIds: string[] = ["kickCopy"],
): RegisteredMockObject {
  const rack = registerDrumRack([
    { note: 36, chainIds: ["kick"] },
    { note: 38, chainIds: destinationChainIds.slice(0, -1) },
  ]);

  whenCopied(rack, { 38: destinationChainIds });

  return rack;
}

/**
 * Copy C1 onto D1, the case most of these tests exercise.
 * @param args - Extra duplicate args merged over the defaults
 * @returns The duplicate result
 */
function copyC1ToD1(
  args: Partial<Parameters<typeof duplicate>[0]> = {},
): Promise<object | object[]> {
  return duplicate({
    type: "drum-pad",
    id: "pad36",
    toPath: "t0/d0/pD1",
    ...args,
  });
}

describe("duplicate - drum pad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies a pad to an empty pad in the same rack", async () => {
    const rack = registerCopyReadyRack();
    const result = await copyC1ToD1();

    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(result).toStrictEqual({ id: "pad38", path: "t0/d0/pD1" });
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("refuses to call copy_pad on a rack with no pads, which crashes Live", async () => {
    // A Drum Rack nested inside a drum pad reports has_drum_pads 0, and
    // copy_pad hard-crashes Live on one.
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }], {
      has_drum_pads: [0],
    });

    await expect(copyC1ToD1()).rejects.toThrow("has no pads");
    expectNoCopy(rack);
  });

  it("refuses a destination with no device on it", async () => {
    // A path parses fine against a track/device index that holds nothing.
    const rack = registerCopyReadyRack();

    mockNonExistentObjects();

    await expect(copyC1ToD1({ toPath: "t0/d9/pD1" })).rejects.toThrow(
      'no device at "t0/d9/pD1"',
    );
    expectNoCopy(rack);
  });

  it("refuses a rack that isn't a Drum Rack", async () => {
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }], {
      can_have_drum_pads: [0],
    });

    await expect(copyC1ToD1()).rejects.toThrow(
      "t0/d0 (id rack) is not a Drum Rack",
    );
    expectNoCopy(rack);
  });

  it("refuses a pad whose chain holds the Producer Pal device", async () => {
    const rack = registerCopyReadyRack();

    registerMockObject("this_device", {
      path: `${RACK_PATH} chains kick devices 0`,
    });

    await expect(copyC1ToD1()).rejects.toThrow(
      "cannot duplicate drum pad C1: it holds the Producer Pal device",
    );
    expectNoCopy(rack);
  });

  it("refuses an empty source pad", async () => {
    const rack = registerDrumRack([
      { note: 36, chainIds: [] },
      { note: 38, chainIds: [] },
    ]);

    await expect(copyC1ToD1()).rejects.toThrow("drum pad C1 is empty");
    expectNoCopy(rack);
  });

  it("reports on the copy's own entry that an occupied destination layers", async () => {
    const rack = registerCopyReadyRack(["snare", "kickCopy"]);

    const result = await copyC1ToD1();

    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(result).toStrictEqual({
      id: "pad38",
      path: "t0/d0/pD1",
      detail: expect.stringContaining("layers on top of them"),
    });
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("names only the chains the copy created", async () => {
    registerCopyReadyRack(["snare", "kickCopy"]);

    await copyC1ToD1({ name: "Kick Copy" });

    expect(lookupMockObject("kickCopy")?.set).toHaveBeenCalledWith(
      "name",
      "Kick Copy",
    );
    expect(lookupMockObject("snare")?.set).not.toHaveBeenCalledWith(
      "name",
      expect.anything(),
    );
  });

  it("refuses a destination in a different rack", async () => {
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }]);

    registerMockObject("rack2", {
      path: String(livePath.track(1).device(0)),
      type: "RackDevice",
      properties: { can_have_drum_pads: [1], has_drum_pads: [1] },
    });

    await expect(
      duplicate({ type: "drum-pad", id: "pad36", toPath: "t1/d0/pD1" }),
    ).rejects.toThrow("different racks");
    expectNoCopy(rack);
  });

  it("refuses a pad copied onto itself", async () => {
    const rack = registerCopyReadyRack();

    const result = await copyC1ToD1({ toPath: "t0/d0/pC1,t0/d0/pD1" });

    // Only the real destination is copied to. Nothing says what Live does for
    // copy_pad(n, n), and neither answer is one to hand a caller.
    expect(rack.call).not.toHaveBeenCalledWith("copy_pad", 36, 36);
    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(result).toStrictEqual([
      {
        path: "t0/d0/pC1",
        ok: false,
        detail: expect.stringContaining("can't be copied onto itself"),
      },
      { id: "pad38", path: "t0/d0/pD1" },
    ]);
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("refuses the catch-all pad, which copy_pad cannot address", async () => {
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }]);

    await expect(copyC1ToD1({ toPath: "t0/d0/p*" })).rejects.toThrow(
      "catch-all pad",
    );
    expectNoCopy(rack);
  });

  it("keeps a malformed destination's slot rather than throwing", async () => {
    // One bad destination in a list must not take the others down with it.
    const rack = registerCopyReadyRack();
    const result = await copyC1ToD1({ toPath: "nonsense,t0/d0/pD1" });

    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(result).toStrictEqual([
      {
        path: "nonsense",
        ok: false,
        detail: expect.stringContaining("nonsense"),
      },
      { id: "pad38", path: "t0/d0/pD1" },
    ]);
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("refuses a path that names something inside the pad", async () => {
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }]);

    await expect(copyC1ToD1({ toPath: "t0/d0/pD1/d0" })).rejects.toThrow(
      "names something inside a drum pad",
    );
    expectNoCopy(rack);
  });

  it("says what the track holds when a toPath type segment names nothing", async () => {
    const rack = registerCopyReadyRack();

    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { devices: children("rack") },
    });

    await expect(copyC1ToD1({ toPath: "t0/afx0/pD1" })).rejects.toThrow(
      'nothing at toPath "t0/afx0/pD1": t0 has no audio effects',
    );
    expectNoCopy(rack);
  });

  it("refuses a path that names no pad at all", async () => {
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }]);

    await expect(copyC1ToD1({ toPath: "t0/d0" })).rejects.toThrow(
      "does not name a drum pad",
    );
    expectNoCopy(rack);
  });

  it("says a nested rack's pad is out of reach rather than not a pad", async () => {
    // Path resolution stops at the first pad, so "not a drum pad" would send
    // the reader looking for a typo that isn't there.
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }]);

    await expect(copyC1ToD1({ toPath: "t0/d0/pD1/d0/pE1" })).rejects.toThrow(
      "names a pad of a nested Drum Rack",
    );
    expectNoCopy(rack);
  });

  // The source is the same for every destination, so each keeps its slot with
  // the same reason rather than the call answering short.
  it("keeps every destination's slot when the source can't be copied", async () => {
    registerDrumRack([
      { note: 36, chainIds: [] },
      { note: 38, chainIds: [] },
      { note: 40, chainIds: [] },
    ]);

    const result = await copyC1ToD1({ toPath: "t0/d0/pD1,t0/d0/pE1" });

    expect(result).toStrictEqual([
      {
        path: "t0/d0/pD1",
        ok: false,
        detail: expect.stringContaining("drum pad C1 is empty"),
      },
      {
        path: "t0/d0/pE1",
        ok: false,
        detail: expect.stringContaining("drum pad C1 is empty"),
      },
    ]);
  });

  it("copies to several pads from one call", async () => {
    const rack = registerDrumRack([
      { note: 36, chainIds: ["kick"] },
      { note: 38, chainIds: [] },
      { note: 40, chainIds: [] },
    ]);

    whenCopied(rack, { 38: ["copy38"], 40: ["copy40"] });

    const result = await copyC1ToD1({ toPath: "t0/d0/pD1,t0/d0/pE1" });

    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 40);
    expect(result).toStrictEqual([
      { id: "pad38", path: "t0/d0/pD1" },
      { id: "pad40", path: "t0/d0/pE1" },
    ]);
  });

  // copy_pad layers, so D1's own turn would copy C1's chains along with its own.
  it("refuses a copy onto another source pad before any copy", async () => {
    const rack = registerDrumRack([
      { note: 36, chainIds: ["kick"] },
      { note: 38, chainIds: ["snare"] },
      { note: 40, chainIds: [] },
    ]);

    await expect(
      duplicate({
        type: "drum-pad",
        id: "pad36,pad38",
        toPath: "t0/d0/pD1,t0/d0/pE1",
      }),
    ).rejects.toThrow(
      'a copy to "t0/d0/pD1" would overwrite id "pad38", another source of ' +
        "this call; list it before this one, or duplicate it in its own " +
        "call first",
    );

    expectNoCopy(rack);
  });

  it("copies onto an earlier source pad once its turn has run", async () => {
    const rack = registerDrumRack([
      { note: 36, chainIds: ["kick"] },
      { note: 38, chainIds: ["snare"] },
      { note: 40, chainIds: [] },
    ]);

    await duplicate({
      type: "drum-pad",
      id: "pad36,pad38",
      toPath: "t0/d0/pE1,t0/d0/pC1",
    });

    expect(rack.call).toHaveBeenNthCalledWith(1, "copy_pad", 36, 40);
    expect(rack.call).toHaveBeenNthCalledWith(2, "copy_pad", 38, 36);
  });

  // Each is refused on its own entry, so the check for a copy onto another
  // source leaves both alone.
  it("leaves a chain source and a bad destination to their own entries", async () => {
    const rack = registerCopyReadyRack();

    const result = await duplicate({
      type: "drum-pad",
      id: "pad36,kick",
      toPath: "t0/d0/pD1,t0/d0/pC1/d0",
    });

    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(result).toStrictEqual([
      { id: "pad38", path: "t0/d0/pD1" },
      expect.objectContaining({ ok: false }),
    ]);
  });

  it("requires toPath, which has no sensible default for a pad", async () => {
    registerDrumRack([{ note: 36, chainIds: ["kick"] }]);

    await expect(duplicate({ type: "drum-pad", id: "pad36" })).rejects.toThrow(
      "toPath is required for drum pads",
    );
  });

  it("requires a source", async () => {
    await expect(copyC1ToD1({ id: "" })).rejects.toThrow(
      "id or path is required",
    );
  });

  it("copies from a source path instead of an id", async () => {
    const rack = registerCopyReadyRack();

    const result = await duplicate({
      type: "drum-pad",
      path: "t0/d0/pC1",
      toPath: "t0/d0/pD1",
    });

    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(result).toStrictEqual({ id: "pad38", path: "t0/d0/pD1" });
  });

  // The warning says what the path named; the refusal says the call is off.
  it("blames the source path, not toPath, when the source is the bad one", async () => {
    const rack = registerDrumRack([{ note: 36, chainIds: ["kick"] }]);

    await expect(
      duplicate({
        type: "drum-pad",
        path: "t0/d0/pC1/d0",
        toPath: "t0/d0/pD1",
      }),
    ).rejects.toThrow('nothing to duplicate at path "t0/d0/pC1/d0"');

    expectNoCopy(rack);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('path "t0/d0/pC1/d0" names something inside'),
    );
  });

  it("copies from an id and a path together, which name different pads", async () => {
    const rack = registerDrumRack([
      { note: 36, chainIds: ["kick"] },
      { note: 40, chainIds: ["tom"] },
      { note: 38, chainIds: [] },
      { note: 41, chainIds: [] },
    ]);

    whenCopied(rack, { 38: ["kickCopy"], 41: ["tomCopy"] });

    const result = await duplicate({
      type: "drum-pad",
      id: "pad36",
      path: "t0/d0/pE1",
      toPath: "t0/d0/pD1,t0/d0/pF1",
    });

    expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
    expect(rack.call).toHaveBeenCalledWith("copy_pad", 40, 41);
    expect(result).toStrictEqual([
      { id: "pad38", path: "t0/d0/pD1" },
      { id: "pad41", path: "t0/d0/pF1" },
    ]);
  });

  // Both spellings are published, so a model that picks one and nulls the other
  // sends "null" for it. Counting that as sent refused the copy outright.
  it.each(["id", "path"] as const)(
    "copies when %s is a coerced null and the other names the pad",
    async (param) => {
      const rack = registerCopyReadyRack();
      const named = param === "id" ? { path: "t0/d0/pC1" } : {};

      const result = await copyC1ToD1({ ...named, [param]: "null" });

      expect(rack.call).toHaveBeenCalledWith("copy_pad", 36, 38);
      expect(result).toStrictEqual({ id: "pad38", path: "t0/d0/pD1" });
      expect(consoleMock.warn).toHaveBeenCalledWith(
        `${param} "null" names nothing`,
      );
    },
  );

  it("warns that count does not apply", async () => {
    registerCopyReadyRack();

    await copyC1ToD1({ count: 3 });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("count 3 ignored"),
    );
  });

  it("refuses a chain id, which would copy the pad's other chains too", async () => {
    // A chain passes the tool's drum-pad type check, but copy_pad works on the
    // whole pad — so a chain id names less than the copy would take.
    const rack = registerCopyReadyRack();

    await expect(copyC1ToD1({ id: "kick" })).rejects.toThrow(
      "is a chain, not a drum pad",
    );
    expectNoCopy(rack);
  });

  it("refuses a copy that had no effect", async () => {
    // No chains land on note 38, so the destination pad stays empty.
    registerCopyReadyRack([]);

    await expect(copyC1ToD1()).rejects.toThrow("had no effect");
  });
});
