// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectNoNotesApiCalls,
  type MidiClipEra,
  setMidiClipType,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { codeExecSuccess } from "#src/tools/clip/code-exec/tests/code-exec-test-helpers.ts";
import {
  mockMergeNoteTracking,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { registerMoveToEmptySlot } from "#src/tools/clip/update/tests/session/slot-move-fixtures.ts";
import {
  failOnSet,
  LIVE_FAILURE,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";

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

const REASON = "the clip is a step sequencer";
const C3 = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};

describe("updateClip - a Live 13 step sequencer clip takes no note work", () => {
  let mocks: UpdateClipMocks;

  /**
   * Set clip 123 up as a MIDI clip of the given era.
   * @param era - Which Live's `midi_clip_type` answer it gives
   */
  function midiClip(era: MidiClipEra): void {
    setupMidiClipMock(mocks.clip123, { length: 4 });
    setMidiClipType(mocks.clip123, era);
    mockMergeNoteTracking(mocks.clip123, [{ ...C3 }]);
  }

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    vi.mocked(executeNoteCode).mockReset();
  });

  describe("on a step sequencer clip", () => {
    beforeEach(() => {
      midiClip("step-sequencer");
    });

    it.each([
      ["notes", { notes: "C3 1|1" }, `notes ignored: ${REASON}`],
      [
        "preTransforms",
        { preTransforms: "velocity = 50" },
        `preTransforms ignored: ${REASON}`,
      ],
      [
        "transforms",
        { transforms: "velocity = 50" },
        `transforms ignored: ${REASON}`,
      ],
      [
        "transforms with an audio-only statement",
        { transforms: "gain = 3" },
        `transforms ignored: ${REASON}`,
      ],
      ["quantize", { quantize: 0.5 }, `quantize ignored: ${REASON}`],
      [
        "quantizeGrid and quantizePitch",
        { quantizeGrid: "1/8", quantizePitch: "C3" },
        `quantizeGrid, quantizePitch ignored: ${REASON}`,
      ],
      [
        "duplicateLoop",
        { duplicateLoop: true },
        `duplicateLoop ignored: ${REASON}`,
      ],
      ["code", { code: "return notes" }, `code ignored: ${REASON}`],
    ])(
      "refuses a lone clip's %s, and touches no notes",
      async (_n, args, why) => {
        await expect(updateClip({ id: "123", ...args })).rejects.toThrow(why);

        expectNoNotesApiCalls(mocks.clip123);
        expect(executeNoteCode).not.toHaveBeenCalled();
        expect(capturedWarnings()).toStrictEqual([]);
      },
    );

    it("lands the name and says what it ignored, as audio does", async () => {
      const result = await updateClip({
        id: "123",
        name: "Beat",
        notes: "C3 1|1",
        transforms: "velocity = 50",
        quantize: 1,
      });

      expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Beat");
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/s0",
        detail: [
          `notes ignored: ${REASON}`,
          `transforms ignored: ${REASON}`,
          `quantize ignored: ${REASON}`,
        ].join("; "),
      });
      expectNoNotesApiCalls(mocks.clip123);
    });

    it("answers a batch per clip: writes the notes clip, skips the step sequencer one", async () => {
      setupMidiClipMock(mocks.clip456, { length: 4 });
      setMidiClipType(mocks.clip456, "notes");
      mockMergeNoteTracking(mocks.clip456, []);

      const result = await updateClip({ ids: "123,456", notes: "C3 1|1" });

      expect(result).toStrictEqual([
        { id: "123", ok: false, detail: `notes ignored: ${REASON}` },
        { id: "456", path: "t1/s1", noteCount: 1 },
      ]);
      expect(mocks.clip456.call).toHaveBeenCalledWith(
        "add_new_notes",
        expect.anything(),
      );
      expectNoNotesApiCalls(mocks.clip123);
    });

    it("never reads midi_clip_type for a call that touches no notes", async () => {
      await updateClip({ id: "123", name: "Beat" });

      expect(mocks.clip123.get).not.toHaveBeenCalledWith("midi_clip_type");
    });

    it("does not read note edits it ignores, so unreadable ones don't refuse the call", async () => {
      const result = await updateClip({
        id: "123",
        name: "Beat",
        notes: "not notation at all (",
      });

      expect(result).toStrictEqual(
        expect.objectContaining({
          id: "123",
          detail: `notes ignored: ${REASON}`,
        }),
      );
    });

    it("runs code for the notes clip beside it and ignores it once for this one", async () => {
      setupMidiClipMock(mocks.clip456, { length: 4 });
      setMidiClipType(mocks.clip456, "notes");
      vi.mocked(executeNoteCode).mockResolvedValue(codeExecSuccess([]));

      const result = await updateClip({ ids: "123,456", code: "return []" });

      expect(result).toStrictEqual([
        { id: "123", ok: false, detail: `code ignored: ${REASON}` },
        expect.objectContaining({ id: "456", path: "t1/s1" }),
      ]);
      expect(executeNoteCode).toHaveBeenCalledOnce();
      expectNoNotesApiCalls(mocks.clip123);
    });

    it.each(["transforms", "preTransforms"])(
      "refuses a %s string that can't be parsed, as it does for a notes clip",
      async (param) => {
        await expect(
          updateClip({ id: "123", name: "Beat", [param]: "velocity = (" }),
        ).rejects.toThrow("transform syntax error");

        expect(mocks.clip123.set).not.toHaveBeenCalled();
        expectNoNotesApiCalls(mocks.clip123);
      },
    );

    it("copies to another slot the way Live does, and stays a step sequencer clip", async () => {
      registerMoveToEmptySlot();

      const result = await updateClip({ id: "123", toPath: "t1/s2" });

      expect(result).toStrictEqual(
        expect.objectContaining({ id: "t1/s2/clip", path: "t1/s2" }),
      );
      expectNoNotesApiCalls(mocks.clip123);
    });

    it("keeps the clip-level properties working", async () => {
      const result = await updateClip({
        id: "123",
        looping: true,
        color: "#FF3636",
        timeSignature: "3/4",
      });

      expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
      expect(mocks.clip123.set.mock.calls.map(([prop]) => prop)).toStrictEqual(
        expect.arrayContaining(["looping", "signature_numerator", "color"]),
      );
      expectNoNotesApiCalls(mocks.clip123);
    });

    it("keeps the name it set when a later write throws, and still names the ignore", async () => {
      failOnSet(mocks.clip123, "color");

      const result = await updateClip({
        id: "123",
        name: "Beat",
        color: "#FF0000",
        notes: "C3 1|1",
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0/s0",
        detail: expect.stringContaining(
          `${LIVE_FAILURE}; already changed: name`,
        ),
      });
      expectNoNotesApiCalls(mocks.clip123);
    });
  });

  describe.each<[MidiClipEra, string]>([
    ["notes", "a Live 13 notes clip"],
    ["live-12", "a Live 12 clip"],
  ])("on %s (%s)", (era) => {
    beforeEach(() => {
      midiClip(era);
    });

    it("merges notes exactly as before", async () => {
      const result = await updateClip({ id: "123", notes: "D3 1|2" });

      expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 });
      expect(mocks.clip123.call).toHaveBeenCalledWith(
        "add_new_notes",
        expect.anything(),
      );
    });

    it("quantizes exactly as before", async () => {
      const result = await updateClip({ id: "123", quantize: 1 });

      expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
      expect(mocks.clip123.call).toHaveBeenCalledWith(
        "quantize",
        expect.any(Number),
        1,
      );
    });

    it("runs code exactly as before", async () => {
      vi.mocked(executeNoteCode).mockResolvedValue(codeExecSuccess([]));

      await updateClip({ id: "123", code: "return notes" });

      expect(executeNoteCode).toHaveBeenCalledOnce();
    });
  });
});
