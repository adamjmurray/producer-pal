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
  // Test cases: [clipId, revealedClipId, sourceEndTime, name, description]
  const testCases = [
    ["661", "662", 8.0, "Audio No Hidden start==firstStart", "fully visible"],
    [
      "672",
      "673",
      5.0,
      "Audio Hidden start==firstStart",
      "extending beyond visible",
    ],
    ["683", "684", 8.0, "Audio No Hidden start<firstStart", "fully visible"],
    [
      "694",
      "695",
      5.0,
      "Audio Hidden start<firstStart",
      "extending beyond visible",
    ],
  ];

  it.each(testCases)(
    "should extend to target length (clip %s: %s)",
    (clipId, revealedClipId, sourceEndTime, name) => {
      setupAudioArrangementTest({
        trackIndex: 0,
        clipId,
        revealedClipId,
        sourceEndTime,
        targetLength: 14.0,
        name,
      });

      const result = updateClip(
        { ids: clipId, arrangementLength: "3:2" },
        mockContext,
      );

      assertSourceClipEndMarker(clipId, 14.0);
      assertDuplicateClipCalled(clipId, sourceEndTime);
      assertRevealedClipMarkers(revealedClipId, sourceEndTime, 14.0);
      expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
    },
  );
});
