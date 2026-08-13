// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { getSettingsUrl } from "#webui/utils/mcp-url";

export interface GlobalSettings {
  autoUpdateCheck: boolean;
  dismissedUpdateVersion: string | null;
}

export interface UseGlobalSettingsReturn {
  /** Whether the server may check GitHub for a newer release. */
  autoUpdateCheck: boolean;
  /** Persist a new value immediately; reverts on a failed write. */
  setAutoUpdateCheck: (enabled: boolean) => void;
}

/**
 * PUT a partial patch to the machine-global settings file
 * (~/.producer-pal/settings.json).
 *
 * Not a hook — the update-check badge dismisses from outside any settings
 * screen, so both callers share this one writer.
 *
 * @param patch - Fields to change
 * @returns Whether the write succeeded
 */
export async function patchGlobalSettings(
  patch: Partial<GlobalSettings>,
): Promise<boolean> {
  try {
    const response = await fetch(getSettingsUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      console.error(`PUT /settings returned ${response.status}`);
    }

    return response.ok;
  } catch (err) {
    // The chat UI has no toast surface, so the devtools console is as far as a
    // failure can surface. The optimistic value is reverted by the caller.
    console.error("PUT /settings failed:", err);

    return false;
  }
}

/**
 * Reads the machine-global settings on mount and writes changes back.
 *
 * These are machine-wide preferences that also govern the Max for Live device,
 * not per-conversation settings, so they apply on change rather than waiting for
 * the settings modal's Save button — the same way that tab's Delete buttons act
 * immediately.
 *
 * @returns The current settings and their setters
 */
export function useGlobalSettings(): UseGlobalSettingsReturn {
  // Starts at the server-side default and is corrected when the fetch lands.
  // Guessing wrong here is harmless: the checkbox is the only reader, and a
  // stale render is replaced before the user can act on it.
  const [autoUpdateCheck, setLocalAutoUpdateCheck] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(getSettingsUrl(), {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) return;

        const settings = (await response.json()) as Partial<GlobalSettings>;

        setLocalAutoUpdateCheck(settings.autoUpdateCheck !== false);
      } catch {
        // Server not available or the effect aborted on unmount — keep the
        // default. A settings screen that can't reach the server can't save
        // either, so there's nothing better to show.
      }
    })();

    return () => controller.abort();
  }, []);

  const setAutoUpdateCheck = useCallback((enabled: boolean) => {
    setLocalAutoUpdateCheck(enabled);
    void patchGlobalSettings({ autoUpdateCheck: enabled }).then((ok) => {
      if (!ok) setLocalAutoUpdateCheck(!enabled);
    });
  }, []);

  return { autoUpdateCheck, setAutoUpdateCheck };
}
