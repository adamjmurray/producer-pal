// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TargetNotes,
  noteTarget,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";

interface RoutingInfo {
  display_name: string;
  identifier: string | number;
}

export interface RoutingParams {
  inputRoutingType?: string;
  inputRoutingChannel?: string;
  outputRoutingType?: string;
  outputRoutingChannel?: string;
}

/**
 * Apply routing properties to a track. Input routing exists only on regular,
 * non-group tracks, so it is refused on group/return/master tracks — mirroring
 * the read-side guard in track-routing.ts processCurrentRouting
 * (`!isGroup && category === "regular"`). Output routing applies to the tracks
 * that expose it (regular and return).
 * @param track - Track object
 * @param params - Routing properties
 * @param notes - What the track's entry has to say, added to
 */
export function applyRoutingProperties(
  track: LiveAPI,
  params: RoutingParams,
  notes: TargetNotes,
): void {
  const {
    inputRoutingType,
    inputRoutingChannel,
    outputRoutingType,
    outputRoutingChannel,
  } = params;

  if (inputRoutingType != null || inputRoutingChannel != null) {
    const category = (track.category as string | undefined) ?? "regular";
    const isGroup = (track.getProperty("is_foldable") as number) > 0;

    if (isGroup || category !== "regular") {
      refuseTargetWork(
        notes,
        ["inputRoutingType", "inputRoutingChannel"],
        "input routing is only available on regular non-group tracks",
      );
    } else {
      setRouting(track, "input_routing_type", inputRoutingType, notes);
      setRouting(track, "input_routing_channel", inputRoutingChannel, notes);
    }
  }

  setRouting(track, "output_routing_type", outputRoutingType, notes);
  setRouting(track, "output_routing_channel", outputRoutingChannel, notes);
}

/** The param a caller names a routing property by. */
const ROUTING_PARAM: Record<string, string> = {
  input_routing_type: "inputRoutingType",
  input_routing_channel: "inputRoutingChannel",
  output_routing_type: "outputRoutingType",
  output_routing_channel: "outputRoutingChannel",
};

/**
 * Set one routing property from a display name or a numeric identifier.
 * @param track - Track object
 * @param property - Live routing property, e.g. "input_routing_type"
 * @param value - Routing display name or identifier, or undefined to skip
 * @param notes - What the track's entry has to say, added to
 */
function setRouting(
  track: LiveAPI,
  property: string,
  value: string | undefined,
  notes: TargetNotes,
): void {
  if (value == null) {
    return;
  }

  const identifier = resolveRoutingIdentifier(track, property, value, notes);

  if (identifier == null) {
    return;
  }

  track.setProperty(property, { identifier });
}

/**
 * Resolve a routing display name (case-insensitive) against the track's
 * available list, falling back to treating the value as Live's numeric
 * identifier so callers that already have one keep working.
 * @param track - Track object
 * @param property - Live routing property, e.g. "input_routing_type"
 * @param value - Routing display name or identifier
 * @param notes - What the track's entry has to say, added to
 * @returns The numeric identifier, or null when nothing matched
 */
function resolveRoutingIdentifier(
  track: LiveAPI,
  property: string,
  value: string,
  notes: TargetNotes,
): number | null {
  const available = (track.getProperty(`available_${property}s`) ??
    []) as RoutingInfo[];
  const wanted = value.trim().toLowerCase();
  const matches = available.filter(
    (routing) => routing.display_name.toLowerCase() === wanted,
  );

  const [first] = matches;

  if (first != null) {
    // Two interfaces can share a display name. Take the first and say so, so
    // the model can send the identifier instead when it picked the wrong one.
    if (matches.length > 1) {
      const ids = matches.map((routing) => routing.identifier).join(", ");

      noteTarget(
        notes,
        `${matches.length} ${property} options are named "${value}"; used the first — send the identifier (${ids}) to pick another`,
      );
    }

    return Number(first.identifier);
  }

  const asNumber = Number(wanted);

  if (wanted !== "" && Number.isFinite(asNumber)) {
    return asNumber;
  }

  const names = available.map((routing) => routing.display_name).join(", ");

  refuseTargetWork(
    notes,
    [ROUTING_PARAM[property] as string],
    `the track has no ${property} named "${value}"; available: ${names || "none"}`,
  );

  return null;
}
