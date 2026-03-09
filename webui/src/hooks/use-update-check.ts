// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { VERSION } from "#src/shared/version";
import { checkForUpdate } from "#src/shared/version-check";

/**
 * Checks for a newer version of Producer Pal on mount.
 * @returns The latest version string if an update is available, otherwise null
 */
export function useUpdateCheck(): string | null {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    void checkForUpdate(VERSION).then((update) => {
      if (update) setLatestVersion(update.version);
    });
  }, []);

  return latestVersion;
}
