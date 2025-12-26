/**
 * Extract simplified path from Live API canonical path
 * @param {string} liveApiPath - e.g., "live_set tracks 1 devices 0 chains 2"
 * @returns {string|null} Simplified path e.g., "1/0/2", "r0/0", "m/0", or null if invalid
 */
export function extractDevicePath(liveApiPath) {
  let prefix;

  const regularMatch = liveApiPath.match(/^live_set tracks (\d+)/);
  const returnMatch = liveApiPath.match(/^live_set return_tracks (\d+)/);
  const masterMatch = liveApiPath.match(/^live_set master_track/);

  if (regularMatch) {
    prefix = regularMatch[1];
  } else if (returnMatch) {
    prefix = `r${returnMatch[1]}`;
  } else if (masterMatch) {
    prefix = "m";
  } else {
    return null;
  }

  const parts = [prefix];

  // Extract alternating devices/chains indices
  // Handles both "chains" and "return_chains"
  const pattern = /(?:devices|(?:return_)?chains) (\d+)/g;
  let match;
  let lastIndex = 0;

  while ((match = pattern.exec(liveApiPath)) !== null) {
    // Check if this was a return_chains match
    const segment = liveApiPath.substring(
      lastIndex,
      match.index + match[0].length,
    );

    if (segment.includes("return_chains")) {
      parts.push(`r${match[1]}`);
    } else {
      parts.push(match[1]);
    }

    lastIndex = pattern.lastIndex;
  }

  return parts.join("/");
}

/**
 * Build chain path from parent device path + chain index
 * @param {string} devicePath - Parent device path e.g., "1/0"
 * @param {number} chainIndex - Chain index
 * @returns {string} Chain path e.g., "1/0/2"
 */
export function buildChainPath(devicePath, chainIndex) {
  return `${devicePath}/${chainIndex}`;
}

/**
 * Build return chain path from parent device path + return chain index
 * @param {string} devicePath - Parent device path e.g., "1/0"
 * @param {number} returnChainIndex - Return chain index
 * @returns {string} Return chain path e.g., "1/0/r0"
 */
export function buildReturnChainPath(devicePath, returnChainIndex) {
  return `${devicePath}/r${returnChainIndex}`;
}

/**
 * Build drum pad path from parent device path + note name
 * @param {string} devicePath - Parent device path e.g., "1/0"
 * @param {string} noteName - Note name e.g., "C1", "F#2"
 * @returns {string} Drum pad path e.g., "1/0/pC1"
 */
export function buildDrumPadPath(devicePath, noteName) {
  return `${devicePath}/p${noteName}`;
}

/**
 * @typedef {object} ResolvedPath
 * @property {string} liveApiPath - Live API canonical path
 * @property {'device'|'chain'|'drum-pad'|'return-chain'} targetType - Type of target
 * @property {string} [drumPadNote] - Note name for drum pads
 * @property {string[]} [remainingSegments] - Segments after drum pad
 */

/**
 * Parse the track segment and return the Live API path prefix
 * @param {string} trackSegment - Track segment (e.g., "1", "r0", "m")
 * @param {string} path - Full path for error messages
 * @returns {string} Live API path prefix
 */
function parseTrackSegment(trackSegment, path) {
  if (trackSegment === "m") {
    return "live_set master_track";
  }

  if (trackSegment.startsWith("r")) {
    const returnIndex = parseInt(trackSegment.slice(1), 10);

    if (isNaN(returnIndex)) {
      throw new Error(`Invalid return track index in path: ${path}`);
    }

    return `live_set return_tracks ${returnIndex}`;
  }

  const trackIndex = parseInt(trackSegment, 10);

  if (isNaN(trackIndex)) {
    throw new Error(`Invalid track index in path: ${path}`);
  }

  return `live_set tracks ${trackIndex}`;
}

/**
 * Parse a chain segment (numeric, drum pad, or return chain)
 * @param {string} segment - Chain segment to parse
 * @param {string} path - Full path for error messages
 * @param {string} liveApiPath - Current Live API path
 * @param {string[]} segments - All path segments
 * @param {number} index - Current segment index
 * @returns {object} Result with liveApiPath, targetType, and optional early return
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

  // Return chain
  if (segment.startsWith("r")) {
    const returnChainIndex = parseInt(segment.slice(1), 10);

    if (isNaN(returnChainIndex)) {
      throw new Error(`Invalid return chain index in path: ${path}`);
    }

    return {
      liveApiPath: `${liveApiPath} return_chains ${returnChainIndex}`,
      targetType: "return-chain",
    };
  }

  // Regular chain
  const chainIndex = parseInt(segment, 10);

  if (isNaN(chainIndex)) {
    throw new Error(`Invalid chain index in path: ${path}`);
  }

  return {
    liveApiPath: `${liveApiPath} chains ${chainIndex}`,
    targetType: "chain",
  };
}

/**
 * Resolve a simplified path to a Live API path
 * @param {string} path - e.g., "1/0", "1/0/0", "r0/0", "m/0", "1/0/pC1", "1/0/r0"
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

  // Parse remaining segments (alternating device/chain)
  let targetType = "device";
  let isDevice = true;

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];

    if (isDevice) {
      const deviceIndex = parseInt(segment, 10);

      if (isNaN(deviceIndex)) {
        throw new Error(
          `Expected device index at position ${i} in path: ${path}`,
        );
      }

      liveApiPath += ` devices ${deviceIndex}`;
      targetType = "device";
    } else {
      const result = parseChainSegment(segment, path, liveApiPath, segments, i);

      if (result.earlyReturn) {
        return result.earlyReturn;
      }

      liveApiPath = result.liveApiPath;
      targetType = result.targetType;
    }

    isDevice = !isDevice;
  }

  return { liveApiPath, targetType };
}
