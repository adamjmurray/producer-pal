// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { codeExecFailure } from "#src/tools/clip/code-exec/tests/code-exec-test-helpers.ts";
import {
  setupSingleArrangementClip,
  setupMidiClipMock,
  setupMockProperties,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { setupResizableClip } from "#src/tools/clip/update/helpers/arrangement/resizable-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { applyCodeToWrittenClips } from "#src/tools/clip/update/helpers/call/apply-clip-code.ts";
import { newClipReasons } from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import {
  CLIP_IS_ENVELOPE,
  ignoredText,
} from "#src/shared/max/ignored-wording.ts";
import { registerMoveToEmptySlot } from "../session/slot-move-fixtures.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/code-exec-v8-protocol.ts"),
  () => ({
    executeNoteCode: vi.fn(),
    executeNoteCodeWithData: vi.fn(),
    requestCodeExecution: vi.fn(),
    handleCodeExecResult: vi.fn(),
  }),
);

import { executeNoteCode } from "#src/live-api-adapter/protocols/code-exec-v8-protocol.ts";

// A code failure on a clip the call re-creates by moving it is filed under the
// clip the call named, which is what the entry is settled by.
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
    registerMoveToEmptySlot();

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

  // A clip resized in place keeps its id, but the resize landed: the failed
  // code is a detail on a real entry, not a refusal that hides it.
  it("keeps the entry of a lone clip that was lengthened", async () => {
    const { sourceClip } = setupResizableClip();

    expect(
      await updateClip({ id: "789", arrangementLength: "3bar", code: "x" }),
    ).toStrictEqual({
      id: "789",
      path: "t0[1|1]",
      detail: "code failed: Boom",
    });
    expect(sourceClip.properties.end_time).toBe(12);
    expect(capturedWarnings()).toStrictEqual([]);
  });

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

  // Pieces of one clip run the same code, so they would say the same thing.
  describe("on several pieces of one clip", () => {
    it("says a failure once", async () => {
      setupMidiClipMock(mocks.clip123);
      setupMidiClipMock(mocks.clip456);

      const reasons = newClipReasons();

      await applyCodeToWrittenClips(
        [{ id: "123" }, { id: "456" }],
        reasons,
        "123",
        0,
        1,
        "x",
      );

      expect(reasons.said.get("123")).toStrictEqual(["code failed: Boom"]);
    });

    it("says once that code can't reach their notes", async () => {
      for (const [id, slot] of [
        ["r1", 0],
        ["r2", 1],
      ] as const) {
        registerMockObject(id, {
          path: livePath.returnTrack(0).clipSlot(slot).clip(),
          type: "Clip",
        });
      }

      const reasons = newClipReasons();

      await applyCodeToWrittenClips(
        [{ id: "r1" }, { id: "r2" }],
        reasons,
        "r1",
        0,
        1,
        "x",
      );

      expect(reasons.said.get("r1")).toStrictEqual([
        ignoredText("code", CLIP_IS_ENVELOPE),
      ]);
    });
  });
});
