// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  getSkillOverrideUrl,
  getSkillOverridesUrl,
} from "#webui/utils/mcp-url";
import { type SaveStatus } from "./use-doc-memory";

/** How often to re-read the slots while the editor is open and focused. */
const POLL_INTERVAL_MS = 5000;

/** One overridable skills fragment, as the editor needs it. */
export interface SkillSlotView {
  /** Stable public slot name (keys the override file). */
  name: string;
  /** Human label for the dropdown. */
  title: string;
  /** One-line explainer shown beside the dropdown. */
  description: string;
  /** The current release-tuned built-in fragment (read-only reference pane). */
  builtIn: string;
  /** The user's override body ("" when the slot tracks the built-in). */
  override: string;
  /** Whether the built-in changed since this override was forked. */
  drifted: boolean;
  /** Producer Pal version the override was forked from (null when none). */
  forkedFromVersion: string | null;
}

/** Status of the whole slot collection. */
export type SkillOverridesStatus =
  | { kind: "loading" }
  | { kind: "ready"; slots: SkillSlotView[] }
  | { kind: "error"; message: string };

export interface UseSkillOverridesReturn {
  status: SkillOverridesStatus;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Save an override for one slot (blank content resets it to the built-in). */
  saveSlot: (name: string, content: string) => Promise<boolean>;
  /** Reset one slot to the built-in (delete its override file). */
  resetSlot: (name: string) => Promise<boolean>;
  /** Re-read all slots from the server. */
  refresh: () => Promise<void>;
}

/**
 * Read/write the user's built-in skills-fragment overrides
 * (~/.producer-pal/skills/<slot>.md) as one collection. The list GET returns
 * every slot with its built-in, current override, and drift; per-slot writes
 * (PUT/DELETE) echo back the single updated slot, which is merged into the
 * cached list. Focus + interval polling surfaces external writes, and a
 * save-overlap guard keeps a slow poll from clobbering a concurrent save's echo
 * — the same coordination the single-document {@link useDocMemory} uses.
 *
 * @returns Slot collection state plus per-slot save/reset and refresh actions
 */
export function useSkillOverrides(): UseSkillOverridesReturn {
  const [status, setStatus] = useState<SkillOverridesStatus>({
    kind: "loading",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Same refresh-vs-save coordination as useDocMemory: a focus/poll read can
  // resolve older slot data than a concurrent save's echo and, if it lands
  // last, clobber it. saveCountRef counts in-flight saves; saveGenRef counts
  // saves ever started. A refresh trusts its result only if none overlapped.
  const saveCountRef = useRef(0);
  const saveGenRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const saveInFlightAtStart = saveCountRef.current;
    const saveGenAtStart = saveGenRef.current;
    const supersededBySave = (): boolean =>
      saveInFlightAtStart > 0 || saveGenRef.current !== saveGenAtStart;

    try {
      const slots = await fetchSlots();

      if (supersededBySave()) return;

      setStatus({ kind: "ready", slots });
    } catch (error: unknown) {
      if (supersededBySave()) return;

      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }, []);

  const writeSlot = useCallback(
    async (write: () => Promise<SkillSlotView>): Promise<boolean> => {
      saveCountRef.current++;
      saveGenRef.current++;
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const updated = await write();

        setStatus((prev) => mergeSlot(prev, updated));
        setSaveStatus("saved");

        return true;
      } catch (error: unknown) {
        setSaveError(errorMessage(error));
        setSaveStatus("error");

        return false;
      } finally {
        saveCountRef.current--;
      }
    },
    [],
  );

  const saveSlot = useCallback(
    (name: string, content: string): Promise<boolean> =>
      writeSlot(() => putSlot(name, content)),
    [writeSlot],
  );

  const resetSlot = useCallback(
    (name: string): Promise<boolean> => writeSlot(() => deleteSlot(name)),
    [writeSlot],
  );

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-fetch on focus so device/AI/hand writes made while the tab was elsewhere
  // surface on return. Polling is focus-gated to avoid idle background traffic.
  useEffect(() => {
    const handleFocus = (): void => {
      void refresh();
    };

    window.addEventListener("focus", handleFocus);
    const id = setInterval(() => {
      if (document.hasFocus()) void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(id);
    };
  }, [refresh]);

  return { status, saveStatus, saveError, saveSlot, resetSlot, refresh };
}

// --- Helpers below main export ---

/** Server shape for one slot in the /skill-overrides responses. */
interface RawSkillSlot {
  name: string;
  title: string;
  description: string;
  builtIn: string;
  override: string;
  drifted: boolean;
  provenance: { producerPalVersion: string } | null;
}

/**
 * GET the full slot collection.
 * @returns Every slot's built-in, override, and drift state
 */
async function fetchSlots(): Promise<SkillSlotView[]> {
  const response = await fetch(getSkillOverridesUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Skills request failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as { slots?: RawSkillSlot[] };

  return (body.slots ?? []).map(toView);
}

/**
 * PUT an override for one slot.
 * @param name - The slot name
 * @param content - The override body (blank resets to built-in)
 * @returns The server's echo of the updated slot
 */
async function putSlot(name: string, content: string): Promise<SkillSlotView> {
  return await sendSlot(getSkillOverrideUrl(name), "PUT", { content });
}

/**
 * DELETE one slot's override (reset to built-in).
 * @param name - The slot name
 * @returns The server's echo of the reset slot
 */
async function deleteSlot(name: string): Promise<SkillSlotView> {
  return await sendSlot(getSkillOverrideUrl(name), "DELETE");
}

/**
 * Send a per-slot write and parse the echoed slot.
 * @param url - The per-slot endpoint URL
 * @param method - HTTP method ("PUT" or "DELETE")
 * @param jsonBody - Optional JSON request body
 * @param jsonBody.content - The override body to send (PUT only)
 * @returns The server's echo of the updated slot
 */
async function sendSlot(
  url: string,
  method: "PUT" | "DELETE",
  jsonBody?: { content: string },
): Promise<SkillSlotView> {
  const response = await fetch(url, {
    method,
    headers: jsonBody ? { "Content-Type": "application/json" } : undefined,
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `Skills update failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as { slot: RawSkillSlot };

  return toView(body.slot);
}

/**
 * Replace the matching slot in a ready status with the server's echo. A
 * non-ready status is returned unchanged (a save can only follow a load).
 * @param prev - The previous collection status
 * @param updated - The server's echo of one slot
 * @returns The status with that slot replaced
 */
function mergeSlot(
  prev: SkillOverridesStatus,
  updated: SkillSlotView,
): SkillOverridesStatus {
  if (prev.kind !== "ready") return prev;

  return {
    kind: "ready",
    slots: prev.slots.map((slot) =>
      slot.name === updated.name ? updated : slot,
    ),
  };
}

/**
 * Map a server slot record to the editor's view shape.
 * @param raw - The server slot record
 * @returns The editor view of that slot
 */
function toView(raw: RawSkillSlot): SkillSlotView {
  return {
    name: raw.name,
    title: raw.title,
    description: raw.description,
    builtIn: raw.builtIn,
    override: raw.override,
    drifted: raw.drifted,
    forkedFromVersion: raw.provenance?.producerPalVersion ?? null,
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
