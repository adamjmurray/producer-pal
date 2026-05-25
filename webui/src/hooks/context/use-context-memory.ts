// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { getConfigUrl } from "#webui/utils/mcp-url";

/** Status of the project context memory */
export type ContextMemoryStatus =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "disabled" }
  | { kind: "error"; message: string };

/** Save lifecycle state */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseContextMemoryReturn {
  status: ContextMemoryStatus;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Write content to memory. Resolves once the server responds. */
  save: (content: string) => Promise<void>;
  /** Re-read memory from the server (e.g. when tab becomes visible). */
  refresh: () => Promise<void>;
}

interface ConfigResponse {
  memoryEnabled?: boolean;
  memoryContent?: string;
  // Other config fields exist but are not relevant to the editor.
  [key: string]: unknown;
}

/**
 * Read and write the project context memory blob via the device's
 * `/config` REST endpoint. This bypasses the `ppal-context` tool's
 * `memoryWritable` gate (which is intended to control AI write access,
 * not user-driven UI edits) and is the same channel the Max device uses
 * for the inline memory textedit.
 * @returns Memory state plus save/refresh actions
 */
export function useContextMemory(): UseContextMemoryReturn {
  const [status, setStatus] = useState<ContextMemoryStatus>({
    kind: "loading",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const config = await fetchConfig();

      setStatus(toStatus(config));
    } catch (error: unknown) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }, []);

  const save = useCallback(async (content: string): Promise<void> => {
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const config = await postConfig({ memoryContent: content });

      setStatus(toStatus(config));
      setSaveStatus("saved");
    } catch (error: unknown) {
      const message = errorMessage(error);

      setSaveError(message);
      setSaveStatus("error");
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, saveStatus, saveError, save, refresh };
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
 * Convert a config response into a status union.
 * @param config - Config object from the REST endpoint
 * @returns Status union
 */
function toStatus(config: ConfigResponse): ContextMemoryStatus {
  if (!config.memoryEnabled) return { kind: "disabled" };

  return {
    kind: "ready",
    content: config.memoryContent ?? "",
  };
}

/**
 * Extract a string error message from an unknown thrown value.
 * @param error - Caught value
 * @returns Message string
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
