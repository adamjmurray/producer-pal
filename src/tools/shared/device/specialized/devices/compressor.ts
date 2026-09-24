// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

// Compressor (CompressorDevice). See
// dev/live-api/specialized-devices/audio-effects.md.
// Sidechain input routing via Live's standard routing-dict shape. Routing
// identifiers are NOT Live object IDs — they're a separate Live-internal
// namespace; translation happens by matching track names to display_names.
//
// READ CAVEATS (write fidelity is exact; read is best-effort by name):
// - Regular tracks, return tracks, and the master track all resolve to their
//   track id. "Ext. In" and other non-track hardware sources have no
//   track id and still read back as null even though a source is set.
// - Duplicate track names are ambiguous — the read returns the FIRST matching
//   track (regular tracks are searched before returns/master).

interface RoutingEntry {
  display_name: string;
  identifier: string | number;
}

const NO_INPUT_LABEL = "No Input";

/**
 * Read available input routing types from the device. Falls back to an empty
 * array when the property is unset (getProperty returns null), so callers can
 * refuse with a reason rather than throw.
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
 * refuse with a reason rather than throw.
 * @param device - LiveAPI device object
 * @returns Array of routing entries (empty when unavailable)
 */
function readAvailableChannels(device: LiveAPI): RoutingEntry[] {
  return (device.getProperty("available_input_routing_channels") ??
    []) as RoutingEntry[];
}

/**
 * Read every track that can serve as a sidechain source — regular tracks,
 * return tracks, and the master track — as {id, name} objects. Including
 * returns/master lets reads resolve those sources to a track id
 * instead of null; hardware sources ("Ext. In") still have no track id and read
 * back as null. Regular tracks come first, so a name shared with a return/master
 * resolves to the regular track (best-effort; duplicate names remain ambiguous).
 * @returns Array of {id, name} for each routable track
 */
function readRoutableTracks(): Array<{ id: string; name: string }> {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const tracks = [
    ...liveSet.getChildren("tracks"),
    ...liveSet.getChildren("return_tracks"),
    liveSet.child("master_track"),
  ];

  return tracks.map((track) => ({
    id: track.id,
    name: track.getName(),
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
  const tracks = readRoutableTracks();
  const match = tracks.find((t) => t.name === trackName);

  return match != null ? match.id : null;
}

/**
 * Write sidechainSourceTrackId. Clears to "No Input" when value is null/empty.
 * Refuses a track that doesn't exist or isn't a valid sidechain source.
 * @param device - LiveAPI device object
 * @param value - Track id string, "null", or ""
 * @returns Why the source was refused, or null when it was written
 */
function writeSidechainSourceTrackId(
  device: LiveAPI,
  value: string | number,
): string | null {
  const strValue = String(value).trim();

  if (strValue === "" || strValue === "null") {
    return clearSidechainSource(device);
  }

  const track = LiveAPI.from(toLiveApiId(strValue));

  if (!track.exists()) {
    return `sidechainSourceTrackId — track id "${strValue}" does not exist`;
  }

  const trackName = track.getName();
  const available = readAvailableTypes(device);
  const entry = available.find((e) => e.display_name === trackName);

  if (entry == null) {
    return `track "${trackName}" ${targetLabel(track)} cannot be a sidechain source — it has no audio-bearing devices`;
  }

  device.setProperty("input_routing_type", {
    identifier: Number(entry.identifier),
  });

  return null;
}

/**
 * Clear the sidechain source to "No Input". Refuses when "No Input" is not in
 * the available types list.
 * @param device - LiveAPI device object
 * @returns Why the source was not cleared, or null when it was
 */
function clearSidechainSource(device: LiveAPI): string | null {
  const available = readAvailableTypes(device);
  const noInput = available.find((e) => e.display_name === NO_INPUT_LABEL);

  if (noInput == null) {
    return `sidechainSourceTrackId — "No Input" entry not found in available routing types`;
  }

  device.setProperty("input_routing_type", {
    identifier: Number(noInput.identifier),
  });

  return null;
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
 * Refuses a channel name that is not available. Always re-reads the channel list
 * (identifiers are not stable across source changes).
 * @param device - LiveAPI device object
 * @param value - Channel name (e.g. "Pre FX")
 * @returns Why the channel was refused, or null when it was written
 */
function writeSidechainChannel(
  device: LiveAPI,
  value: string | number,
): string | null {
  const channelName = String(value).trim();
  const available = readAvailableChannels(device);
  const entry = available.find((e) => e.display_name === channelName);

  if (entry == null) {
    const names = available.map((e) => e.display_name).join(", ");

    return `"${channelName}" is not a valid sidechainChannel. Available: ${names}`;
  }

  device.setProperty("input_routing_channel", {
    identifier: Number(entry.identifier),
  });

  return null;
}

/**
 * Build the Compressor option catalogs:
 * - `sidechainSourceTrackIds`: track ids (regular, return, or master) whose name
 *   matches a display_name in available_input_routing_types. Excludes "No Input",
 *   "Ext. In", and other non-track hardware sources (no matching track id).
 * - `sidechainChannels`: valid `sidechainChannel` values for the CURRENTLY
 *   selected source. The list is source-dependent (a plain track offers Pre
 *   FX/Post FX/Post Mixer; a drum-rack/chained source exposes per-device
 *   channels), so read it after setting the source.
 * @param device - LiveAPI device object
 * @returns Object with sidechainSourceTrackIds and sidechainChannels arrays
 */
function readCompressorOptions(device: LiveAPI): Record<string, unknown> {
  const available = readAvailableTypes(device);
  const tracks = readRoutableTracks();
  // First-wins so a name shared across a regular track and a return/master
  // resolves to the regular track — matching readSidechainSourceTrackId's
  // .find() (regular tracks come first in readRoutableTracks). A plain
  // new Map(...) would keep the last entry and advertise a different id than
  // the param reads back.
  const trackByName = new Map<string, string>();

  for (const t of tracks) {
    if (!trackByName.has(t.name)) {
      trackByName.set(t.name, t.id);
    }
  }

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
