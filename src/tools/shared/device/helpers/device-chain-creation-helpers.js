/**
 * Helpers for auto-creating chains when resolving container paths
 */

// Maximum chains that can be auto-created to prevent runaway creation
const MAX_AUTO_CREATE_CHAINS = 16;

/**
 * Resolve container with auto-creation of missing chains
 * @param {string[]} segments - Path segments
 * @param {string} path - Original path for error messages
 * @returns {object} LiveAPI object (Track or Chain)
 */
export function resolveContainerWithAutoCreate(segments, path) {
  // Start with track
  let currentPath = resolveTrackPath(segments[0]);
  let current = new LiveAPI(currentPath);

  if (!current.exists()) {
    throw new Error(`Track in path "${path}" does not exist`);
  }

  // Process remaining segments (alternating device/chain)
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const isDeviceSegment = i % 2 === 1;

    if (isDeviceSegment) {
      current = navigateToDevice(currentPath, segment, path);
      currentPath += ` devices ${segment}`;
    } else {
      current = navigateToChain(current, currentPath, segment, path);
      currentPath = current.path;
    }
  }

  return current;
}

/**
 * Get Live API path for track segment
 * @param {string} segment - Track segment ("0", "r0", "m")
 * @returns {string} Live API path
 */
function resolveTrackPath(segment) {
  if (segment === "m") {
    return "live_set master_track";
  }

  if (segment.startsWith("r")) {
    return `live_set return_tracks ${segment.slice(1)}`;
  }

  return `live_set tracks ${segment}`;
}

/**
 * Navigate to a device, throwing if it doesn't exist
 * @param {string} currentPath - Current Live API path
 * @param {string} segment - Device index segment
 * @param {string} fullPath - Full path for error messages
 * @returns {object} LiveAPI device object
 */
function navigateToDevice(currentPath, segment, fullPath) {
  const devicePath = `${currentPath} devices ${segment}`;
  const device = new LiveAPI(devicePath);

  if (!device.exists()) {
    throw new Error(`Device in path "${fullPath}" does not exist`);
  }

  return device;
}

/**
 * Navigate to a chain, auto-creating if necessary
 * @param {object} parentDevice - Parent device LiveAPI object
 * @param {string} currentPath - Current Live API path
 * @param {string} segment - Chain segment (numeric or "rN" for return chain)
 * @param {string} fullPath - Full path for error messages
 * @returns {object} LiveAPI chain object
 */
function navigateToChain(parentDevice, currentPath, segment, fullPath) {
  // Return chain - no auto-creation
  if (segment.startsWith("r")) {
    const returnIndex = parseInt(segment.slice(1), 10);
    const chainPath = `${currentPath} return_chains ${returnIndex}`;
    const chain = new LiveAPI(chainPath);

    if (!chain.exists()) {
      throw new Error(`Return chain in path "${fullPath}" does not exist`);
    }

    return chain;
  }

  // Regular chain - may need auto-creation
  const chainIndex = parseInt(segment, 10);
  const chains = parentDevice.getChildren("chains");

  if (chainIndex >= chains.length) {
    autoCreateChains(parentDevice, chainIndex, fullPath);
  }

  const chainPath = `${currentPath} chains ${chainIndex}`;

  return new LiveAPI(chainPath);
}

/**
 * Auto-create chains up to the requested index
 * @param {object} device - Parent device LiveAPI object
 * @param {number} targetIndex - Target chain index
 * @param {string} fullPath - Full path for error messages
 */
function autoCreateChains(device, targetIndex, fullPath) {
  // Check if it's a Drum Rack
  if (device.getProperty("can_have_drum_pads") > 0) {
    throw new Error(
      `Auto-creating chains in Drum Racks is not supported (path: "${fullPath}")`,
    );
  }

  // Limit how many chains can be auto-created
  const chainsToCreate = targetIndex + 1 - device.getChildren("chains").length;

  if (chainsToCreate > MAX_AUTO_CREATE_CHAINS) {
    throw new Error(
      `Cannot auto-create ${chainsToCreate} chains (max: ${MAX_AUTO_CREATE_CHAINS}) in path "${fullPath}"`,
    );
  }

  // Create chains until we have enough
  while (targetIndex >= device.getChildren("chains").length) {
    device.call("insert_chain");
  }
}

/**
 * Auto-create drum pad chains up to the requested index within a note group.
 * Creates chains with the specified in_note value (MIDI note number).
 * @param {object} device - Drum rack device LiveAPI object
 * @param {number} targetInNote - MIDI note for the chain's in_note property
 * @param {number} targetIndex - Target chain index within the note group
 * @param {number} existingCount - Current count of chains with this in_note
 */
export function autoCreateDrumPadChains(
  device,
  targetInNote,
  targetIndex,
  existingCount,
) {
  const chainsToCreate = targetIndex + 1 - existingCount;

  if (chainsToCreate > MAX_AUTO_CREATE_CHAINS) {
    throw new Error(
      `Cannot auto-create ${chainsToCreate} drum pad chains (max: ${MAX_AUTO_CREATE_CHAINS})`,
    );
  }

  for (let i = 0; i < chainsToCreate; i++) {
    // Create chain (appends to end with in_note = -1 "All Notes")
    device.call("insert_chain");

    // Get the new chain (it's at the end)
    const chains = device.getChildren("chains");
    const newChain = chains[chains.length - 1];

    // Set in_note to assign it to the correct pad
    newChain.set("in_note", targetInNote);
  }
}
