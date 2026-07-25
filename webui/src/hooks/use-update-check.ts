// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { BUILD_SHA, VERSION } from "#src/shared/config";
import { checkForUpdate, type UpdateInfo } from "#src/shared/version-check";

/**
 * Checks for a newer version of Producer Pal on mount.
 * @returns The available update, or null when up to date
 */
export function useUpdateCheck(): UpdateInfo | null {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    void checkForUpdate(VERSION, BUILD_SHA).then((result) => {
      if (result) setUpdate(result);
    });
  }, []);

  return update;
}
