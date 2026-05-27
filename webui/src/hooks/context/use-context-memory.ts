// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { getConfigUrl } from "#webui/utils/mcp-url";

/**
 * Status of the project context memory body. `disabled` is intentionally
 * absent: the user can always read/edit memory from the webui. The
 * `enabled` flag (returned separately) only gates whether the AI sees it.
 */
export type ContextMemoryStatus =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "error"; message: string };

/** Save lifecycle state */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseContextMemoryReturn {
  status: ContextMemoryStatus;
  /** Whether the AI sees project memory (the device's `memoryEnabled` flag). */
  enabled: boolean;
  /** Whether the AI is allowed to write to memory (`memoryWritable`). */
  writable: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Write content to memory. Resolves to true on success, false on failure. */
  save: (content: string) => Promise<boolean>;
  /** Flip the `memoryEnabled` device flag. */
  setEnabled: (next: boolean) => Promise<boolean>;
  /** Flip the `memoryWritable` device flag (AI-write permission). */
  setWritable: (next: boolean) => Promise<boolean>;
  /** Clear stored memory content. Same channel as save(""). */
  clear: () => Promise<boolean>;
  /** Re-read memory from the server (e.g. when tab becomes visible). */
  refresh: () => Promise<void>;
}

interface ConfigResponse {
  memoryEnabled?: boolean;
  memoryContent?: string;
  memoryWritable?: boolean;
  // Other config fields exist but are not relevant to the editor.
  [key: string]: unknown;
}

/**
 * Read and write the project context memory blob via the device's
 * `/config` REST endpoint. This bypasses the `ppal-context` tool's
 * `memoryWritable` gate (which is intended to control AI write access,
 * not user-driven UI edits) and is the same channel the Max device uses
 * for the inline memory textedit.
 * @returns Memory state plus save/refresh/toggle actions
 */
export function useContextMemory(): UseContextMemoryReturn {
  const [status, setStatus] = useState<ContextMemoryStatus>({
    kind: "loading",
  });
  const [enabled, setEnabledState] = useState<boolean>(false);
  const [writable, setWritableState] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const applyConfig = useCallback((config: ConfigResponse): void => {
    setStatus({ kind: "ready", content: config.memoryContent ?? "" });
    setEnabledState(Boolean(config.memoryEnabled));
    setWritableState(Boolean(config.memoryWritable));
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const config = await fetchConfig();

      applyConfig(config);
    } catch (error: unknown) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }, [applyConfig]);

  const save = useCallback(
    async (content: string): Promise<boolean> => {
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const config = await postConfig({ memoryContent: content });

        applyConfig(config);
        setSaveStatus("saved");

        return true;
      } catch (error: unknown) {
        const message = errorMessage(error);

        setSaveError(message);
        setSaveStatus("error");

        return false;
      }
    },
    [applyConfig],
  );

  const postFlag = useCallback(
    async (partial: Partial<ConfigResponse>): Promise<boolean> => {
      try {
        const config = await postConfig(partial);

        applyConfig(config);

        return true;
      } catch (error: unknown) {
        setSaveError(errorMessage(error));

        return false;
      }
    },
    [applyConfig],
  );

  const setEnabled = useCallback(
    (next: boolean): Promise<boolean> => postFlag({ memoryEnabled: next }),
    [postFlag],
  );

  const setWritable = useCallback(
    (next: boolean): Promise<boolean> => postFlag({ memoryWritable: next }),
    [postFlag],
  );

  const clear = useCallback((): Promise<boolean> => save(""), [save]);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-fetch when the window regains focus so device-side changes
  // (memoryEnabled/memoryWritable toggles in Max, AI writes that happened
  // while the tab was elsewhere) surface when the user returns. The editor
  // doc is uncontrolled and seeded once, so this updates the toggles +
  // status without clobbering an in-progress draft.
  useEffect(() => {
    const handleFocus = (): void => {
      void refresh();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  return {
    status,
    enabled,
    writable,
    saveStatus,
    saveError,
    save,
    setEnabled,
    setWritable,
    clear,
    refresh,
  };
}

// --- Helpers below main export ---

/**
 * GET the device config object. Bypasses the browser cache so the editor
 * always reflects the device's current memory on page load and after AI
 * writes that occurred while the tab was elsewhere.
 * @returns Parsed config response
 */
async function fetchConfig(): Promise<ConfigResponse> {
  const response = await fetch(getConfigUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Config request failed (${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as ConfigResponse;
}

/**
 * POST a partial config update. The server merges and emits to the Max
 * device, then echoes the full updated config.
 * @param partial - Fields to update
 * @returns Updated config response
 */
async function postConfig(
  partial: Partial<ConfigResponse>,
): Promise<ConfigResponse> {
  const response = await fetch(getConfigUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });

  if (!response.ok) {
    throw new Error(
      `Config update failed (${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as ConfigResponse;
}

/**
 * Extract a string error message from an unknown thrown value.
 * @param error - Caught value
 * @returns Message string
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
