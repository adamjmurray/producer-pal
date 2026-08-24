// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type UpdateInfo } from "#src/shared/version-check";

const UPGRADE_URL = "https://producer-pal.org/installation/upgrading";

interface VersionDisplayProps {
  version: string;
  build?: string;
  update: UpdateInfo | null;
  onDismissUpdate: () => void;
}

/**
 * Displays the current version and an update link when a newer version is available.
 * @param props - Component props
 * @param props.version - Current version string
 * @param props.build - Current build SHA, shown on hover to identify the exact artifact
 * @param props.update - Available update, or null if up to date
 * @param props.onDismissUpdate - Hide this version's notification for good
 * @returns Version display element
 */
export function VersionDisplay({
  version,
  build,
  update,
  onDismissUpdate,
}: VersionDisplayProps) {
  return (
    <span className="hidden text-xs font-normal text-zinc-500 sm:inline dark:text-zinc-400">
      <span title={build ? `Build ${build}` : undefined}>v{version}</span>
      {update && (
        <>
          {" "}
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-500 hover:underline dark:text-sky-400"
            title={`v${update.version} available — click for upgrade instructions`}
            onClick={(e) => e.stopPropagation()}
          >
            (update)
          </a>{" "}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismissUpdate();
            }}
            className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            aria-label={`Dismiss the v${update.version} update notification`}
            title="Dismiss until a newer version is released"
          >
            ×
          </button>
        </>
      )}
    </span>
  );
}
