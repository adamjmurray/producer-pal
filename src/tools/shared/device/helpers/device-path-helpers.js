import { noteNameToMidi } from "#src/shared/pitch.js";
import {
  autoCreateDrumPadChains,
  resolveContainerWithAutoCreate,
} from "./device-chain-creation-helpers.js";

/**
 * Extract simplified path from Live API canonical path
 * @param {string} liveApiPath - e.g., "live_set tracks 1 devices 0 chains 2"
 * @returns {string|null} Simplified path e.g., "t1/d0/c2", "rt0/d0", "mt/d0", or null if invalid
 */
export function extractDevicePath(liveApiPath) {
  let prefix;

  const regularMatch = liveApiPath.match(/^live_set tracks (\d+)/);
  const returnMatch = liveApiPath.match(/^live_set return_tracks (\d+)/);
  const masterMatch = liveApiPath.match(/^live_set master_track/);

  if (regularMatch) {
    prefix = `t${regularMatch[1]}`;
  } else if (returnMatch) {
    prefix = `rt${returnMatch[1]}`;
  } else if (masterMatch) {
    prefix = "mt";
  } else {
    return null;
  }

  const parts = [prefix];

  // Extract devices/chains with explicit prefixes
  // Pattern matches: "devices N", "chains N", "return_chains N"
  const pattern = /(devices|(?:return_)?chains) (\d+)/g;
  let match;

  while ((match = pattern.exec(liveApiPath)) !== null) {
    const type = match[1];
    const index = match[2];

    if (type === "devices") {
      parts.push(`d${index}`);
    } else if (type === "return_chains") {
      parts.push(`rc${index}`);
    } else {
      // Regular chains
      parts.push(`c${index}`);
    }
  }

  return parts.join("/");
}

/**
 * Build chain path from parent device path + chain index
 * @param {string} devicePath - Parent device path e.g., "t1/d0"
 * @param {number} chainIndex - Chain index
 * @returns {string} Chain path e.g., "t1/d0/c2"
 */
export function buildChainPath(devicePath, chainIndex) {
  return `${devicePath}/c${chainIndex}`;
}

/**
 * Build return chain path from parent device path + return chain index
 * @param {string} devicePath - Parent device path e.g., "t1/d0"
 * @param {number} returnChainIndex - Return chain index
 * @returns {string} Return chain path e.g., "t1/d0/rc0"
 */
export function buildReturnChainPath(devicePath, returnChainIndex) {
  return `${devicePath}/rc${returnChainIndex}`;
}

/**
 * Build drum pad path from parent device path + note name
 * @param {string} devicePath - Parent device path e.g., "t1/d0"
 * @param {string} noteName - Note name e.g., "C1", "F#2", or asterisk for catch-all
 * @param {number} [chainIndex=0] - Index within chains having the same note
 * @returns {string} Drum pad path e.g., "t1/d0/pC1" or "t1/d0/pC1/c1" for layered chains
 */
export function buildDrumPadPath(devicePath, noteName, chainIndex = 0) {
  return chainIndex > 0
    ? `${devicePath}/p${noteName}/c${chainIndex}`
    : `${devicePath}/p${noteName}`;
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
 * Parse a chain segment (c-prefixed chain, rc-prefixed return chain, or p-prefixed drum pad)
 * @param {string} segment - Chain segment to parse (e.g., "c0", "rc0", "pC1")
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

  // Return chain (rc prefix)
  if (segment.startsWith("rc")) {
    const returnChainIndex = Number.parseInt(segment.slice(2));

    if (Number.isNaN(returnChainIndex)) {
      throw new Error(`Invalid return chain index in path: ${path}`);
    }

    return {
      liveApiPath: `${liveApiPath} return_chains ${returnChainIndex}`,
      targetType: "return-chain",
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

      liveApiPath = result.liveApiPath;
      targetType = result.targetType;
    }
  }

  return { liveApiPath, targetType };
}

/**
 * @typedef {object} DrumPadResolution
 * @property {object|null} target - The resolved LiveAPI object (Chain or Device)
 * @property {'chain'|'device'} targetType - Type of the resolved target
 */

/**
 * Resolve a drum pad path to its target LiveAPI object. Supports nested drum racks.
 * @param {string} liveApiPath - Live API path to the drum rack device
 * @param {string} drumPadNote - Note name (e.g., "C1", "F#2") or "*" for catch-all
 * @param {string[]} remainingSegments - Path segments after drum pad (c/d prefixed)
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

  // Chain index from first remaining segment if it's a 'c' prefix (defaults to 0)
  let chainIndexWithinNote = 0;
  let nextSegmentStart = 0;

  if (remainingSegments && remainingSegments.length > 0) {
    const firstSegment = remainingSegments[0];

    // Only consume segment if it's a chain index (c prefix)
    if (firstSegment.startsWith("c")) {
      chainIndexWithinNote = Number.parseInt(firstSegment.slice(1));

      if (Number.isNaN(chainIndexWithinNote)) {
        return { target: null, targetType: "chain" };
      }

      nextSegmentStart = 1;
    }
  }

  // Find chains with matching in_note
  const matchingChains = allChains.filter(
    (c) => c.getProperty("in_note") === targetInNote,
  );

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

  // Navigate to device within chain (d prefix)
  const deviceSegment = nextSegments[0];

  if (!deviceSegment.startsWith("d")) {
    return { target: null, targetType: "device" };
  }

  const deviceIndex = Number.parseInt(deviceSegment.slice(1));
  const devices = chain.getChildren("devices");

  if (
    Number.isNaN(deviceIndex) ||
    deviceIndex < 0 ||
    deviceIndex >= devices.length
  ) {
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
 * @param {object} parent - Parent LiveAPI object
 * @param {string} childType - Type of children ("devices", "chains", etc.)
 * @param {number} index - Child index
 * @returns {object|null} Child object or null if invalid
 */
function getChildAtIndex(parent, childType, index) {
  if (Number.isNaN(index)) return null;
  const c = parent.getChildren(childType);

  return index >= 0 && index < c.length ? c[index] : null;
}

/**
 * Navigate through remaining path segments after reaching a device.
 * @param {object} startDevice - Starting device
 * @param {string[]} segments - Remaining path segments with prefixes (c, d, rc, p)
 * @returns {DrumPadResolution} The resolved target and its type
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
function navigateRemainingSegments(startDevice, segments) {
  let current = startDevice;
  let currentType = "device";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.startsWith("p")) {
      const n = seg.slice(1);

      return n
        ? resolveDrumPadFromPath(current.path, n, segments.slice(i + 1))
        : { target: null, targetType: "chain" };
    }

    const isRc = seg.startsWith("rc");

    if (isRc || seg.startsWith("c")) {
      const c = getChildAtIndex(
        current,
        isRc ? "return_chains" : "chains",
        Number.parseInt(seg.slice(isRc ? 2 : 1)),
      );

      if (!c) return { target: null, targetType: "chain" };
      current = c;
      currentType = "chain";
    } else if (seg.startsWith("d")) {
      const c = getChildAtIndex(
        current,
        "devices",
        Number.parseInt(seg.slice(1)),
      );

      if (!c) return { target: null, targetType: "device" };
      current = c;
      currentType = "device";
    } else {
      return { target: null, targetType: currentType };
    }
  }

  return { target: current, targetType: currentType };
}

/**
 * @typedef {object} InsertionPathResolution
 * @property {object} container - LiveAPI object (Track or Chain) to insert into
 * @property {number|null} position - Device index to insert at, or null to append
 */

/**
 * Resolve a track segment to a LiveAPI track object
 * @param {string} segment - Track segment (e.g., "t0", "rt0", "mt")
 * @returns {object} LiveAPI track object
 */
function resolveTrack(segment) {
  if (segment === "mt") {
    return new LiveAPI("live_set master_track");
  }

  if (segment.startsWith("rt")) {
    const returnIndex = Number.parseInt(segment.slice(2));

    return new LiveAPI(`live_set return_tracks ${returnIndex}`);
  }

  if (segment.startsWith("t")) {
    const trackIndex = Number.parseInt(segment.slice(1));

    return new LiveAPI(`live_set tracks ${trackIndex}`);
  }

  throw new Error(`Invalid track segment: ${segment}`);
}

/**
 * Resolve a container path (track or chain) to a LiveAPI object.
 * Auto-creates missing chains for regular racks. Throws for Drum Racks.
 * @param {string} path - Container path (e.g., "0", "0/0/0", "0/0/pC1")
 * @returns {object} LiveAPI object (Track or Chain)
 */
function resolveContainer(path) {
  const segments = path.split("/");

  if (segments.length === 1) return resolveTrack(segments[0]);
  if (segments.some((s) => s.startsWith("p")))
    return resolveDrumPadContainer(path);

  return resolveContainerWithAutoCreate(segments, path);
}

/**
 * Resolve a drum pad container path with auto-creation of missing chains
 * @param {string} path - Path containing drum pad notation
 * @returns {object} LiveAPI object (Chain)
 */
function resolveDrumPadContainer(path) {
  const resolved = resolvePathToLiveApi(path);

  if (resolved.targetType !== "drum-pad") {
    return new LiveAPI(resolved.liveApiPath);
  }

  // Try to resolve the drum pad chain
  const result = resolveDrumPadFromPath(
    resolved.liveApiPath,
    resolved.drumPadNote,
    resolved.remainingSegments,
  );

  // If found, return it
  if (result.target) {
    return result.target;
  }

  // If not found and we're looking for a chain, try auto-creation
  if (result.targetType === "chain") {
    const device = new LiveAPI(resolved.liveApiPath);

    if (!device.exists()) {
      return null;
    }

    // Parse the note to MIDI
    const targetInNote =
      resolved.drumPadNote === "*" ? -1 : noteNameToMidi(resolved.drumPadNote);

    if (targetInNote == null) {
      return null;
    }

    // Get chain index from remaining segments (defaults to 0)
    // Chain index segment uses 'c' prefix: pC1/c2 means chain 2 of drum pad C1
    let chainIndex = 0;

    if (resolved.remainingSegments?.length > 0) {
      const chainSegment = resolved.remainingSegments[0];

      if (chainSegment.startsWith("c")) {
        chainIndex = Number.parseInt(chainSegment.slice(1));
      } else {
        chainIndex = Number.parseInt(chainSegment);
      }
    }

    if (Number.isNaN(chainIndex) || chainIndex < 0) {
      return null;
    }

    // Find existing chains with this in_note
    const allChains = device.getChildren("chains");
    const matchingChains = allChains.filter(
      (chain) => chain.getProperty("in_note") === targetInNote,
    );

    // Auto-create chains if needed
    if (chainIndex >= matchingChains.length) {
      autoCreateDrumPadChains(
        device,
        targetInNote,
        chainIndex,
        matchingChains.length,
      );
    }

    // Re-resolve after creation
    const resultAfter = resolveDrumPadFromPath(
      resolved.liveApiPath,
      resolved.drumPadNote,
      resolved.remainingSegments,
    );

    return resultAfter.target;
  }

  return null;
}

/**
 * Resolve a path to a container (track or chain) for device insertion.
 * With explicit prefixes, insertion semantics are simple:
 * - Path ending with 'd' prefix → insert at that position
 * - Path ending with container (t, rt, mt, c, rc, p) → append
 *
 * Examples:
 * - "t0" → track 0, append
 * - "t0/d3" → track 0, position 3
 * - "t0/d0/c0" → chain 0 of device 0 on track 0, append
 * - "t0/d0/c0/d1" → chain 0 of device 0 on track 0, position 1
 * - "t0/d0/pC1" → drum pad C1 chain 0, append
 * - "rt0/d0" → return track 0, device 0; "mt/d0" → master track
 *
 * @param {string} path - Device insertion path
 * @returns {InsertionPathResolution} Container and optional position
 */
export function resolveInsertionPath(path) {
  if (!path || typeof path !== "string") {
    throw new Error("Path must be a non-empty string");
  }

  const segments = path.split("/");

  if (segments.length === 0 || segments[0] === "") {
    throw new Error(`Invalid path: ${path}`);
  }

  // Simple prefix-based logic: path ending with 'd' = position, otherwise = append
  const lastSegment = segments.at(-1);
  const hasPosition = lastSegment.startsWith("d");

  if (hasPosition) {
    const position = Number.parseInt(lastSegment.slice(1));

    if (Number.isNaN(position) || position < 0) {
      throw new Error(`Invalid device position in path: ${path}`);
    }

    const containerPath = segments.slice(0, -1).join("/");
    const container = resolveContainer(containerPath);

    return { container, position };
  }

  const container = resolveContainer(path);

  return { container, position: null };
}
