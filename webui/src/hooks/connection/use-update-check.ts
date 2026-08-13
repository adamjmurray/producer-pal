// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { type UpdateInfo } from "#src/shared/version-check";
import { patchGlobalSettings } from "#webui/hooks/connection/use-global-settings";
import { getUpdateUrl } from "#webui/utils/mcp-url";

export interface UseUpdateCheckReturn {
  /** The available update, or null when up to date, dismissed, or opted out. */
  update: UpdateInfo | null;
  /** Hide this version's notification here and in the device, for good. */
  dismissUpdate: () => void;
}

/**
 * Reads the server's update check on mount.
 *
 * Deliberately NOT a GitHub request. GitHub's unauthenticated API is rate
 * limited per IP, and this UI remounts every time the chat window is opened —
 * calling GitHub here spent that budget on a value that cannot change while the
 * server is running. The server checks once at startup and serves the answer
 * from memory (src/mcp-server/helpers/http/update-check.ts), so this is a
 * local round-trip.
 *
 * Routed through `getUpdateUrl()` rather than the bare path every other endpoint
 * used to be: under `npm run ui:dev` the page is served by Vite on port 5173 with
 * no proxy, so a same-origin `/update` 404s and the badge never appears. The
 * builder's 5173 → localhost:3350 special case is what keeps it working in dev.
 * @returns The available update and a dismiss action
 */
export function useUpdateCheck(): UseUpdateCheckReturn {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(getUpdateUrl(), {
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

  // Recorded server-side rather than in localStorage so the device's own update
  // notification honors the same dismissal — /update is the single answer both
  // surfaces read. Hidden optimistically; a failed write only means it comes
  // back on the next mount.
  const dismissUpdate = useCallback(() => {
    if (!update) return;

    setUpdate(null);
    void patchGlobalSettings({ dismissedUpdateVersion: update.version });
  }, [update]);

  return { update, dismissUpdate };
}
