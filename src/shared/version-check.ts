// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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

    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();

    if (data == null || typeof data !== "object" || !("tag_name" in data)) {
      return null;
    }

    const tagName = data.tag_name;

    if (typeof tagName !== "string") {
      return null;
    }

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

    if (l > c) {
      return true;
    }

    if (l < c) {
      return false;
    }
  }

  // Numeric parts are equal. "-rcN" tags order by N. Otherwise a version with a
  // pre-release tag is earlier than the same version without one, and two
  // other tags can't be ordered (false both ways).
  const currentRc = releaseCandidate(current);
  const latestRc = releaseCandidate(latest);

  if (currentRc != null && latestRc != null) {
    return latestRc > currentRc;
  }

  return hasPreReleaseSuffix(current) && !hasPreReleaseSuffix(latest);
}

/**
 * Whether a running Live is at least a version. Live labels betas without a
 * dash ("12.4.15b7"), which `isNewerVersion` doesn't see as pre-release. Any
 * letter suffix ("b", "rc", "d") marks one. Here a pre-release of `min` itself
 * counts as older than `min`, since it may not have what the release does; a
 * pre-release of any later version counts as at least `min`.
 * @param version - The Live version string, like "12.4.15b7"
 * @param min - The oldest version that has the feature, like "12.4.15"
 * @returns True when the running Live is `min` or later
 */
export function isLiveVersionAtLeast(version: string, min: string): boolean {
  if (isNewerVersion(version, min)) {
    return false;
  }

  const release = version.trim().replace(/[a-z]+\d*$/i, "");

  // Same numbers as `min` but a pre-release: the release is still to come.
  return release === version.trim() || isNewerVersion(min, release);
}

/**
 * Whether an installed copy is behind a build: different from it, and not newer.
 * An unreadable version counts as behind. Differs-from is the test, not
 * `isNewerVersion`, which can't order every pair of pre-release tags (beta vs
 * rc1). Use this wherever an installed copy is judged against the build.
 * @param installed - The installed version, or null when unreadable
 * @param build - This build's version
 * @returns True when the installed copy should be updated
 */
export function isBehindBuild(
  installed: string | null,
  build: string,
): boolean {
  return (
    installed !== build &&
    !(installed != null && isNewerVersion(build, installed))
  );
}

function parseVersionParts(version: string): number[] {
  const cleaned = withoutPrefix(version);

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
  return withoutPrefix(version).includes("-");
}

/**
 * @param version - Version string
 * @returns N from a "-rcN" tag, or null when the version has no such tag
 */
function releaseCandidate(version: string): number | null {
  const match = /-rc(\d+)$/.exec(withoutPrefix(version));

  return match == null ? null : Number(match[1]);
}

/**
 * @param version - Version string
 * @returns It trimmed, without a leading "v"
 */
function withoutPrefix(version: string): string {
  const cleaned = version.trim();

  return cleaned.startsWith("v") ? cleaned.slice(1) : cleaned;
}

/** The slice of the remote script status that decides whether it needs care. */
export interface RemoteScriptAttentionInput {
  installed: boolean;
  installedVersion: string | null;
  /** The installed files' build ID. */
  installedBuild: string | null;
  running: boolean;
  runningVersion: string | null;
  /** The build ID Live loaded; null from a script too old to report one. */
  runningBuild: string | null;
  /** The port another program answered on, when it isn't our script. */
  otherOnPort: number | null;
  /** Installed differs from this build and isn't newer (or is unreadable). */
  updateAvailable: boolean;
}

/**
 * What the user has to do about the remote script: "update" when the installed
 * copy is behind this build, "restart" when Live runs a different copy than the
 * installed one. Null when neither, when it isn't installed, and when another
 * program answers on the port (that is not a stale script).
 *
 * Shared by the ppal-connect line and the chat UI badge so they agree.
 *
 * @param status - The remote script status
 * @returns The action needed, or null
 */
export function remoteScriptAttention(
  status: RemoteScriptAttentionInput,
): "update" | "restart" | null {
  if (!status.installed || status.otherOnPort != null) {
    return null;
  }

  if (status.updateAvailable) {
    return "update";
  }

  return liveRunsOtherCopy(status) ? "restart" : null;
}

/**
 * Whether Live is running a different copy than the one on disk: another
 * version, or another build of the same one. A restart fixes it either way
 * (after an update, or a downgrade). Compared with `!==`, not `isNewerVersion`,
 * since a restart is due in either direction.
 *
 * @param status - The remote script status
 * @returns True when Live needs a restart to load the installed copy
 */
export function liveRunsOtherCopy(
  status: Pick<
    RemoteScriptAttentionInput,
    | "running"
    | "runningVersion"
    | "installedVersion"
    | "runningBuild"
    | "installedBuild"
  >,
): boolean {
  if (
    !status.running ||
    status.runningVersion == null ||
    status.installedVersion == null
  ) {
    return false;
  }

  return (
    status.runningVersion !== status.installedVersion ||
    (status.runningBuild != null &&
      status.installedBuild != null &&
      status.runningBuild !== status.installedBuild)
  );
}

/** What decides whether the installation is unfinished. */
export interface InstallIncompleteInput {
  /** Why the device can't be copied, or null when it can. */
  problem: string | null;
  /** The User Library copy compared with the device; null with a problem. */
  state: string | null;
  /**
   * Whether the remote script in the User Library is in place and not behind
   * this build. Null when there is no User Library to look in, or it hasn't
   * been read yet.
   */
  remoteScriptCurrent: boolean | null;
}

/**
 * Whether the installation is unfinished: the User Library has no copy of this
 * device or an older one (only a frozen device can be copied; a newer or
 * different copy is the user's call), or its remote script is missing or behind
 * this build. The one definition the device's notice and the chat UI's
 * Installation tab dot both go by.
 *
 * @param input - The device copy and remote script facts
 * @returns Whether something in the User Library is missing or out of date
 */
export function isInstallIncomplete(input: InstallIncompleteInput): boolean {
  const copyBehind =
    input.problem == null &&
    (input.state === "not-installed" || input.state === "installed-older");

  // With no User Library there is nothing to compare, so nothing to nag about.
  return copyBehind || input.remoteScriptCurrent === false;
}

/**
 * @param version - A version a status reported, or null
 * @returns The version to show, never "vnull"
 */
export function versionText(version: string | null): string {
  return version == null ? "an unknown version" : `v${version}`;
}

// Version check wording, shared with the portal: keep imports portal-safe.

/** The call that re-checks versions without re-sending the Skills and context. */
export const VERSION_CHECK_CALL = "ppal-connect with versionCheck: true";

/** Follows the check where the chat may not have called ppal-connect yet (it needs Skills). */
export const VERSION_CHECK_NEVER_CONNECTED =
  "(If this chat hasn't called ppal-connect yet, call it without versionCheck.)";

/** Added where a connect result tells the user to restart Live. */
export const AFTER_RESTART_CHECK = `Once they have, call ${VERSION_CHECK_CALL}.`;

/** Ends a version check that found nothing to fix. */
export const UP_TO_DATE_NEW_CHAT =
  "Everything is up to date. If this chat only connected and updated Producer Pal, suggest the user start a new chat so it loads the new version's skills and tools.";
