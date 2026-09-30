// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  overrideCall,
  requireMockObject,
  requireMockTrack,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { codeExecFailure } from "#src/tools/clip/code-exec/tests/code-exec-test-helpers.ts";
import {
  setupArrangementClipPath,
  setupSingleArrangementClip,
  setupMidiClipMock,
  setupMockProperties,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
  executeNoteCodeWithData: vi.fn(),
  requestCodeExecution: vi.fn(),
  handleCodeExecResult: vi.fn(),
}));

import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";

// A code failure on a clip the call re-creates (moved, or tiled into copies)
// is filed under the clip the call named, which is what the entry is settled by.
describe("updateClip - code failure on a re-created clip", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    vi.mocked(executeNoteCode).mockResolvedValue(codeExecFailure("Boom"));
  });

  it("reports it on a moved clip's entry, with no warning", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNonExistentObjects();
    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });
    registerMockObject("t0/s0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
    });
    registerMockObject("t1/s2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 0 },
    });
    registerMockObject("t1/s2/clip", {
      path: livePath.track(1).clipSlot(2).clip(),
    });

    // The move landed, so the clip keeps its entry with the reason on it.
    expect(
      await updateClip({ path: "t0/s0", toPath: "t1/s2", code: "x" }),
    ).toStrictEqual({
      id: "t1/s2/clip",
      path: "t1/s2",
      detail: "code failed: Boom",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("reports it once on a tiled clip's entry", async () => {
    const clips = setupArrangementClipPath(0, ["789", "1000"]);
    const source = clips.get("789");
    const copy = clips.get("1000");

    if (source == null || copy == null) {
      throw new Error("Expected arrangement clip mocks");
    }

    setupMockProperties(source, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      is_audio_clip: 0,
      start_time: 0,
      end_time: 4,
      loop_start: 0,
      loop_end: 12,
      end_marker: 12,
      start_marker: 0,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex: 0,
    });
    setupMockProperties(copy, { end_time: 12, start_marker: 0, loop_start: 0 });
    setupMockProperties(requireMockObject("live_set"), {
      tracks: ["id", 0],
      signature_numerator: 4,
      signature_denominator: 4,
    });
    setupMockProperties(requireMockObject(livePath.track(0)), {
      arrangement_clips: ["id", 789],
    });
    overrideCall(requireMockTrack(0), (method) =>
      method === "duplicate_clip_to_arrangement"
        ? "id 1000"
        : USE_CALL_FALLBACK,
    );

    const result = await updateClip({
      id: "789",
      arrangementLength: "3bar",
      code: "x",
    });

    expect(result).toStrictEqual([
      { id: "789", path: "t0[1|1]", detail: "code failed: Boom" },
      { id: "1000", path: "t0[1|1]" },
      { id: "1000", path: "t0[1|1]" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // A clip cut in place keeps its id, but the cut landed: the failed code is a
  // detail on a real entry, not a refusal that hides it.
  describe("when the clip was updated in place", () => {
    beforeEach(() => {
      const { sourceClip } = setupSingleArrangementClip(0);

      setupMockProperties(sourceClip, {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 0,
        end_time: 16,
        signature_numerator: 4,
        signature_denominator: 4,
        trackIndex: 0,
      });
    });

    it("keeps the entry of a lone clip that was shortened", async () => {
      expect(
        await updateClip({ id: "789", arrangementLength: "2bar", code: "x" }),
      ).toStrictEqual({
        id: "789",
        path: "t0[1|1]",
        detail: "code failed: Boom",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("keeps the entry of a shortened clip in a batch", async () => {
      const result = (await updateClip({
        id: "789,789",
        arrangementLength: "2bar",
        code: "x",
      })) as object[];

      expect(result[0]).not.toHaveProperty("ok");
    });

    it("keeps the entry of a renamed clip whose code failed", async () => {
      setupMidiClipMock(mocks.clip123);

      expect(
        await updateClip({ id: "123", name: "Renamed", code: "x" }),
      ).toStrictEqual({
        id: "123",
        path: "t0/s0",
        detail: "code failed: Boom",
      });
    });
  });
});
