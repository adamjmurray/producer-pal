// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live can throw partway through a clip's update. What already landed stays, so
// the clip keeps its normal entry — naming what exists now — with a detail for
// what landed and what didn't, no `ok`, and the targets after it still run.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  overrideCall,
  requireMockObject,
  requireMockTrack,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  setupArrangementClipPath,
  setupMidiClipMock,
  setupMockProperties,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { setUpArrangementPair } from "../move-order/arrangement-pair-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
  executeNoteCodeWithData: vi.fn(),
  requestCodeExecution: vi.fn(),
  handleCodeExecResult: vi.fn(),
}));

import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";
import { codeExecSuccess } from "#src/tools/clip/code-exec/tests/code-exec-test-helpers.ts";

const REFUSED = "Live refused";

/**
 * Make a mock refuse one property write.
 * @param mock - The registered object
 * @param property - The property whose write throws
 */
function refuseSet(mock: RegisteredMockObject, property: string): void {
  mock.set.mockImplementation((written: string) => {
    if (written === property) {
      throw new Error(REFUSED);
    }
  });
}

describe("updateClip - Live throws after something of a clip landed", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    vi.mocked(executeNoteCode).mockReset();
  });

  describe("properties", () => {
    it("keeps the name that was set when the color is refused, and still runs the next clip", async () => {
      setupMidiClipMock(mocks.clip123);
      setupMidiClipMock(mocks.clip456);
      refuseSet(mocks.clip123, "color");

      const result = await updateClip({
        id: "123,456",
        name: "A,B",
        color: "#FF0000",
      });

      expect(result).toStrictEqual([
        {
          id: "123",
          path: "t0/s0",
          detail: `${REFUSED}; already changed: name`,
        },
        expect.objectContaining({ id: "456", path: "t1/s1" }),
      ]);
      expect(mocks.clip456.set).toHaveBeenCalledWith("name", "B");
      expect(result).not.toContainEqual(expect.objectContaining({ ok: false }));
    });

    it("names every property that landed, once each, in the order they did", async () => {
      setupMidiClipMock(mocks.clip123, { length: 4 });
      refuseSet(mocks.clip123, "end_marker");

      const result = await updateClip({
        id: "123",
        name: "A",
        looping: false,
        length: "2bar",
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0/s0",
        detail: expect.stringMatching(
          /^Live refused; already changed: name, .*region/,
        ),
      });
    });

    it("names a landed meter as the time signature, once", async () => {
      setupMidiClipMock(mocks.clip123, { length: 4 });
      refuseSet(mocks.clip123, "end_marker");

      const result = await updateClip({
        id: "123",
        timeSignature: "3/4",
        length: "1bar",
      });

      expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 3);
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/s0",
        detail: `${REFUSED}; already changed: time signature, region`,
      });
    });

    it("keeps the notes that were written when the quantize is refused", async () => {
      setupMidiClipMock(mocks.clip123, { length: 4 });
      mocks.clip123.call.mockImplementation((method: string) => {
        if (method === "quantize") {
          throw new Error(REFUSED);
        }

        return JSON.stringify({ notes: [] });
      });

      const result = await updateClip({
        id: "123",
        notes: "C3 1|1",
        quantize: 1,
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0/s0",
        detail: `${REFUSED}; already changed: notes`,
      });
    });
  });

  describe("a move into a clip slot", () => {
    /**
     * The slots a move from t0/s0 to t1/s2 needs, and a track that takes it.
     */
    function registerMoveSlots(): void {
      registerMockObject("track-1", {
        path: livePath.track(1),
        properties: { has_midi_input: 1, is_frozen: 0 },
      });

      for (const [track, scene, hasClip] of [
        [0, 0, 1],
        [1, 2, 0],
      ] as const) {
        registerMockObject(`t${track}/s${scene}`, {
          path: livePath.track(track).clipSlot(scene),
          properties: { has_clip: hasClip },
        });

        if (!hasClip) {
          registerMockObject(`t${track}/s${scene}/clip`, {
            path: livePath.track(track).clipSlot(scene).clip(),
          });
        }
      }
    }

    it("reports the clip the copy made when the step after the move throws", async () => {
      setupMidiClipMock(mocks.clip123);
      registerMoveSlots();
      vi.mocked(executeNoteCode).mockRejectedValue(new Error(REFUSED));

      const result = await updateClip({
        id: "123",
        toPath: "t1/s2",
        code: "x",
      });

      // The copy exists and the source is gone: the entry names the copy.
      expect(result).toStrictEqual({
        id: "t1/s2/clip",
        path: "t1/s2",
        detail: `${REFUSED}; already changed: copy at t1/s2`,
      });
    });

    it("still runs the next clip", async () => {
      setupMidiClipMock(mocks.clip123);
      setupMidiClipMock(mocks.clip456);
      registerMoveSlots();
      vi.mocked(executeNoteCode)
        .mockRejectedValueOnce(new Error(REFUSED))
        .mockResolvedValue(codeExecSuccess([]));

      const result = await updateClip({
        id: "123,456",
        toPath: "t1/s2,t1/s1",
        code: "x",
      });

      expect(result).toStrictEqual([
        expect.objectContaining({
          path: "t1/s2",
          detail: `${REFUSED}; already changed: copy at t1/s2`,
        }),
        expect.objectContaining({ id: "456" }),
      ]);
    });
  });
});

describe("updateClip - a clip cleared before its turn", () => {
  it("is skipped with the reason, whatever cleared it", async () => {
    const mocks = setupUpdateClipMocks();

    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
    // The first clip's write is what takes the second one out of the Set.
    mocks.clip123.set.mockImplementation(() => {
      deleteMockObject("456");
    });

    const result = await updateClip({ id: "123,456", name: "A,B" });

    expect(result).toStrictEqual([
      expect.objectContaining({ id: "123" }),
      {
        id: "456",
        ok: false,
        detail: "not updated: the clip was overwritten earlier in this call",
      },
    ]);
  });
});

describe("updateClip - a clip named twice", () => {
  // The later mention re-creates the clip in another slot, so the earlier
  // mention's id and slot name nothing once that lands: it says only what the
  // caller wrote, and was never written.
  it("leaves the earlier mention without the id and slot the later move retires", async () => {
    const mocks = setupUpdateClipMocks();

    setupMidiClipMock(mocks.clip123);
    registerMockObject("track-1", {
      path: livePath.track(1),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });
    registerMockObject("t1/s2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 0 },
    });
    registerMockObject("t1/s2/clip", {
      path: livePath.track(1).clipSlot(2).clip(),
    });
    registerMockObject("t0/s0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
    });

    const result = await updateClip({
      id: "123",
      path: "t0/s0",
      toPath: "t1/s9,t1/s2",
    });

    expect(result).toStrictEqual([
      { id: "123", detail: 'named again as "t0/s0" later in this call' },
      { id: "t1/s2/clip", path: "t1/s2" },
    ]);
  });
});

describe("updateClip - Live throws after an arrangement write landed", () => {
  it("reports the copy a move made when deleting the source throws", async () => {
    const track = setUpArrangementPair();

    overrideCall(track, function (method, id) {
      if (method === "delete_clip" && id === "id 100") {
        throw new Error(REFUSED);
      }

      return USE_CALL_FALLBACK;
    });

    const result = await updateClip({
      id: "100,101",
      arrangementStart: "17|1,25|1",
    });

    // Not the source's id: it is still there, but the clip that moved is the copy.
    expect(result).toStrictEqual([
      {
        id: "copy-1",
        path: expect.any(String),
        detail: expect.stringMatching(
          new RegExp(`^${REFUSED}; already changed: copy at `),
        ),
      },
      expect.objectContaining({ id: "copy-2" }),
    ]);
    expect(result).not.toContainEqual(expect.objectContaining({ ok: false }));
  });

  it("reports the shortened clip when the move after it throws", async () => {
    const track = setUpArrangementPair();

    overrideCall(track, function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        throw new Error(REFUSED);
      }

      return USE_CALL_FALLBACK;
    });

    const result = await updateClip({
      id: "100,101",
      arrangementStart: "17|1,25|1",
      arrangementLength: "2bar",
    });

    // Each clip was cut to 2 bars where it sits; neither move landed.
    expect(result).toStrictEqual([
      {
        id: "100",
        path: expect.any(String),
        detail: `${REFUSED}; already changed: shortened`,
      },
      {
        id: "101",
        path: expect.any(String),
        detail: `${REFUSED}; already changed: shortened`,
      },
    ]);
  });

  it("reports a tile that landed before its start marker was refused", async () => {
    const clips = setupArrangementClipPath(0, ["789", "1000", "1001"]);
    const track = requireMockTrack(0);

    setupMockProperties(clips.get("789") as RegisteredMockObject, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0.0,
      end_time: 4.0,
      loop_start: 0.0,
      loop_end: 4.0,
      start_marker: 0.0,
      end_marker: 4.0,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex: 0,
    });
    setupMockProperties(requireMockObject("live_set"), { tracks: ["id", 0] });
    track.properties.arrangement_clips = children("789");
    refuseSet(clips.get("1000") as RegisteredMockObject, "start_marker");

    const result = await updateClip({ id: "789", arrangementLength: "3bar" });

    // The first tile exists in the Set although its marker write threw, and the
    // entries name it.
    expect(result).toStrictEqual([
      {
        id: "789",
        path: "t0[1|1]",
        detail: `arrangementLength didn't finish: ${REFUSED}`,
      },
      { id: "1000", path: "t0[2|1]" },
    ]);
  });
});
