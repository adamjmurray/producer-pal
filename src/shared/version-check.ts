// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const RELEASES_URL =
  "https://api.github.com/repos/adamjmurray/producer-pal/releases/latest";

const TIMEOUT_MS = 5000;

// Machine-readable build identity published in the GitHub release notes (see
// dev/Releasing.md). Two builds of the same version are otherwise
// indistinguishable: a pre-release tester who downloads an early release
// candidate keeps reporting that version after the artifacts are re-cut under
// the same tag, so a version-only check tells them they're up to date forever.
// Comparing builds catches that — and stays silent when a pre-release is
// promoted without re-cutting, where the tester already has the published bytes.
const BUILD_MARKER_LABEL = "Producer Pal build:";
const BUILD_MARKER_PATTERN = new RegExp(
  // The SHA may be wrapped in backticks so it renders as code in the notes.
  `${BUILD_MARKER_LABEL}\\s*\`?([0-9a-f]{7,40})\`?`,
  "i",
);

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

    // Same version number — the published artifacts can still be a different
    // build than ours. Neither version being newer than the other is what makes
    // them equal, which also skips a build comparison for a local build that is
    // ahead of the latest release.
    const publishedBuild = parseBuildMarker(data);

    if (
      currentBuild !== "" &&
      publishedBuild != null &&
      publishedBuild !== currentBuild &&
      !isNewerVersion(latest, currentVersion)
    ) {
      return { version: latest, isRebuild: true };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Formats the build marker line to publish in a GitHub release's notes.
 * @param buildSha - The short commit SHA the release was built from
 * @returns The marker line
 */
export function formatBuildMarker(buildSha: string): string {
  return `${BUILD_MARKER_LABEL} \`${buildSha}\``;
}

/**
 * Extracts the build SHA from a GitHub release's notes.
 * @param release - The release object from the GitHub API
 * @returns The published build SHA, or null when the notes carry no marker
 */
function parseBuildMarker(release: object): string | null {
  if (!("body" in release) || typeof release.body !== "string") return null;

  const match = BUILD_MARKER_PATTERN.exec(release.body);

  if (match == null) return null;

  // Group 1 is always present when the pattern matches. Lowercased so a
  // hand-edited marker still compares equal to the git-generated SHA.
  return (match[1] as string).toLowerCase();
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
