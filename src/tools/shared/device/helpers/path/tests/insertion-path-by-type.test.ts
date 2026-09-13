// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A trailing `inst`/`mfx<n>`/`afx<n>` is an insert position like `d<n>`, so it
// has to resolve to one before create-device reads the position off it.

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  insertionContainerPath,
  resolveInsertionPath,
  resolvePathToLiveApi,
} from "../insertion-path.ts";

/**
 * Register track 0 holding an audio effect, optionally behind an instrument.
 * @param withInstrument - Whether the track holds an instrument
 */
function registerTrack(withInstrument: boolean): void {
  const ids = withInstrument ? ["inst", "afx"] : ["afx"];

  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children(...ids) },
  });

  if (withInstrument) {
    registerMockObject("inst", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    });
  }

  registerMockObject("afx", {
    path: livePath.track(0).device(withInstrument ? 1 : 0),
    type: "Device",
    properties: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
  });
}

describe("resolveInsertionPath by device type", () => {
  it("inserts at the position the type segment names", () => {
    registerTrack(true);

    const resolved = resolveInsertionPath("t0/afx0");

    expect(resolved.container?.path).toBe(String(livePath.track(0)));
    expect(resolved.position).toBe(1);
    expect(resolved.containerPath).toBe("t0");
  });

  // Nothing to insert into, so create-device reports the container missing —
  // and the container it names is the one the call wrote, not the substituted
  // index, which names nothing.
  it("reports no container when the type segment names nothing", () => {
    registerTrack(false);

    expect(resolveInsertionPath("t0/inst/c0")).toStrictEqual({
      container: null,
      position: null,
      containerPath: "t0/inst/c0",
      namesNothing: true,
    });
  });
});

describe("resolvePathToLiveApi by device type", () => {
  // A result reads its path off this, so the type spelling must not survive
  // into it — unless nothing resolved, when the error should quote the call.
  it("spells the resolved path by position, or as written when nothing resolved", () => {
    registerTrack(true);

    expect(resolvePathToLiveApi("t0/afx0").path).toBe("t0/d1");
    expect(resolvePathToLiveApi("t0/mfx0").path).toBe("t0/mfx0");
  });
});

describe("insertionContainerPath by device type", () => {
  it("drops a trailing type segment without reading anything", () => {
    expect(insertionContainerPath("t0/afx0")).toBe("t0");
    expect(insertionContainerPath("t0/d0/pC1/mfx1")).toBe("t0/d0/pC1");
    // A path the grammar rejects still comes back trimmed, never naming the
    // object inside the container.
    expect(insertionContainerPath("t0/nope/inst")).toBe("t0/nope");
  });
});
