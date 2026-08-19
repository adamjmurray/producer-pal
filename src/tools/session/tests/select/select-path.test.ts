// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/session/select.ts";
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

  it("selects a session position", () => {
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

  // A session position names two things, so say which one is missing.
  it("refuses a session position, naming the missing half", () => {
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

  it("refuses a path that disagrees with the param it duplicates", () => {
    expect(() => select({ path: "t2", trackIndex: 3 })).toThrow(
      "select failed: path and trackIndex name different targets",
    );
    expect(() => select({ path: "rt0", trackType: "master" })).toThrow(
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
});
