/**
 * Shared helpers for arrangement clip tiling operations.
 * These functions handle the complex logic of shortening, moving, and tiling
 * arrangement clips using the holding area technique.
 */

/**
 * Creates a shortened copy of a clip in the holding area.
 * Uses the temp clip shortening technique to achieve the target length.
 *
 * @param {Object} sourceClip - LiveAPI clip instance to duplicate
 * @param {Object} track - LiveAPI track instance
 * @param {number} targetLength - Desired clip length in beats
 * @param {number} holdingAreaStart - Start position of holding area in beats
 * @returns {{holdingClipId: number, holdingClip: Object}} Holding clip ID and instance
 */
export function createShortenedClipInHolding(
  sourceClip,
  track,
  targetLength,
  holdingAreaStart,
) {
  // Duplicate source clip to holding area
  const holdingResult = track.call(
    "duplicate_clip_to_arrangement",
    `id ${sourceClip.id}`,
    holdingAreaStart,
  );
  const holdingClip = LiveAPI.from(holdingResult);

  // Shorten holding clip to target length using temp clip technique
  const holdingClipEnd = holdingClip.getProperty("end_time");
  const newHoldingEnd = holdingAreaStart + targetLength;
  const tempLength = holdingClipEnd - newHoldingEnd;

  const tempResult = track.call("create_midi_clip", newHoldingEnd, tempLength);
  const tempClip = LiveAPI.from(tempResult);
  track.call("delete_clip", `id ${tempClip.id}`);

  return {
    holdingClipId: holdingClip.id,
    holdingClip,
  };
}

/**
 * Moves a clip from the holding area to a target position.
 * Duplicates the holding clip to the target, then cleans up the holding clip.
 *
 * @param {number} holdingClipId - ID of clip in holding area
 * @param {Object} track - LiveAPI track instance
 * @param {number} targetPosition - Target position in beats
 * @returns {Object} The moved clip (LiveAPI instance)
 */
export function moveClipFromHolding(holdingClipId, track, targetPosition) {
  // Duplicate holding clip to target position
  const finalResult = track.call(
    "duplicate_clip_to_arrangement",
    `id ${holdingClipId}`,
    targetPosition,
  );
  const movedClip = LiveAPI.from(finalResult);

  // Clean up holding area
  track.call("delete_clip", `id ${holdingClipId}`);

  return movedClip;
}

/**
 * Adjusts a clip's pre-roll by setting start_marker to loop_start and shortening.
 * Only performs adjustment if the clip has pre-roll (start_marker < loop_start).
 *
 * @param {Object} clip - LiveAPI clip instance
 * @param {Object} track - LiveAPI track instance
 */
export function adjustClipPreRoll(clip, track) {
  const startMarker = clip.getProperty("start_marker");
  const loopStart = clip.getProperty("loop_start");

  // Only adjust if clip has pre-roll
  if (startMarker < loopStart) {
    // Set start_marker to loop_start
    clip.set("start_marker", loopStart);

    // Shorten clip by the pre-roll amount
    const preRollLength = loopStart - startMarker;
    const clipEnd = clip.getProperty("end_time");
    const newClipEnd = clipEnd - preRollLength;
    const tempClipLength = clipEnd - newClipEnd;

    const tempClipPath = track.call(
      "create_midi_clip",
      newClipEnd,
      tempClipLength,
    );
    const tempClip = LiveAPI.from(tempClipPath);
    track.call("delete_clip", `id ${tempClip.id}`);
  }
}

/**
 * Creates a partial tile of a clip at a target position.
 * Combines: create shortened clip in holding → move to target → optionally adjust pre-roll.
 *
 * @param {Object} sourceClip - LiveAPI clip instance to tile
 * @param {Object} track - LiveAPI track instance
 * @param {number} targetPosition - Target position in beats
 * @param {number} partialLength - Length of partial tile in beats
 * @param {number} holdingAreaStart - Start position of holding area in beats
 * @param {boolean} [adjustPreRoll=true] - Whether to adjust pre-roll on the created tile
 * @returns {Object} The created partial tile clip (LiveAPI instance)
 */
export function createPartialTile(
  sourceClip,
  track,
  targetPosition,
  partialLength,
  holdingAreaStart,
  adjustPreRoll = true,
) {
  // Create shortened clip in holding area
  const { holdingClipId } = createShortenedClipInHolding(
    sourceClip,
    track,
    partialLength,
    holdingAreaStart,
  );

  // Move from holding to target position
  const partialTile = moveClipFromHolding(holdingClipId, track, targetPosition);

  // Optionally adjust pre-roll
  if (adjustPreRoll) {
    adjustClipPreRoll(partialTile, track);
  }

  return partialTile;
}

/**
 * Tiles a clip across a range by creating full tiles and a partial final tile.
 * High-level orchestrator that handles the complete tiling operation.
 *
 * @param {Object} sourceClip - LiveAPI clip instance to tile
 * @param {Object} track - LiveAPI track instance
 * @param {number} startPosition - Start position for tiling in beats
 * @param {number} totalLength - Total length to fill with tiles in beats
 * @param {number} holdingAreaStart - Start position of holding area in beats
 * @param {Object} options - Configuration options
 * @param {boolean} [options.adjustPreRoll=true] - Whether to adjust pre-roll on subsequent tiles
 * @returns {Array<Object>} Array of created clip objects with {id} property
 */
export function tileClipToRange(
  sourceClip,
  track,
  startPosition,
  totalLength,
  holdingAreaStart,
  { adjustPreRoll = true } = {},
) {
  const createdClips = [];

  // Get clip loop length for tiling
  const clipLoopStart = sourceClip.getProperty("loop_start");
  const clipLoopEnd = sourceClip.getProperty("loop_end");
  const clipLength = clipLoopEnd - clipLoopStart;

  // Calculate tiling requirements
  const fullTiles = Math.floor(totalLength / clipLength);
  const remainder = totalLength % clipLength;

  // Create full tiles
  let currentPosition = startPosition;
  for (let i = 0; i < fullTiles; i++) {
    const result = track.call(
      "duplicate_clip_to_arrangement",
      `id ${sourceClip.id}`,
      currentPosition,
    );
    const tileClip = LiveAPI.from(result);

    // Adjust pre-roll for subsequent tiles if requested
    if (adjustPreRoll) {
      adjustClipPreRoll(tileClip, track);
    }

    createdClips.push({ id: tileClip.id });
    currentPosition = tileClip.getProperty("end_time");
  }

  // Handle partial final tile if remainder exists
  if (remainder > 0.001) {
    const partialTile = createPartialTile(
      sourceClip,
      track,
      currentPosition,
      remainder,
      holdingAreaStart,
      adjustPreRoll,
    );

    createdClips.push({ id: partialTile.id });
  }

  return createdClips;
}
