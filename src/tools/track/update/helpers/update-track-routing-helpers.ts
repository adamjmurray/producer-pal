// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

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
 * non-group tracks, so it is warn-and-skipped on group/return/master tracks —
 * mirroring the read-side guard in track-routing-helpers.ts processCurrentRouting
 * (`!isGroup && category === "regular"`). Output routing applies to the tracks
 * that expose it (regular and return).
 * @param track - Track object
 * @param params - Routing properties
 */
export function applyRoutingProperties(
  track: LiveAPI,
  params: RoutingParams,
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
      console.warn(
        `input routing is only available on regular non-group tracks; skipping track ${targetLabel(track)}`,
      );
    } else {
      setRouting(track, "input_routing_type", inputRoutingType);
      setRouting(track, "input_routing_channel", inputRoutingChannel);
    }
  }

  setRouting(track, "output_routing_type", outputRoutingType);
  setRouting(track, "output_routing_channel", outputRoutingChannel);
}

/**
 * Set one routing property from a display name or a numeric identifier.
 * @param track - Track object
 * @param property - Live routing property, e.g. "input_routing_type"
 * @param value - Routing display name or identifier, or undefined to skip
 */
function setRouting(
  track: LiveAPI,
  property: string,
  value: string | undefined,
): void {
  if (value == null) return;

  const identifier = resolveRoutingIdentifier(track, property, value);

  if (identifier == null) return;

  track.setProperty(property, { identifier });
}

/**
 * Resolve a routing display name (case-insensitive) against the track's
 * available list, falling back to treating the value as Live's numeric
 * identifier so callers that already have one keep working.
 * @param track - Track object
 * @param property - Live routing property, e.g. "input_routing_type"
 * @param value - Routing display name or identifier
 * @returns The numeric identifier, or null when nothing matched
 */
function resolveRoutingIdentifier(
  track: LiveAPI,
  property: string,
  value: string,
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

      console.warn(
        `track ${targetLabel(track)} has ${matches.length} ${property} options named "${value}"; using the first — send the identifier (${ids}) to pick another`,
      );
    }

    return Number(first.identifier);
  }

  const asNumber = Number(wanted);

  if (wanted !== "" && Number.isFinite(asNumber)) {
    return asNumber;
  }

  const names = available.map((routing) => routing.display_name).join(", ");

  console.warn(
    `track ${targetLabel(track)} has no ${property} named "${value}"; available: ${names || "none"}`,
  );

  return null;
}
