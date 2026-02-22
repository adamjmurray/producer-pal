// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const RELEASES_URL =
  "https://api.github.com/repos/adamjmurray/producer-pal/releases/latest";

const TIMEOUT_MS = 5000;

/**
 * Checks GitHub for a newer release of Producer Pal.
 * @param currentVersion - The current version string
 * @returns The latest version info, or null if no update or on any error
 */
export async function checkForUpdate(
  currentVersion: string,
): Promise<{ version: string } | null> {
  try {
    const response = await fetch(RELEASES_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data: unknown = await response.json();

    if (data == null || typeof data !== "object" || !("tag_name" in data)) {
      return null;
    }

    const tagName = (data as { tag_name: unknown }).tag_name;

    if (typeof tagName !== "string") return null;

    const latest = tagName.startsWith("v") ? tagName.slice(1) : tagName;

    if (isNewerVersion(currentVersion, latest)) {
      return { version: latest };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Compares two semver strings to determine if latest is newer than current.
 * @param current - The current version string
 * @param latest - The latest version string
 * @returns True if latest is strictly newer than current
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = parseVersionParts(current);
  const latestParts = parseVersionParts(latest);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] as number; // bounded by loop
    const l = latestParts[i] as number; // bounded by loop

    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

function parseVersionParts(version: string): number[] {
  let cleaned = version.trim();

  if (cleaned.startsWith("v")) {
    cleaned = cleaned.slice(1);
  }

  // parseInt stops at first non-numeric char, handling suffixes like "4b7"
  return cleaned.split(".").map((part) => Number.parseInt(part, 10));
}
