// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Config profile definitions for the eval matrix.
 * Profiles control orthogonal config values (smallModelMode, jsonOutput,
 * excludedTools) that vary independently from scenarios and models.
 */

import type { ConfigProfile } from "./types.ts";

const defaultProfile: ConfigProfile = {
  id: "default",
  description: "Standard: JSON output, full tools, normal model mode",
  config: {
    smallModelMode: false,
    jsonOutput: true,
    excludedTools: [],
  },
};

const smallModelProfile: ConfigProfile = {
  id: "small-model",
  description: "Small model mode enabled",
  config: {
    smallModelMode: true,
  },
};

const jsonOffProfile: ConfigProfile = {
  id: "json-off",
  description: "JSON output disabled",
  config: {
    jsonOutput: false,
  },
};

const allProfiles: ConfigProfile[] = [
  defaultProfile,
  smallModelProfile,
  jsonOffProfile,
];

/**
 * Load config profiles by ID. Returns default profile when no IDs specified.
 *
 * @param profileIds - Profile IDs to load (empty/undefined returns default)
 * @returns Array of matching config profiles
 */
export function loadConfigProfiles(profileIds?: string[]): ConfigProfile[] {
  if (!profileIds || profileIds.length === 0) {
    return [defaultProfile];
  }

  const profiles = allProfiles.filter((p) => profileIds.includes(p.id));

  if (profiles.length === 0) {
    const available = allProfiles.map((p) => p.id).join(", ");

    throw new Error(
      `Config profile(s) not found: ${profileIds.join(", ")}. Available: ${available}`,
    );
  }

  // Warn about any IDs that weren't found
  const foundIds = new Set(profiles.map((p) => p.id));
  const notFound = profileIds.filter((id) => !foundIds.has(id));

  if (notFound.length > 0) {
    console.warn(
      `Warning: Config profile(s) not found: ${notFound.join(", ")}`,
    );
  }

  return profiles;
}

/**
 * List all available config profile IDs
 *
 * @returns Array of profile IDs
 */
export function listConfigProfileIds(): string[] {
  return allProfiles.map((p) => p.id);
}
