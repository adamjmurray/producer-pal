// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fakeArrangementClip } from "./helpers/fake-arrangement-clip.ts";
import { resizeArrangementClip } from "../arrangement-clip-resize.ts";

describe("resizeArrangementClip", () => {
  describe("a looped clip", () => {
    it.each([
      ["lengthens past one loop pass", 16],
      ["shortens below one loop pass", 2],
      ["lands on a fractional span", 9.25],
    ])("%s, keeping the loop", (_, span) => {
      const { clip, state } = fakeArrangementClip();

      expect(
        resizeArrangementClip({ clip, spanBeats: span, isAudioClip: false }),
      ).toBe(span);
      expect(state).toStrictEqual(
        expect.objectContaining({ looping: true, loopStart: 0, loopEnd: 4 }),
      );
    });

    it("counts the span from a start marker inside the loop", () => {
      const { clip, state } = fakeArrangementClip({
        startMarker: 2,
        endMarker: 12,
        unloopedEnd: 10,
        span: 10,
      });

      resizeArrangementClip({ clip, spanBeats: 6, isAudioClip: true });

      expect(state.span).toBe(6);
      expect(state.endMarker).toBe(8);
    });

    it("ignores Live's remembered unlooped end", () => {
      const { clip, state } = fakeArrangementClip({ unloopedEnd: 30 });

      resizeArrangementClip({ clip, spanBeats: 8, isAudioClip: false });

      expect(state.span).toBe(8);
    });

    it("reports landing short at the next clip", () => {
      const { clip } = fakeArrangementClip({ nextClipStart: 6 });

      expect(
        resizeArrangementClip({ clip, spanBeats: 16, isAudioClip: false }),
      ).toBe(6);
    });

    it("loops the clip again when setting the span throws", () => {
      const { clip, state, set } = fakeArrangementClip();
      const live = set.getMockImplementation() as (
        p: string,
        v: number,
      ) => void;

      set.mockImplementation((property: string, value: number) => {
        if (property === "end_marker") {
          throw new Error("refused");
        }

        live(property, value);
      });

      expect(() =>
        resizeArrangementClip({ clip, spanBeats: 8, isAudioClip: false }),
      ).toThrow("refused");
      expect(state).toStrictEqual(
        expect.objectContaining({ looping: true, loopStart: 0, loopEnd: 4 }),
      );
    });

    it("writes the loop brace back only when Live moved it", () => {
      const { clip, set } = fakeArrangementClip();

      resizeArrangementClip({ clip, spanBeats: 8, isAudioClip: false });

      expect(set.mock.calls.map(([property]) => property)).toStrictEqual([
        "looping",
        "loop_end",
        "end_marker",
        "looping",
      ]);
    });

    it.each([
      ["a brace that moved later", { loopStart: 6, loopEnd: 8 }],
      ["a brace that moved before it", { loopStart: 0, loopEnd: 1 }],
    ])("restores %s without crossing it", (_, moved) => {
      const { clip, state, set } = fakeArrangementClip({
        loopStart: 1,
        loopEnd: 3,
      });

      // Live restoring a different brace than the clip had.
      set.mockImplementationOnce(() => {
        state.looping = false;
      });
      set.mockImplementationOnce((_property: string, value: number) => {
        state.unloopedEnd = value;
        state.span = value;
      });
      set.mockImplementationOnce(() => undefined);
      set.mockImplementationOnce(() => {
        Object.assign(state, { looping: true, ...moved });
      });

      resizeArrangementClip({ clip, spanBeats: 8, isAudioClip: false });

      expect(state).toStrictEqual(
        expect.objectContaining({ loopStart: 1, loopEnd: 3 }),
      );
    });
  });

  describe("an unlooped clip", () => {
    it("moves loop_end and end_marker with the span", () => {
      const { clip, state } = fakeArrangementClip({
        looping: false,
        unloopedEnd: 9,
        endMarker: 9,
        span: 9,
      });

      resizeArrangementClip({ clip, spanBeats: 3, isAudioClip: false });

      expect(state).toStrictEqual(
        expect.objectContaining({ span: 3, unloopedEnd: 3, endMarker: 3 }),
      );
    });

    it("counts unwarped audio's markers in seconds", () => {
      const { clip, state } = fakeArrangementClip({
        looping: false,
        warping: false,
        unloopedEnd: 2,
        endMarker: 2,
        span: 4,
      });

      resizeArrangementClip({ clip, spanBeats: 2, isAudioClip: true });

      expect(state).toStrictEqual(
        expect.objectContaining({ span: 2, unloopedEnd: 1, endMarker: 1 }),
      );
    });
  });
});
