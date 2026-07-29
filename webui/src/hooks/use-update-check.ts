// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { type UpdateInfo } from "#src/shared/version-check";

/**
 * Reads the server's update check on mount.
 *
 * Deliberately NOT a GitHub request. GitHub's unauthenticated API is rate
 * limited per IP, and this UI remounts every time the chat window is opened —
 * calling GitHub here spent that budget on a value that cannot change while the
 * server is running. The server checks once at startup and serves the answer
 * from memory (src/mcp-server/helpers/http/update-check.ts), so this is a
 * local round-trip.
 * @returns The available update, or null when up to date
 */
export function useUpdateCheck(): UpdateInfo | null {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/update", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) return;

        const result = (await response.json()) as UpdateInfo | null;

        if (result) setUpdate(result);
      } catch {
        // The update badge is decoration — a failed read (including this
        // effect's own abort on unmount) just doesn't show it.
      }
    })();

    return () => controller.abort();
  }, []);

  return update;
}
