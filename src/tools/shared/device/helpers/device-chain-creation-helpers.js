/**
 * Helpers for auto-creating chains when resolving container paths
 */

// Maximum chains that can be auto-created to prevent runaway creation
const MAX_AUTO_CREATE_CHAINS = 16;

/**
 * Resolve container with auto-creation of missing chains
 * @param {string[]} segments - Path segments with explicit prefixes (t, rt, mt, d, c, rc)
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

  // Process remaining segments using explicit prefixes
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];

    if (segment.startsWith("d")) {
      // Device segment
      const deviceIndex = segment.slice(1);

      current = navigateToDevice(currentPath, deviceIndex, path);
      currentPath += ` devices ${deviceIndex}`;
    } else if (segment.startsWith("c") || segment.startsWith("rc")) {
      // Chain segment (c for regular, rc for return chain)
      current = navigateToChain(current, currentPath, segment, path);
      currentPath = current.path;
    }
  }

  return current;
}

/**
 * Get Live API path for track segment
 * @param {string} segment - Track segment ("t0", "rt0", "mt")
 * @returns {string} Live API path
 */
function resolveTrackPath(segment) {
  if (segment === "mt") {
    return "live_set master_track";
  }

  if (segment.startsWith("rt")) {
    return `live_set return_tracks ${segment.slice(2)}`;
  }

  if (segment.startsWith("t")) {
    return `live_set tracks ${segment.slice(1)}`;
  }

  throw new Error(`Invalid track segment: ${segment}`);
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
 * @param {string} segment - Chain segment ("cN" for chain, "rcN" for return chain)
 * @param {string} fullPath - Full path for error messages
 * @returns {object} LiveAPI chain object
 */
function navigateToChain(parentDevice, currentPath, segment, fullPath) {
  // Return chain (rc prefix) - no auto-creation
  if (segment.startsWith("rc")) {
    const returnIndex = parseInt(segment.slice(2), 10);
    const chainPath = `${currentPath} return_chains ${returnIndex}`;
    const chain = new LiveAPI(chainPath);

    if (!chain.exists()) {
      throw new Error(`Return chain in path "${fullPath}" does not exist`);
    }

    return chain;
  }

  // Regular chain (c prefix) - may need auto-creation
  const chainIndex = parseInt(segment.slice(1), 10);
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
  // Check if device supports chains (prevents infinite loop on non-rack devices)
  if (!device.getProperty("can_have_chains")) {
    throw new Error(`Device at path "${fullPath}" does not support chains`);
  }

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

  // Create the exact number of chains needed (bounded loop, not while)
  for (let i = 0; i < chainsToCreate; i++) {
    const result = device.call("insert_chain");

    // insert_chain returns ["id", chainId] on success, or 1 on failure
    if (!Array.isArray(result) || result[0] !== "id") {
      throw new Error(
        `Failed to create chain ${i + 1}/${chainsToCreate} in path "${fullPath}"`,
      );
    }
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
