// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Routing a new track back to the one it was copied from. Everything this
// changes is about the copy and its source, so it goes on the copy's own entry
// rather than warning the whole call (ADR-0042).

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  noteTarget,
  type TargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface RoutingType {
  display_name: string;
  identifier: string | number;
}

/**
 * Configure routing to source track
 * @param newTrack - The new track LiveAPI object
 * @param sourceTrackIndex - Source track index
 * @param notes - What the new track's entry should say
 */
export function configureRouting(
  newTrack: LiveAPI,
  sourceTrackIndex: number | undefined,
  notes: TargetNotes,
): void {
  // sourceTrackIndex is guaranteed by caller when routeToSource is true
  const sourceTrack = LiveAPI.from(livePath.track(sourceTrackIndex as number));
  const sourceTrackName = sourceTrack.getName();

  configureSourceTrackInput(sourceTrack, notes);

  const availableTypes = newTrack.getProperty(
    "available_output_routing_types",
  ) as RoutingType[] | null;

  applyOutputRouting(
    newTrack,
    sourceTrack,
    sourceTrackName,
    availableTypes,
    notes,
  );
}

/**
 * Find the correct routing option for a track when duplicate names exist
 * @param sourceTrack - The source track LiveAPI object
 * @param sourceTrackName - The source track's name
 * @param availableTypes - Available output routing types from the new track
 * @returns The correct routing option or undefined
 */
export function findRoutingOptionForDuplicateNames(
  sourceTrack: LiveAPI,
  sourceTrackName: string,
  availableTypes: RoutingType[],
): RoutingType | undefined {
  // Get all routing options with the same name
  const matchingOptions = availableTypes.filter(
    (type) => type.display_name === sourceTrackName,
  );

  // If only one match, return it (no duplicates)
  if (matchingOptions.length <= 1) {
    return matchingOptions[0];
  }

  // Multiple matches - need to find the correct one
  const liveSet = LiveAPI.from(livePath.liveSet);
  const allTrackIds = liveSet.getChildIds("tracks");

  // Find all tracks with the same name and their info
  const tracksWithSameName = allTrackIds
    .map((trackId, index) => {
      const track = LiveAPI.from(trackId);

      return {
        index,
        id: track.id,
        // Raw getProperty is fine here: this only runs once matchingOptions
        // above found 2+ display_name (string) matches for sourceTrackName,
        // so an all-digit sourceTrackName already exited above and can never
        // reach this comparison.
        name: track.getProperty("name"),
      };
    })
    .filter((track) => track.name === sourceTrackName);

  // Sort by ID (creation order) - IDs are numeric strings
  tracksWithSameName.sort((a, b) => {
    const idA = Number.parseInt(a.id, 10);
    const idB = Number.parseInt(b.id, 10);

    return idA - idB;
  });

  // Find source track's position in the sorted list
  const sourcePosition = tracksWithSameName.findIndex(
    (track) => track.id === sourceTrack.id,
  );

  // The caller reports the same thing either way: the name is ambiguous.
  return sourcePosition === -1 ? undefined : matchingOptions[sourcePosition];
}

// --- Helpers below main exports ---

/**
 * Arm the source track and take its input off whatever it was listening to, so
 * the copy feeding it doesn't pick up the outside world as well.
 * @param sourceTrack - The source track LiveAPI object
 * @param notes - What the new track's entry should say
 */
function configureSourceTrackInput(
  sourceTrack: LiveAPI,
  notes: TargetNotes,
): void {
  const wasArmed = sourceTrack.getProperty("arm") === 1;

  sourceTrack.set("arm", 1);

  const did = [
    ...(wasArmed ? [] : ["armed it"]),
    ...(silenceInput(sourceTrack) ?? []),
  ];

  if (did.length > 0) {
    noteTarget(
      notes,
      `source track ${targetLabel(sourceTrack)}: ${did.join(", ")}`,
    );
  }
}

/**
 * Point the source track's input at "No Input".
 * @param sourceTrack - The source track LiveAPI object
 * @returns What to say about it, or null when it was already there
 */
function silenceInput(sourceTrack: LiveAPI): string[] | null {
  const current = sourceTrack.getProperty(
    "input_routing_type",
  ) as RoutingType | null;

  if (current?.display_name === "No Input") {
    return null;
  }

  const inputTypes = sourceTrack.getProperty(
    "available_input_routing_types",
  ) as RoutingType[] | null;
  const noInput = inputTypes?.find((type) => type.display_name === "No Input");

  if (noInput == null) {
    return ['could not set its input to "No Input": it has no such input'];
  }

  sourceTrack.setProperty("input_routing_type", {
    identifier: noInput.identifier,
  });

  return ['set its input to "No Input"'];
}

/**
 * Point the new track's output at the source track.
 * @param newTrack - The new track LiveAPI object
 * @param sourceTrack - The source track LiveAPI object
 * @param sourceTrackName - The source track name
 * @param availableTypes - Available routing types
 * @param notes - What the new track's entry should say
 */
function applyOutputRouting(
  newTrack: LiveAPI,
  sourceTrack: LiveAPI,
  sourceTrackName: string,
  availableTypes: RoutingType[] | null,
  notes: TargetNotes,
): void {
  const matching =
    availableTypes?.filter((type) => type.display_name === sourceTrackName) ??
    [];
  // Several options share the name, so which one is the source has to be worked
  // out from the track order rather than read off the name.
  const sourceRouting =
    matching.length > 1
      ? findRoutingOptionForDuplicateNames(
          sourceTrack,
          sourceTrackName,
          availableTypes as RoutingType[],
        )
      : matching[0];

  if (sourceRouting) {
    // Let Live set the default channel for this routing type
    newTrack.setProperty("output_routing_type", {
      identifier: sourceRouting.identifier,
    });

    return;
  }

  noteTarget(
    notes,
    matching.length > 1
      ? `not routed to the source: ${matching.length} tracks are named ` +
          `"${sourceTrackName}"; rename one`
      : `not routed to the source: no output option named "${sourceTrackName}"`,
  );
}
