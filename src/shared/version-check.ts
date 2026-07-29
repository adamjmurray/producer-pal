// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `/releases/latest` excludes anything marked as a pre-release, and we depend on
// that: there is no opt-in beta track, so people on the current stable release
// must never be nudged toward a pre-release. Do not swap this for `/releases`
// and take [0] — that offers every stable user the in-testing pre-release.
//
// A tester running an `-rcN` build therefore gets the older stable release back
// as "latest", and is never prompted to install it: `isNewerVersion` is strictly
// directional, so the older version fails and this returns null. A downgrade
// prompt is not reachable.
//
// That same tester IS prompted the moment the pre-release is promoted, because
// `2.1.0-rc1` and `2.1.0` are genuinely different versions — the version string
// alone answers it, in one request. Pre-release versions used to be git tags
// only, so every build of a cycle called itself `2.1.0` and a second request
// (resolving the tag to a commit) was needed to tell re-cut builds apart. Real
// `-rcN` versions in the artifact removed that need; keep it at one request.
const RELEASES_URL =
  "https://api.github.com/repos/adamjmurray/producer-pal/releases/latest";

const TIMEOUT_MS = 5000;

export interface UpdateInfo {
  /** The version published as the latest release */
  version: string;
}

/**
 * Checks GitHub for a newer release of Producer Pal. Makes exactly one request;
 * callers must make it exactly once per process (see
 * mcp-server/helpers/http/update-check.ts).
 * @param currentVersion - The current version string
 * @returns The available update, or null if up to date or on any error
 */
export async function checkForUpdate(
  currentVersion: string,
): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(RELEASES_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data: unknown = await response.json();

    if (data == null || typeof data !== "object" || !("tag_name" in data)) {
      return null;
    }

    const tagName = data.tag_name;

    if (typeof tagName !== "string") return null;

    const latest = tagName.startsWith("v") ? tagName.slice(1) : tagName;

    return isNewerVersion(currentVersion, latest) ? { version: latest } : null;
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
    // A missing part is 0 (standard semver): "12.3" == "12.3.0", and "12.3" is
    // older than "12.3.1". Defaulting to 0 — not the raw `undefined`, which made
    // every comparison false and silently treated a missing part as equal to
    // any value — is what makes a shorter `current` vs a longer `latest` work.
    const c = currentParts[i] ?? 0;
    const l = latestParts[i] ?? 0;

    if (l > c) return true;
    if (l < c) return false;
  }

  // Numeric parts are equal — check pre-release suffixes (e.g., "-beta", "-rc1").
  // A version with a suffix is earlier than the same version without one.
  return hasPreReleaseSuffix(current) && !hasPreReleaseSuffix(latest);
}

function parseVersionParts(version: string): number[] {
  let cleaned = version.trim();

  if (cleaned.startsWith("v")) {
    cleaned = cleaned.slice(1);
  }

  // parseInt stops at first non-numeric char, handling suffixes like "4b7". A
  // part with no leading digits (e.g. "" from "1..3", or "x") parses to NaN;
  // normalize it to 0 so every returned part is a finite number — NaN would
  // make both `l > c` and `l < c` false and silently treat that part as equal.
  return cleaned.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);

    return Number.isNaN(parsed) ? 0 : parsed;
  });
}

/**
 * Checks if a version string has a semver pre-release suffix (dash-delimited).
 * Detects "-beta", "-rc1", etc. but NOT Ableton-style "12.4b7" (no dash).
 * @param version - Version string to check
 * @returns True if version contains a dash-delimited pre-release suffix
 */
function hasPreReleaseSuffix(version: string): boolean {
  let cleaned = version.trim();

  if (cleaned.startsWith("v")) {
    cleaned = cleaned.slice(1);
  }

  return cleaned.includes("-");
}
