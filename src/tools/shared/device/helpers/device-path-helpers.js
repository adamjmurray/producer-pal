import { noteNameToMidi } from "#src/shared/pitch.js";

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
 * @param {string} noteName - Note name e.g., "C1", "F#2", or asterisk for catch-all
 * @param {number} [chainIndex=0] - Index within chains having the same note
 * @returns {string} Drum pad path e.g., "1/0/pC1" or "1/0/pC1/1" for layered chains
 */
export function buildDrumPadPath(devicePath, noteName, chainIndex = 0) {
  // Only include chain index when > 0 (layered chains) for cleaner paths
  if (chainIndex > 0) {
    return `${devicePath}/p${noteName}/${chainIndex}`;
  }

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

/**
 * @typedef {object} DrumPadResolution
 * @property {object|null} target - The resolved LiveAPI object (Chain or Device)
 * @property {'chain'|'device'} targetType - Type of the resolved target
 */

/**
 * Find chains with a specific in_note value
 * @param {Array} chains - All chains from the drum rack
 * @param {number} targetInNote - Target in_note value (-1 for catch-all)
 * @returns {Array} Chains matching the in_note
 */
function findChainsByInNote(chains, targetInNote) {
  return chains.filter(
    (chain) => chain.getProperty("in_note") === targetInNote,
  );
}

/**
 * Resolve a drum pad path to its target LiveAPI object.
 * Uses chains with in_note property instead of drum_pads collection.
 * Supports nested drum racks by recursing when encountering another pNOTE segment.
 *
 * Path formats:
 * - Note-specific: pNOTE/chainIndex (e.g., pC1/0) - chainIndex is position within note group
 * - Catch-all: p{asterisk}/chainIndex - for chains with in_note=-1
 * - Nested: pNOTE/chainIndex/deviceIndex/pNOTE2/... - recurses into nested drum racks
 *
 * @param {string} liveApiPath - Live API path to the drum rack device
 * @param {string} drumPadNote - Note name (e.g., "C1", "F#2") or asterisk for catch-all
 * @param {string[]} remainingSegments - Path segments after the drum pad (chain index, device indices)
 * @returns {DrumPadResolution} The resolved target and its type
 */
export function resolveDrumPadFromPath(
  liveApiPath,
  drumPadNote,
  remainingSegments,
) {
  const device = new LiveAPI(liveApiPath);

  if (!device.exists()) {
    return { target: null, targetType: "chain" };
  }

  const allChains = device.getChildren("chains");

  // Determine target in_note: "*" means catch-all (-1), otherwise convert note name
  const targetInNote = drumPadNote === "*" ? -1 : noteNameToMidi(drumPadNote);

  if (targetInNote == null) {
    return { target: null, targetType: "chain" };
  }

  // Chain index is first remaining segment (defaults to 0)
  let chainIndexWithinNote = 0;
  let nextSegmentStart = 0;

  if (remainingSegments && remainingSegments.length > 0) {
    chainIndexWithinNote = parseInt(remainingSegments[0], 10);

    if (isNaN(chainIndexWithinNote)) {
      return { target: null, targetType: "chain" };
    }

    nextSegmentStart = 1;
  }

  // Find chains with matching in_note
  const matchingChains = findChainsByInNote(allChains, targetInNote);

  if (
    chainIndexWithinNote < 0 ||
    chainIndexWithinNote >= matchingChains.length
  ) {
    return { target: null, targetType: "chain" };
  }

  const chain = matchingChains[chainIndexWithinNote];

  // Check if we need to navigate further
  const nextSegments = remainingSegments
    ? remainingSegments.slice(nextSegmentStart)
    : [];

  if (nextSegments.length === 0) {
    return { target: chain, targetType: "chain" };
  }

  // Navigate to device within chain
  const deviceIndex = parseInt(nextSegments[0], 10);
  const devices = chain.getChildren("devices");

  if (isNaN(deviceIndex) || deviceIndex < 0 || deviceIndex >= devices.length) {
    return { target: null, targetType: "device" };
  }

  const targetDevice = devices[deviceIndex];

  // Check if there are more segments after the device index
  const afterDeviceSegments = nextSegments.slice(1);

  if (afterDeviceSegments.length === 0) {
    return { target: targetDevice, targetType: "device" };
  }

  // Navigate through remaining segments (chains/devices in nested racks)
  return navigateRemainingSegments(targetDevice, afterDeviceSegments);
}

/**
 * Navigate through remaining path segments after reaching a device.
 * Handles alternating chain/device indices and nested drum racks.
 * @param {object} startDevice - Starting device
 * @param {string[]} segments - Remaining path segments
 * @returns {DrumPadResolution} The resolved target and its type
 */
function navigateRemainingSegments(startDevice, segments) {
  let current = startDevice;
  let isChainNext = true;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Check for nested drum pad notation
    if (segment.startsWith("p")) {
      const nestedNote = segment.slice(1);

      if (!nestedNote) {
        return { target: null, targetType: "chain" };
      }

      return resolveDrumPadFromPath(
        current.path,
        nestedNote,
        segments.slice(i + 1),
      );
    }

    // Parse numeric index
    const index = parseInt(segment, 10);

    if (isNaN(index)) {
      return { target: null, targetType: isChainNext ? "chain" : "device" };
    }

    // Get children (chains or devices)
    const children = current.getChildren(isChainNext ? "chains" : "devices");

    if (index < 0 || index >= children.length) {
      return { target: null, targetType: isChainNext ? "chain" : "device" };
    }

    current = children[index];
    isChainNext = !isChainNext;
  }

  // Return final target - type depends on what we last navigated to
  // If isChainNext is true, we last navigated to a device; if false, to a chain
  return { target: current, targetType: isChainNext ? "device" : "chain" };
}
