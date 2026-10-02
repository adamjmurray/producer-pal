// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Reading a `ppal-read-track` overview out of a `ppal-read-live-set` result,
 * for scenarios that grade which tracks exist and in what order.
 */

/** One track in a read-live-set result. */
interface TrackOverview {
  name?: string;
}

/**
 * Track names in the order the Set reports them. Needs
 * `include: ["tracks"]` on the read — the default result carries no track list.
 *
 * @param result - The parsed read-live-set result
 * @returns The names, in track order, an unnamed track reading as ""
 */
export function trackNames(result: unknown): string[] {
  const tracks = (result as { tracks?: TrackOverview[] }).tracks ?? [];

  return tracks.map((track) => track.name ?? "");
}
