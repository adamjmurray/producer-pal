// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// When a resize throws and Live can't then say what the clip's span is, the
// original error is what the caller gets, and the clip is not reported as cut.

import { describe, expect, it, vi } from "vitest";
import { fakeArrangementClip } from "#src/tools/shared/arrangement/tests/helpers/fake-arrangement-clip.ts";
import { handleArrangementShortening } from "./arrangement-length-changes.ts";

describe("handleArrangementShortening - a clip that can't be read after a refused resize", () => {
  it("rethrows the refusal and says nothing was cut", () => {
    const { clip, set } = fakeArrangementClip({
      looping: false,
      span: 16,
      unloopedEnd: 16,
      endMarker: 16,
    });
    const readSpan = clip.getProperty.bind(clip);
    let refused = false;
    const onCut = vi.fn();

    set.mockImplementation(() => {
      refused = true;
      throw new Error("refused");
    });
    Object.assign(clip, {
      getProperty: (property: string) => {
        if (refused) {
          throw new Error("clip is gone");
        }

        return readSpan(property);
      },
    });

    expect(() =>
      handleArrangementShortening({
        clip,
        isAudioClip: false,
        arrangementLengthBeats: 2,
        context: {},
        onCut,
      }),
    ).toThrow("refused");
    expect(onCut).not.toHaveBeenCalled();
  });
});
