// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  beginWarningCapture,
  changedNothing,
  recordWriteRun,
} from "#src/shared/max/v8-warning-capture.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import {
  LIVE_FAILURE,
  failCall,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMissingScenes } from "../create-missing-scenes.ts";

/**
 * Register the Live Set with a given number of scenes.
 * @param sceneCount - How many scenes it holds
 * @returns The mock Live Set
 */
function registerLiveSet(sceneCount: number) {
  const scenes: (string | number)[] = [];

  for (let index = 0; index < sceneCount; index++) {
    scenes.push("id", index + 1);
  }

  return registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { scenes },
  });
}

describe("createMissingScenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates nothing for a scene that is already there", () => {
    const liveSet = registerLiveSet(3);

    expect(createMissingScenes(2, LiveAPI.from(livePath.liveSet))).toBeNull();
    expect(liveSet.call).not.toHaveBeenCalledWith("create_scene", -1);
  });

  it("creates the one scene just past the end", () => {
    const liveSet = registerLiveSet(3);

    expect(createMissingScenes(3, LiveAPI.from(livePath.liveSet))).toBe("s3");
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });

  it("creates a run of scenes and names its ends", () => {
    const liveSet = registerLiveSet(3);

    expect(createMissingScenes(5, LiveAPI.from(livePath.liveSet))).toBe(
      "s3-s5",
    );
    expect(liveSet.call).toHaveBeenCalledTimes(3);
  });

  it("counts the scenes made before Live refuses one as a change", () => {
    const liveSet = registerLiveSet(1);

    failCall(liveSet, /^create_scene$/, 2);

    const capture = beginWarningCapture();

    expect(() => createMissingScenes(3)).toThrow(LIVE_FAILURE);
    // The pipeline's verdict for a target that ended as a skip.
    recordWriteRun(true);
    expect(changedNothing(capture)).toBe(false);
  });

  it("finds the Live Set itself when the caller has none", () => {
    const liveSet = registerLiveSet(1);

    expect(createMissingScenes(1)).toBe("s1");
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", -1);
  });

  it("refuses a scene past the cap, creating nothing", () => {
    // The boundary: MAX >= MAX must throw, and the message names the last
    // index that does auto-create.
    const liveSet = registerLiveSet(3);

    expect(() =>
      createMissingScenes(
        MAX_AUTO_CREATED_SCENES,
        LiveAPI.from(livePath.liveSet),
      ),
    ).toThrow(
      `scene "s${MAX_AUTO_CREATED_SCENES}" is out of range: scenes auto-create only through "s${MAX_AUTO_CREATED_SCENES - 1}"`,
    );
    expect(liveSet.call).not.toHaveBeenCalledWith("create_scene", -1);
  });
});
