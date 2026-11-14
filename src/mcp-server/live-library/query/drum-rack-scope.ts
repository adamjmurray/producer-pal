// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Many drum kits are saved as an Instrument Rack holding a Drum Rack, so a
 * Drum Rack's presets include Instrument Rack files. The database can't tell
 * which, so a lookup scoped to Drum Rack also fetches Instrument Rack files
 * and reads them to keep the ones holding a Drum Rack.
 * @param device - The device's name, as the call named it
 * @returns True for a Drum Rack
 */
export function isDrumRackScope(device: string): boolean {
  return device.trim().toLowerCase() === "drum rack";
}
