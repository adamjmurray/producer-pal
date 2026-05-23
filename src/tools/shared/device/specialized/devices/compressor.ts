// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// Compressor (CompressorDevice). AJM-375. See
// dev/Specialized-Devices.md.
// Sidechain input routing via Live's standard routing-dict shape. Routing
// identifiers are NOT Live object IDs — they're a separate Live-internal
// namespace; translation happens by matching track names to display_names.
//
// READ CAVEATS (write fidelity is exact; read is best-effort by name):
// - Duplicate track names are ambiguous — the read returns the FIRST regular
//   track whose name matches the routing display_name.
// - Return-track / master / "Ext. In" sources have no matching regular-track id
//   and read back as null even though a source is set. Writes only accept
//   regular-track ids (readOptions lists the valid sidechainSourceTrackIds).

interface RoutingEntry {
  display_name: string;
  identifier: string | number;
}

const NO_INPUT_LABEL = "No Input";

/**
 * Read available input routing types from the device. Falls back to an empty
 * array when the property is unset (getProperty returns null), so callers can
 * warn-and-skip rather than throw.
 * @param device - LiveAPI device object
 * @returns Array of routing entries (empty when unavailable)
 */
function readAvailableTypes(device: LiveAPI): RoutingEntry[] {
  return (device.getProperty("available_input_routing_types") ??
    []) as RoutingEntry[];
}

/**
 * Read available input routing channels from the device. Falls back to an empty
 * array when the property is unset (getProperty returns null), so callers can
 * warn-and-skip rather than throw.
 * @param device - LiveAPI device object
 * @returns Array of routing entries (empty when unavailable)
 */
function readAvailableChannels(device: LiveAPI): RoutingEntry[] {
  return (device.getProperty("available_input_routing_channels") ??
    []) as RoutingEntry[];
}

/**
 * Read all tracks from the live set as an array of {id, name} objects.
 * @returns Array of {id, name} for each track
 */
function readLiveSetTracks(): Array<{ id: string; name: string }> {
  const liveSet = LiveAPI.from("live_set");
  const tracks = liveSet.getChildren("tracks");

  return tracks.map((track) => ({
    id: track.id,
    name: track.getProperty("name") as string,
  }));
}

/**
 * Read the current sidechainSourceTrackId. Finds the track whose name matches
 * the input_routing_type display_name, or null for "No Input" / unmatched.
 * @param device - LiveAPI device object
 * @returns Track id string, or null
 */
function readSidechainSourceTrackId(device: LiveAPI): string | null {
  const routingType = device.getProperty(
    "input_routing_type",
  ) as RoutingEntry | null;

  if (routingType == null || routingType.display_name === NO_INPUT_LABEL) {
    return null;
  }

  const trackName = routingType.display_name;
  const tracks = readLiveSetTracks();
  const match = tracks.find((t) => t.name === trackName);

  return match != null ? match.id : null;
}

/**
 * Write sidechainSourceTrackId. Clears to "No Input" when value is null/empty.
 * Warns and skips when the track doesn't exist or isn't a valid sidechain source.
 * @param device - LiveAPI device object
 * @param value - Track id string, "null", or ""
 * @param toolName - Calling tool name for warning prefix
 */
function writeSidechainSourceTrackId(
  device: LiveAPI,
  value: string | number,
  toolName: string,
): void {
  const strValue = String(value).trim();

  if (strValue === "" || strValue === "null") {
    clearSidechainSource(device, toolName);

    return;
  }

  const track = LiveAPI.from(`id ${strValue}`);

  if (!track.exists()) {
    console.warn(
      `${toolName}: sidechainSourceTrackId — track id "${strValue}" does not exist`,
    );

    return;
  }

  const trackName = track.getProperty("name") as string;
  const available = readAvailableTypes(device);
  const entry = available.find((e) => e.display_name === trackName);

  if (entry == null) {
    console.warn(
      `${toolName}: Track '${trackName}' cannot be a sidechain source — it has no audio-bearing devices`,
    );

    return;
  }

  device.setProperty("input_routing_type", {
    identifier: Number(entry.identifier),
  });
}

/**
 * Clear the sidechain source to "No Input". Warns and skips if "No Input" is
 * not in the available types list.
 * @param device - LiveAPI device object
 * @param toolName - Calling tool name for warning prefix
 */
function clearSidechainSource(device: LiveAPI, toolName: string): void {
  const available = readAvailableTypes(device);
  const noInput = available.find((e) => e.display_name === NO_INPUT_LABEL);

  if (noInput == null) {
    console.warn(
      `${toolName}: sidechainSourceTrackId — "No Input" entry not found in available routing types`,
    );

    return;
  }

  device.setProperty("input_routing_type", {
    identifier: Number(noInput.identifier),
  });
}

/**
 * Read the current sidechainChannel (e.g. "Pre FX", "Post FX", "Post Mixer").
 * Returns null when no channel routing is set.
 * @param device - LiveAPI device object
 * @returns Channel display_name string, or null
 */
function readSidechainChannel(device: LiveAPI): string | null {
  const channel = device.getProperty(
    "input_routing_channel",
  ) as RoutingEntry | null;

  return channel != null ? channel.display_name : null;
}

/**
 * Write sidechainChannel by matching the display_name in the available channels.
 * Warns and skips when the channel name is not available. Always re-reads the
 * channel list (identifiers are not stable across source changes).
 * @param device - LiveAPI device object
 * @param value - Channel name (e.g. "Pre FX")
 * @param toolName - Calling tool name for warning prefix
 */
function writeSidechainChannel(
  device: LiveAPI,
  value: string | number,
  toolName: string,
): void {
  const channelName = String(value).trim();
  const available = readAvailableChannels(device);
  const entry = available.find((e) => e.display_name === channelName);

  if (entry == null) {
    const names = available.map((e) => e.display_name).join(", ");

    console.warn(
      `${toolName}: "${channelName}" is not a valid sidechainChannel. Available: ${names}`,
    );

    return;
  }

  device.setProperty("input_routing_channel", {
    identifier: Number(entry.identifier),
  });
}

/**
 * Build the Compressor option catalogs:
 * - `sidechainSourceTrackIds`: track ids whose display_name in
 *   available_input_routing_types matches a live_set track name. Excludes
 *   "No Input", "Ext. In", "Master", and return tracks (no matching track id).
 * - `sidechainChannels`: valid `sidechainChannel` values for the CURRENTLY
 *   selected source. The list is source-dependent (a plain track offers Pre
 *   FX/Post FX/Post Mixer; a drum-rack/chained source exposes per-device
 *   channels), so read it after setting the source.
 * @param device - LiveAPI device object
 * @returns Object with sidechainSourceTrackIds and sidechainChannels arrays
 */
function readCompressorOptions(device: LiveAPI): Record<string, unknown> {
  const available = readAvailableTypes(device);
  const tracks = readLiveSetTracks();
  const trackByName = new Map(tracks.map((t) => [t.name, t.id]));
  const trackIds: string[] = [];

  for (const entry of available) {
    const id = trackByName.get(entry.display_name);

    if (id != null) {
      trackIds.push(id);
    }
  }

  const sidechainChannels = readAvailableChannels(device).map(
    (e) => e.display_name,
  );

  return { sidechainSourceTrackIds: trackIds, sidechainChannels };
}

export const compressorSpec: SpecializedDeviceSpec = {
  displayNames: ["Compressor"],
  params: [
    {
      name: "sidechainSourceTrackId",
      read: readSidechainSourceTrackId,
      write: writeSidechainSourceTrackId,
    },
    {
      name: "sidechainChannel",
      read: readSidechainChannel,
      write: writeSidechainChannel,
    },
  ],
  readOptions: readCompressorOptions,
};
