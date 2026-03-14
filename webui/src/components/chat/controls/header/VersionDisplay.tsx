// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const UPGRADE_URL = "https://producer-pal.org/installation/upgrading";

interface VersionDisplayProps {
  version: string;
  latestVersion: string | null;
}

/**
 * Displays the current version and an update link when a newer version is available.
 * @param props - Component props
 * @param props.version - Current version string
 * @param props.latestVersion - Latest available version, or null if up to date
 * @returns Version display element
 */
export function VersionDisplay({
  version,
  latestVersion,
}: VersionDisplayProps) {
  return (
    <span className="hidden sm:inline text-xs text-zinc-500 dark:text-zinc-400 font-normal">
      v{version}
      {latestVersion && (
        <>
          {" "}
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-500 dark:text-sky-400 hover:underline"
            title={`v${latestVersion} available — click for upgrade instructions`}
            onClick={(e) => e.stopPropagation()}
          >
            (update)
          </a>
        </>
      )}
    </span>
  );
}
