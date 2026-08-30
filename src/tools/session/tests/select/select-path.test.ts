// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { toolDefSelect } from "#src/tools/session/select.def.ts";
import { select } from "#src/tools/session/select.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { unsetEmptyParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";
import {
  resetSelectTestState,
  setupAppViewMock,
  setupSongViewMock,
} from "./select-test-helpers.ts";

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => {
  const { selectSharedUtilsMockBody } =
    await import("./select-test-helpers.ts");

  return selectSharedUtilsMockBody(await importOriginal());
});

// One param covers all three shapes select can act on. Which one a path names
// is decided by the grammar, not by which param the caller reached for.
describe("select path param", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  it("selects a clip slot", () => {
    const clipSlot = registerMockObject("clipslot_0_1", {
      path: livePath.track(0).clipSlot(1),
      type: "ClipSlot",
      properties: { has_clip: 0 },
    });
    const songView = setupSongViewMock();

    setupAppViewMock();

    select({ path: "t0/s1" });

    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      `id ${clipSlot.id}`,
    );
  });

  it("selects a device", () => {
    registerMockObject("device_at_path", {
      path: String(livePath.track(1)) + " devices 0",
      type: "Device",
    });
    const songView = setupSongViewMock();

    const result = select({ path: "t1/d0" });

    expect(songView.call).toHaveBeenCalledWith(
      "select_device",
      "id device_at_path",
    );
    expect(result.selectedDevice?.path).toBe("t1/d0");
  });

  it("selects a bare track", () => {
    registerMockObject("track_2", {
      path: livePath.track(2),
      type: "Track",
    });
    const songView = setupSongViewMock();

    select({ path: "t2" });

    expect(songView.set).toHaveBeenCalledWith("selected_track", "id track_2");
  });

  // What results said before 2.2.0, so a model pasting one back made a
  // well-founded guess: honor it, and warn to teach the spelling.
  it("honors the old unprefixed spelling, with a warning", () => {
    const warn = vi.spyOn(console, "warn");
    const songView = setupSongViewMock();

    registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
    });

    select({ path: "0/1" });

    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      expect.anything(),
    );
    expect(warn).toHaveBeenCalledWith(
      'path "0/1" is the old slot spelling; use "t0/s1"',
    );
  });

  // rt0 and mt used to fall through to the device parser, which answered a
  // select call with a message about device indices.
  it("selects a return or master track", () => {
    registerMockObject("return_0", {
      path: livePath.returnTrack(0),
      type: "Track",
    });
    registerMockObject("master", {
      path: livePath.masterTrack(),
      type: "Track",
    });
    const songView = setupSongViewMock();

    select({ path: "rt0" });
    expect(songView.set).toHaveBeenCalledWith("selected_track", "id return_0");

    select({ path: "mt" });
    expect(songView.set).toHaveBeenCalledWith("selected_track", "id master");
  });

  it("selects a scene", () => {
    registerMockObject("scene_3", { path: livePath.scene(3), type: "Scene" });
    const songView = setupSongViewMock();

    select({ path: "s3" });

    expect(songView.set).toHaveBeenCalledWith("selected_scene", "id scene_3");
  });

  // The grammar bounds no index, so "t99" parses and names a track that isn't
  // there. Refuse it in the same words whichever spelling the caller reached
  // for — a selection that quietly doesn't happen reads like one that did.
  it("refuses a track that doesn't exist, path or param", () => {
    mockNonExistentObjects();
    const songView = setupSongViewMock();

    expect(() => select({ path: "t99" })).toThrow(
      'select failed: no track at "t99"',
    );
    expect(() => select({ trackIndex: 99 })).toThrow(
      'select failed: no track at "t99"',
    );
    expect(songView.set).not.toHaveBeenCalledWith(
      "selected_track",
      expect.anything(),
    );
  });

  it("refuses a return or master track that doesn't exist", () => {
    mockNonExistentObjects();
    setupSongViewMock();

    expect(() => select({ path: "rt9" })).toThrow(
      'select failed: no track at "rt9"',
    );
    expect(() => select({ trackType: "return", trackIndex: 9 })).toThrow(
      'select failed: no track at "rt9"',
    );
    expect(() => select({ path: "mt" })).toThrow(
      'select failed: no track at "mt"',
    );
  });

  it("refuses a scene that doesn't exist, path or param", () => {
    mockNonExistentObjects();
    const songView = setupSongViewMock();

    expect(() => select({ path: "s99" })).toThrow(
      'select failed: no scene at "s99"',
    );
    expect(() => select({ sceneIndex: 99 })).toThrow(
      'select failed: no scene at "s99"',
    );
    expect(songView.set).not.toHaveBeenCalledWith(
      "selected_scene",
      expect.anything(),
    );
  });

  // A clip slot names two things, so say which one is missing.
  it("refuses a clip slot, naming the missing half", () => {
    mockNonExistentObjects();
    registerMockObject("track_0", { path: livePath.track(0), type: "Track" });
    registerMockObject("scene_0", { path: livePath.scene(0), type: "Scene" });
    setupSongViewMock();
    setupAppViewMock();

    expect(() => select({ path: "t9/s0" })).toThrow(
      'select failed: no track at "t9"',
    );
    expect(() => select({ path: "t0/s99" })).toThrow(
      'select failed: no scene at "s99"',
    );
    expect(() => select({ slot: "9/0" })).toThrow(
      'select failed: no track at "t9"',
    );

    // Live keeps a clip slot per scene on every track, so a track and scene
    // that both exist should have one — but say so rather than no-op if not.
    expect(() => select({ path: "t0/s0" })).toThrow(
      'select failed: no clip slot at "t0/s0"',
    );
  });

  it("refuses a device that isn't there, path or param", () => {
    mockNonExistentObjects();
    setupSongViewMock();

    expect(() => select({ path: "t0/d9" })).toThrow(
      'select failed: no device at "t0/d9"',
    );
    expect(() => select({ devicePath: "t0/d9" })).toThrow(
      'select failed: no device at "t0/d9"',
    );
  });

  // Nothing is touched until every target checks out, so the view a scene
  // selection would have switched to stays where it was.
  it("leaves the view alone when the target isn't there", () => {
    mockNonExistentObjects();
    setupSongViewMock();

    const appView = setupAppViewMock();

    expect(() => select({ view: "session", path: "s99" })).toThrow(
      'select failed: no scene at "s99"',
    );
    expect(appView.call).not.toHaveBeenCalledWith(
      "show_view",
      expect.anything(),
    );
  });

  // Only a disagreement is worth refusing. A model that says the same thing
  // twice — path plus the param it replaced, in agreement — gets the selection,
  // not an error about how it phrased the request.
  it("accepts a path that agrees with the param it duplicates", () => {
    registerMockObject("track_2", { path: livePath.track(2), type: "Track" });
    registerMockObject("scene_3", { path: livePath.scene(3), type: "Scene" });
    const songView = setupSongViewMock();

    select({ path: "t2", trackIndex: 2 });
    expect(songView.set).toHaveBeenCalledWith("selected_track", "id track_2");

    select({ path: "s3", sceneIndex: 3 });
    expect(songView.set).toHaveBeenCalledWith("selected_scene", "id scene_3");
  });

  // A caller that sends every param, filling the ones it has no value for with
  // null, must not be read as having named a second, conflicting target. This
  // goes through the schema the tool registers, not straight to the handler.
  it.each([
    ["null", null],
    ["blank", ""],
  ])("ignores a %s trackIndex/sceneIndex beside a path", (_label, empty) => {
    registerMockObject("track_5", { path: livePath.track(5), type: "Track" });

    const songView = setupSongViewMock();
    const params = resolveToolSchema(
      toolDefSelect.toolOptions.inputSchema,
      {},
    ).validating;
    const raw = { path: "t5", trackIndex: empty, sceneIndex: empty };

    select(z.object(params).parse(unsetEmptyParams(raw, params)));

    expect(songView.set).toHaveBeenCalledWith("selected_track", "id track_5");
  });

  it("refuses a path that disagrees with the param it duplicates", () => {
    expect(() => select({ path: "t2", trackIndex: 3 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
    expect(() => select({ path: "rt0", trackType: "master" })).toThrow(
      "select failed: path and trackType name different targets",
    );
    expect(() => select({ path: "rt0", trackType: "regular" })).toThrow(
      "select failed: path and trackType name different targets",
    );
    expect(() => select({ path: "s3", sceneIndex: 4 })).toThrow(
      "select failed: path and sceneIndex name different targets",
    );
  });

  // A slot or device path names a track without selecting it — Live moves there
  // with the slot or device. Honoring a conflicting param anyway would select
  // one track and highlight something on another.
  it("refuses a slot or device path that disagrees with a track or scene param", () => {
    expect(() => select({ path: "t0/s3", trackIndex: 5 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
    expect(() => select({ path: "t0/s3", sceneIndex: 7 })).toThrow(
      "select failed: path and sceneIndex name different targets",
    );
    expect(() => select({ path: "t0/s3", trackType: "return" })).toThrow(
      "select failed: path and trackType name different targets",
    );
    expect(() => select({ path: "t0/d1", trackIndex: 5 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
    expect(() => select({ path: "rt0/d1", trackType: "master" })).toThrow(
      "select failed: path and trackType name different targets",
    );
    expect(() => select({ path: "t0/d0/pC1", trackIndex: 5 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
    // The master track has no index, so any explicit one names another track.
    expect(() => select({ path: "mt/d0", trackIndex: 5 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
  });

  it("accepts a slot or device path that agrees with a track or scene param", () => {
    registerMockObject("clipslot_0_3", {
      path: livePath.track(0).clipSlot(3),
      type: "ClipSlot",
      properties: { has_clip: 0 },
    });
    registerMockObject("device_at_path", {
      path: String(livePath.returnTrack(0)) + " devices 1",
      type: "Device",
    });
    const songView = setupSongViewMock();

    setupAppViewMock();

    select({ path: "t0/s3", trackIndex: 0, sceneIndex: 3 });
    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      "id clipslot_0_3",
    );

    expect(() =>
      select({ path: "rt0/d1", trackIndex: 0, trackType: "return" }),
    ).not.toThrow();
  });

  // Regression: trackIndex was compared, trackType was compared, but a
  // trackIndex sent without a trackType defaults to a regular track — so a
  // return path "agreed" with it, then selected regular track 0 while the
  // device went on return track 0.
  it("refuses a return path against a bare trackIndex", () => {
    expect(() => select({ path: "rt0/d1", trackIndex: 0 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
    expect(() => select({ path: "rt0/d0/pC1", trackIndex: 0 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
  });

  // The same rule for a path that selects its track outright. That shape went
  // through merge(), which compares the two categories and so can't see a
  // category the caller never spelled — "rt0" plus trackIndex 0 merged cleanly
  // and selected return track 0.
  it("refuses a bare return or master path against a bare trackIndex", () => {
    expect(() => select({ path: "rt0", trackIndex: 0 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
    expect(() => select({ path: "mt", trackIndex: 0 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
  });

  // Regression: `id` was never checked against `path` at all. Both are written
  // to Live, the last one wins, and the response named the id — so the call
  // selected the path's target and reported the id's.
  it.each([
    ["a track", "track_5", "t0/s3"],
    ["a track", "track_5", "t0/d1"],
    ["a scene", "scene_7", "t0/s3"],
    ["a clip", "clip_elsewhere", "t0/s3"],
  ])("refuses an id naming %s the path doesn't", (_what, id, path) => {
    registerIdConflictObjects();

    expect(() => select({ id, path })).toThrow(
      "select failed: path and id name different targets",
    );
  });

  // A device id was left out of the cross-check, and the two are written
  // separately: select_device put the focus on the id's device, then the slot
  // write moved the selection to the path's track. The response named both.
  it.each([
    ["another track", "device_t5", "t0/s3"],
    ["another track", "device_t5", "t0"],
    ["a return track", "device_rt0", "t0/s3"],
    ["the master track", "device_mt", "t0/s3"],
    ["a regular track", "device_t0", "mt"],
    ["a regular track", "device_t0", "rt0"],
    ["another return track", "device_rt0", "rt1"],
  ])("refuses a device id on %s than the path's", (_what, id, path) => {
    registerIdConflictObjects();

    expect(() => select({ id, path })).toThrow(
      "select failed: path and id name different targets",
    );
  });

  it.each([
    ["a slot path on its track", "device_t0", "t0/s3"],
    ["its own track", "device_t0", "t0"],
    ["its own return track", "device_rt0", "rt0"],
    ["its own master track", "device_mt", "mt"],
  ])("accepts a device id named alongside %s", (_what, id, path) => {
    registerIdConflictObjects();
    setupSongViewMock();
    setupAppViewMock();

    expect(() => select({ id, path })).not.toThrow();
  });

  it("accepts an id naming exactly what the path names", () => {
    registerIdConflictObjects();
    setupSongViewMock();
    setupAppViewMock();

    expect(() => select({ id: "track_0", path: "t0/s3" })).not.toThrow();
    expect(() => select({ id: "scene_3", path: "t0/s3" })).not.toThrow();
    expect(() => select({ id: "clip_0_3", path: "t0/s3" })).not.toThrow();
  });

  it("rejects a take lane, which names no one thing to select", () => {
    expect(() => select({ path: "t0/l1" })).toThrow(
      /a take lane is not selectable/,
    );
  });

  // z.coerce.string() renders a JSON null as "null". Counting it as a target
  // refused a call that named exactly one.
  it("selects what slot names when path is a coerced null", () => {
    const warn = vi.spyOn(console, "warn");
    const clipSlot = registerMockObject("clipslot_0_1", {
      path: livePath.track(0).clipSlot(1),
      type: "ClipSlot",
      properties: { has_clip: 0 },
    });
    const songView = setupSongViewMock();

    setupAppViewMock();

    select({ path: "null", slot: "0/1" });

    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      `id ${clipSlot.id}`,
    );
    expect(warn).toHaveBeenCalledWith('path "null" names nothing');
  });

  it("refuses path alongside a param it replaced", () => {
    expect(() => select({ path: "t0/s1", slot: "0/1" })).toThrow(
      "select failed: path and slot/devicePath both name a target",
    );
    expect(() => select({ path: "t0/d1", devicePath: "t0/d1" })).toThrow(
      "select failed: path and slot/devicePath both name a target",
    );
  });

  // The same check, on a deprecated param that named nothing. A comma is not a
  // second target, so refusing reported a conflict the caller never made.
  it("selects what path names when the param it replaced names nothing", () => {
    const warn = vi.spyOn(console, "warn");
    const clipSlot = registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
      type: "ClipSlot",
      properties: { has_clip: 0 },
    });
    const songView = setupSongViewMock();

    setupAppViewMock();

    select({ path: "t0/s1", slot: "," });

    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      `id ${clipSlot.id}`,
    );
    expect(warn).toHaveBeenCalledWith('slot "," names nothing');
  });

  // On its own it leaves select with no target, which is select's read mode.
  // That reports the selection Live actually has, so nothing claims a move that
  // didn't happen — the warning is what tells the caller why.
  it("reads the current selection when the only param sent names nothing", () => {
    const warn = vi.spyOn(console, "warn");
    const songView = setupSongViewMock();

    setupAppViewMock();

    const result = select({ slot: "," });

    expect(result.selectedClip).toBeUndefined();
    expect(songView.set).not.toHaveBeenCalledWith(
      "highlighted_clip_slot",
      expect.anything(),
    );
    expect(warn).toHaveBeenCalledWith('slot "," names nothing');
  });
});

/** The tracks, scenes, and clips the id-versus-path cases pick between. */
function registerIdConflictObjects(): void {
  registerMockObject("track_0", { path: livePath.track(0), type: "Track" });
  registerMockObject("track_5", { path: livePath.track(5), type: "Track" });
  registerMockObject("scene_3", { path: livePath.scene(3), type: "Scene" });
  registerMockObject("scene_7", { path: livePath.scene(7), type: "Scene" });
  registerMockObject("clipslot_0_3", {
    path: livePath.track(0).clipSlot(3),
    type: "ClipSlot",
    properties: { has_clip: 1 },
  });
  registerMockObject("clip_0_3", {
    path: livePath.track(0).clipSlot(3).clip(),
    type: "Clip",
  });
  registerMockObject("clip_elsewhere", {
    path: livePath.track(2).clipSlot(1).clip(),
    type: "Clip",
  });
  registerMockObject("device_t0", {
    path: livePath.track(0).device(1),
    type: "Device",
  });
  registerMockObject("device_t5", {
    path: livePath.track(5).device(1),
    type: "Device",
  });
  registerMockObject("device_rt0", {
    path: livePath.returnTrack(0).device(1),
    type: "Device",
  });
  registerMockObject("device_mt", {
    path: livePath.masterTrack().device(1),
    type: "Device",
  });
}
