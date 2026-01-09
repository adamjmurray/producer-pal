import { describe, expect, it } from "vitest";
import { updateClip } from "#src/tools/clip/update/update-clip.js";
import {
  mockContext,
  setupAudioArrangementTest,
  assertSourceClipEndMarker,
  assertDuplicateClipCalled,
  assertRevealedClipMarkers,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.js";

// NOTE: After discovering that the Live API's warp_markers and end_marker properties
// are unreliable for detecting hidden audio content, we changed the behavior to
// always attempt to extend audio clips to the target length, letting Live fill
// with silence if the audio runs out. This simplifies the logic and hopefully works more reliably.

describe("Unlooped audio clips - arrangementLength extension", () => {
  it("should extend even when audio appears fully visible (clip 661 scenario: start_marker=0)", () => {
    const clipId = "661";
    const revealedClipId = "662";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 8.0,
      targetEndMarker: 14.0,
      name: "Audio No Hidden start==firstStart",
    });

    const result = updateClip({ ids: clipId, arrangementLength: "3:2" }, mockContext);

    assertSourceClipEndMarker(clipId, 14.0);
    assertDuplicateClipCalled(clipId, 8.0);
    assertRevealedClipMarkers(revealedClipId, 8.0, 14.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should extend to target length (clip 672 scenario: start_marker=0, extending beyond visible)", () => {
    const clipId = "672";
    const revealedClipId = "673";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 5.0,
      targetEndMarker: 14.0,
      name: "Audio Hidden start==firstStart",
    });

    const result = updateClip({ ids: clipId, arrangementLength: "3:2" }, mockContext);

    assertSourceClipEndMarker(clipId, 14.0);
    assertDuplicateClipCalled(clipId, 5.0);
    assertRevealedClipMarkers(revealedClipId, 5.0, 14.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should extend even when audio appears fully visible (clip 683 scenario: start_marker=0)", () => {
    const clipId = "683";
    const revealedClipId = "684";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 8.0,
      targetEndMarker: 14.0,
      name: "Audio No Hidden start<firstStart",
    });

    const result = updateClip({ ids: clipId, arrangementLength: "3:2" }, mockContext);

    assertSourceClipEndMarker(clipId, 14.0);
    assertDuplicateClipCalled(clipId, 8.0);
    assertRevealedClipMarkers(revealedClipId, 8.0, 14.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should extend to target length (clip 694 scenario: start_marker=0, extending beyond visible)", () => {
    const clipId = "694";
    const revealedClipId = "695";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 5.0,
      targetEndMarker: 14.0,
      name: "Audio Hidden start<firstStart",
    });

    const result = updateClip({ ids: clipId, arrangementLength: "3:2" }, mockContext);

    assertSourceClipEndMarker(clipId, 14.0);
    assertDuplicateClipCalled(clipId, 5.0);
    assertRevealedClipMarkers(revealedClipId, 5.0, 14.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });
});
