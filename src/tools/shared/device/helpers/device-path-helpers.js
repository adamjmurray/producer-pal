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
