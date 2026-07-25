// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const REPO_API_URL = "https://api.github.com/repos/adamjmurray/producer-pal";
const RELEASES_URL = `${REPO_API_URL}/releases/latest`;

const TIMEOUT_MS = 5000;

export interface UpdateInfo {
  /** The version published as the latest release */
  version: string;
  /**
   * True when the published version matches ours but its build doesn't — the
   * release was re-cut after this copy was downloaded.
   */
  isRebuild: boolean;
}

/**
 * Checks GitHub for a newer release of Producer Pal.
 * @param currentVersion - The current version string
 * @param currentBuild - The current build SHA, or "" when unknown
 * @returns The available update, or null if up to date or on any error
 */
export async function checkForUpdate(
  currentVersion: string,
  currentBuild = "",
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

    if (isNewerVersion(currentVersion, latest)) {
      return { version: latest, isRebuild: false };
    }

    // Neither version is newer, so either they're equal or this is a local build
    // running ahead of the latest release. Only the equal case is worth a second
    // request, and only when we know which build we are.
    if (currentBuild === "" || isNewerVersion(latest, currentVersion)) {
      return null;
    }

    // Same version number, so compare builds. A release candidate that gets
    // re-cut is re-tagged at the new commit, which is what makes the published
    // tag a truthful build identity — and what keeps this silent when a
    // pre-release is promoted untouched, where the tag never moved and the
    // tester already has the published bytes.
    const publishedBuild = await fetchTagCommit(tagName);

    if (publishedBuild != null && !publishedBuild.startsWith(currentBuild)) {
      return { version: latest, isRebuild: true };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves a release tag to the commit it points at. GitHub dereferences
 * annotated tags here, so this is the commit SHA a build of that tag baked in.
 * @param tagName - The release's tag, e.g. "v2.0.0"
 * @returns The full commit SHA, or null when it can't be resolved
 */
async function fetchTagCommit(tagName: string): Promise<string | null> {
  const response = await fetch(
    `${REPO_API_URL}/commits/${encodeURIComponent(tagName)}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );

  if (!response.ok) return null;

  const data: unknown = await response.json();

  if (data == null || typeof data !== "object" || !("sha" in data)) return null;

  return typeof data.sha === "string" ? data.sha.toLowerCase() : null;
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
