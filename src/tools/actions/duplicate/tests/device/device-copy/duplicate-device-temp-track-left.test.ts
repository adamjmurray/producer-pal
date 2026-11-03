// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device copy that failed and couldn't delete its temp track leaves a whole
// track copy in the Set, so the call has changed it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginWarningCapture,
  changedNothing,
} from "#src/shared/max/v8-warning-capture.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { setupDeviceDuplicationMocks } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { remoteScriptDown } from "#src/tools/actions/duplicate/helpers/device/remote-script-down-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn(() => {
    throw new Error("nope");
  }),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
}));

describe("duplicate device - a failed copy whose temp track stays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remoteScriptDown();
  });

  it.each([
    ["changed nothing when the temp track is deleted", false, true],
    ["may have changed something when it can't be deleted", true, false],
  ])("%s", async (_what, deleteFails, unchanged) => {
    const { liveSet } = setupDeviceDuplicationMocks();

    if (deleteFails) {
      liveSet.methods.delete_track = () => {
        throw new Error("Live is busy");
      };
    }

    const capture = beginWarningCapture();

    await expect(
      duplicate({ type: "device", id: "device1", toPath: "t2/d0" }),
    ).rejects.toThrow("nope");
    expect(changedNothing(capture)).toBe(unchanged);
  });
});
