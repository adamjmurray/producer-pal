/**
 * Extract simplified path from Live API canonical path
 * @param liveApiPath - e.g., "live_set tracks 1 devices 0 chains 2"
 * @returns Simplified path e.g., "t1/d0/c2", "rt0/d0", "mt/d0", or null if invalid
 */
export function extractDevicePath(liveApiPath: string): string | null {
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
 * @param devicePath - Parent device path e.g., "t1/d0"
 * @param chainIndex - Chain index
 * @returns Chain path e.g., "t1/d0/c2"
 */
export function buildChainPath(devicePath: string, chainIndex: number): string {
  return `${devicePath}/c${chainIndex}`;
}

/**
 * Build return chain path from parent device path + return chain index
 * @param devicePath - Parent device path e.g., "t1/d0"
 * @param returnChainIndex - Return chain index
 * @returns Return chain path e.g., "t1/d0/rc0"
 */
export function buildReturnChainPath(
  devicePath: string,
  returnChainIndex: number,
): string {
  return `${devicePath}/rc${returnChainIndex}`;
}

/**
 * Build drum pad path from parent device path + note name
 * @param devicePath - Parent device path e.g., "t1/d0"
 * @param noteName - Note name e.g., "C1", "F#2", or asterisk for catch-all
 * @param chainIndex - Index within chains having the same note (default 0)
 * @returns Drum pad path e.g., "t1/d0/pC1" or "t1/d0/pC1/c1" for layered chains
 */
export function buildDrumPadPath(
  devicePath: string,
  noteName: string,
  chainIndex = 0,
): string {
  return chainIndex > 0
    ? `${devicePath}/p${noteName}/c${chainIndex}`
    : `${devicePath}/p${noteName}`;
}
