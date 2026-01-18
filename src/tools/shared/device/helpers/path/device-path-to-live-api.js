/**
 * @typedef {object} ResolvedPath
 * @property {string} liveApiPath - Live API canonical path
 * @property {'device'|'chain'|'drum-pad'|'return-chain'} targetType - Type of target
 * @property {string} [drumPadNote] - Note name for drum pads
 * @property {string[]} remainingSegments - Segments after drum pad (empty for non-drum-pad)
 */

/**
 * Parse the track segment and return the Live API path prefix
 * @param {string} trackSegment - Track segment (e.g., "t1", "rt0", "mt")
 * @param {string} path - Full path for error messages
 * @returns {string} Live API path prefix
 */
function parseTrackSegment(trackSegment, path) {
  if (trackSegment === "mt") return "live_set master_track";

  if (trackSegment.startsWith("rt")) {
    const index = Number.parseInt(trackSegment.slice(2));

    if (Number.isNaN(index))
      throw new Error(`Invalid return track index in path: ${path}`);

    return `live_set return_tracks ${index}`;
  }

  if (trackSegment.startsWith("t")) {
    const index = Number.parseInt(trackSegment.slice(1));

    if (Number.isNaN(index))
      throw new Error(`Invalid track index in path: ${path}`);

    return `live_set tracks ${index}`;
  }

  throw new Error(`Invalid track segment in path: ${path}`);
}

/**
 * @typedef {object} ChainSegmentResult
 * @property {ResolvedPath} [earlyReturn] - Early return for drum pad paths
 * @property {string} [liveApiPath] - Updated Live API path
 * @property {'device'|'chain'|'drum-pad'|'return-chain'} [targetType] - Target type
 * @property {string[]} [remainingSegments] - Remaining path segments
 */

/**
 * Parse a chain segment (c-prefixed chain, rc-prefixed return chain, or p-prefixed drum pad)
 * @param {string} segment - Chain segment to parse (e.g., "c0", "rc0", "pC1")
 * @param {string} path - Full path for error messages
 * @param {string} liveApiPath - Current Live API path
 * @param {string[]} segments - All path segments
 * @param {number} index - Current segment index
 * @returns {ChainSegmentResult} Result with liveApiPath, targetType, and optional early return
 */
function parseChainSegment(segment, path, liveApiPath, segments, index) {
  // Drum pad - return partial resolution for Live API lookup
  if (segment.startsWith("p")) {
    const noteName = segment.slice(1);

    if (!noteName) {
      throw new Error(`Invalid drum pad note in path: ${path}`);
    }

    return {
      earlyReturn: {
        liveApiPath,
        targetType: "drum-pad",
        drumPadNote: noteName,
        remainingSegments: segments.slice(index + 1),
      },
    };
  }

  // Return chain (rc prefix)
  if (segment.startsWith("rc")) {
    const returnChainIndex = Number.parseInt(segment.slice(2));

    if (Number.isNaN(returnChainIndex)) {
      throw new Error(`Invalid return chain index in path: ${path}`);
    }

    return {
      liveApiPath: `${liveApiPath} return_chains ${returnChainIndex}`,
      targetType: "return-chain",
      remainingSegments: [],
    };
  }

  // Regular chain (c prefix)
  if (segment.startsWith("c")) {
    const chainIndex = Number.parseInt(segment.slice(1));

    if (Number.isNaN(chainIndex)) {
      throw new Error(`Invalid chain index in path: ${path}`);
    }

    return {
      liveApiPath: `${liveApiPath} chains ${chainIndex}`,
      targetType: "chain",
      remainingSegments: [],
    };
  }

  throw new Error(`Invalid chain segment in path: ${path}`);
}

/**
 * Resolve a simplified path to a Live API path
 * @param {string} path - e.g., "t1/d0", "t1/d0/c0", "rt0/d0", "mt/d0", "t1/d0/pC1", "t1/d0/rc0"
 * @returns {ResolvedPath} Resolved path info
 * @throws {Error} If path format is invalid
 */
export function resolvePathToLiveApi(path) {
  if (!path || typeof path !== "string") {
    throw new Error("Path must be a non-empty string");
  }

  const segments = path.split("/");

  if (segments.length === 0 || segments[0] === "") {
    throw new Error(`Invalid path: ${path}`);
  }

  let liveApiPath = parseTrackSegment(segments[0], path);

  // Track-only path is not valid for devices
  if (segments.length === 1) {
    throw new Error(`Path must include at least a device index: ${path}`);
  }

  // Parse remaining segments using explicit prefixes
  /** @type {'device'|'chain'|'drum-pad'|'return-chain'} */
  let targetType = "device";

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];

    if (segment.startsWith("d")) {
      // Device segment
      const deviceIndex = Number.parseInt(segment.slice(1));

      if (Number.isNaN(deviceIndex)) {
        throw new Error(`Invalid device index in path: ${path}`);
      }

      liveApiPath += ` devices ${deviceIndex}`;
      targetType = "device";
    } else {
      // Chain segment (c, rc, or p prefix)
      const result = parseChainSegment(segment, path, liveApiPath, segments, i);

      if (result.earlyReturn) {
        return result.earlyReturn;
      }

      // After earlyReturn check, liveApiPath and targetType are guaranteed
      liveApiPath = /** @type {string} */ (result.liveApiPath);
      targetType = /** @type {'device'|'chain'|'drum-pad'|'return-chain'} */ (
        result.targetType
      );
    }
  }

  return { liveApiPath, targetType, remainingSegments: [] };
}
