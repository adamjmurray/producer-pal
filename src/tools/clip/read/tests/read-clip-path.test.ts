// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as console from "#src/shared/max/v8-max-console.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { toolDefReadClip } from "#src/tools/clip/read/read-clip.def.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { unsetEmptyParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";
import { setupMidiClipMock } from "./read-clip-test-helpers.ts";

// A caller that sends every param, filling the ones it has no value for with
// null, must not be read as having named t0/s0. z.coerce.number() turns both a
// null and a blank into 0, so this goes through the schema the tool registers,
// not straight to the handler.
describe("readClip location params through the tool schema", () => {
  const params = resolveToolSchema(
    toolDefReadClip.toolOptions.inputSchema,
    {},
  ).validating;

  it.each([
    ["null", null],
    ["blank", ""],
  ])("refuses a %s trackIndex/sceneIndex instead of reading t0/s0", (_l, v) => {
    const raw = { id: null, trackIndex: v, sceneIndex: v };
    const args = z.object(params).parse(unsetEmptyParams(raw, params));

    expect(args.trackIndex).toBeUndefined();
    expect(args.sceneIndex).toBeUndefined();
    expect(() => readClip(args)).toThrow("id or path is required");
  });
});

describe("readClip path param", () => {
  it("reads the clip at a clip slot", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    const result = readClip({ path: "t1/s1" });

    expect(result.name).toBe("Test Clip");
  });

  // A track holds one clip per scene, so a path without a scene names nothing
  // in particular.
  it("rejects a bare track path", () => {
    expect(() => readClip({ path: "t1" })).toThrow(
      'invalid path "t1" - a track has no one clip',
    );
  });

  // The grammar bounds no index, so "t99" parses and the existence check
  // downstream is the only thing standing between it and a wrong read.
  it("rejects a well-formed path that points at no track", () => {
    mockNonExistentObjects();

    expect(() => readClip({ path: "t99/s0" })).toThrow('no track at "t99"');
  });

  // read-clip REPORTS "t3/l0" for a take-lane clip but won't take it back —
  // this reader only walks the session grid, and a take lane holds arrangement
  // clips. Pinned because it's the one place a result path doesn't paste back,
  // so the error has to name the spelling that does.
  it("rejects a take lane path and names what to send instead", () => {
    expect(() => readClip({ path: "t1/l0" })).toThrow(
      'invalid path "t1/l0" - take lanes hold arrangement clips; ' +
        'name a clip slot as "t<track>/s<scene>" (e.g., "t1/s0")',
    );
  });

  // What results said before 2.2.0, so a model pasting one back made a
  // well-founded guess: honor it, and warn to teach the spelling.
  it("honors the old unprefixed spelling, with a warning", () => {
    const warn = vi.spyOn(console, "warn");

    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ path: "1/1" }).name).toBe("Test Clip");
    expect(warn).toHaveBeenCalledWith(
      'path "1/1" is the old slot spelling; use "t1/s1"',
    );
  });

  it("still reads via the deprecated slot", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ slot: "1/1" }).name).toBe("Test Clip");
  });

  // The alias read-clip already accepted undeclared, now a real hidden param.
  it("reads via the trackIndex/sceneIndex fallback", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ trackIndex: 1, sceneIndex: 1 }).name).toBe("Test Clip");
  });

  // A slot that names nothing is not a second clip, so it can't shadow the
  // fallback. It used to throw on the way to parsing it.
  it("falls back to trackIndex/sceneIndex when slot names nothing", () => {
    const warn = vi.spyOn(console, "warn");

    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ slot: ",", trackIndex: 1, sceneIndex: 1 }).name).toBe(
      "Test Clip",
    );
    expect(warn).toHaveBeenCalledWith('slot "," names nothing');
  });

  // Picking one and reading the other clip is the silent wrong-clip bug path
  // replaces — and the framework would then append "the value was honored"
  // about the one that wasn't.
  it("refuses path and slot together instead of picking one", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "From path" },
    });
    setupMidiClipMock({
      trackIndex: 2,
      sceneIndex: 3,
      clipProps: { name: "From slot" },
    });

    expect(() => readClip({ path: "t1/s1", slot: "2/3" })).toThrow(
      "readClip failed: path and slot both name a clip; use path alone (slot is deprecated)",
    );
  });

  // Regression: clipId won in silence, so a model pasting a stale id beside a
  // fresh path got the stale clip back — reported at its own slot, with nothing
  // said about the path it asked for.
  it("refuses an id naming a different clip than path", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipId: "fresh",
      clipProps: { name: "From path" },
    });
    setupMidiClipMock({
      trackIndex: 2,
      sceneIndex: 3,
      clipId: "stale",
      clipProps: { name: "From clipId" },
    });

    expect(() => readClip({ path: "t1/s1", id: "stale" })).toThrow(
      "readClip failed: path and id name different clips; use one",
    );
  });

  it("accepts an id naming the same clip as path", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipId: "fresh",
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ path: "t1/s1", id: "fresh" }).name).toBe("Test Clip");
  });

  // Both addressing params are published side by side ("provide this or path"),
  // so a model filling in the unused one is the expected shape — sometimes with
  // the word written out. Counting that as sent refused the call over a param
  // the caller deliberately left empty.
  it.each(["id", "path"] as const)(
    "reads the clip the other param names when %s is a coerced null",
    (param) => {
      const warn = vi.spyOn(console, "warn");

      setupMidiClipMock({
        trackIndex: 1,
        sceneIndex: 1,
        clipId: "123",
        clipProps: { name: "Test Clip" },
      });

      const named = param === "id" ? { path: "t1/s1" } : { id: "123" };

      expect(readClip({ ...named, [param]: "null" }).name).toBe("Test Clip");
      expect(warn).toHaveBeenCalledWith(`${param} "null" names nothing`);
    },
  );

  // A permanent alias, not a migration: models reach for the prefixed spelling
  // on their own, so it keeps working.
  it("still reads a clip by the clipId alias", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipId: "123",
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ clipId: "123" }).name).toBe("Test Clip");
  });

  // trackIndex/sceneIndex are permanent aliases, not deprecated, so they warn
  // rather than throw — matching create-clip.
  it("warns that trackIndex/sceneIndex went unused when path names the clip", () => {
    const warn = vi.spyOn(console, "warn");

    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "From path" },
    });

    expect(readClip({ path: "t1/s1", trackIndex: 2, sceneIndex: 3 }).name).toBe(
      "From path",
    );
    expect(warn).toHaveBeenCalledWith(
      'readClip: trackIndex/sceneIndex ignored — "path" already names the clip',
    );
  });
});
