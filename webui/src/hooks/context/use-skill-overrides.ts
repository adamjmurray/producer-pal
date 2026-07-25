// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-utils";
import {
  getSkillOverrideUrl,
  getSkillOverridesUrl,
} from "#webui/utils/mcp-url";
import {
  runGuardedRefresh,
  type SaveStatus,
  useRefreshOnFocusAndPoll,
  useSaveRefreshGuard,
  useWriteOrdering,
} from "./use-doc";

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
  /** Clear the save indicator (call when the edited slot changes). */
  resetSaveStatus: () => void;
}

/**
 * Read/write the user's built-in skills-fragment overrides
 * (~/.producer-pal/skills/<slot>.md) as one collection. The list GET returns
 * every slot with its built-in, current override, and drift; per-slot writes
 * (PUT/DELETE) echo back the single updated slot, which is merged into the
 * cached list. Focus + interval polling surfaces external writes, and a
 * save-overlap guard keeps a slow poll from clobbering a concurrent save's echo
 * — the same coordination the single-document {@link useDoc} uses.
 *
 * @returns Slot collection state plus per-slot save/reset and refresh actions
 */
export function useSkillOverrides(): UseSkillOverridesReturn {
  const [status, setStatus] = useState<SkillOverridesStatus>({
    kind: "loading",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Bumped whenever the edited slot changes (via resetSaveStatus). A save
  // captures this at dispatch; if it has advanced by the time the save
  // resolves, the user switched slots, so the outcome must not paint the
  // shared "saved"/"error" indicator onto the now-active slot (the list merge
  // still applies — only the status indicator is slot-scoped).
  const saveGenerationRef = useRef(0);
  // Per-SLOT write ordering, so two overlapping saves of one slot resolve to
  // the newest (see writeSlot) while unrelated slots never interfere.
  // Same refresh-vs-save coordination as useDoc (a focus/poll read can
  // resolve older slot data than a concurrent save's echo and, landing last,
  // clobber it), just over the slot collection instead of one document.
  const { claim } = useWriteOrdering();
  const { beginSave, endSave, guardRefresh, isUnmounted } =
    useSaveRefreshGuard();

  const refresh = useCallback(
    (): Promise<void> =>
      runGuardedRefresh(
        guardRefresh,
        fetchSlots,
        (slots) => setStatus({ kind: "ready", slots }),
        (message) => setStatus({ kind: "error", message }),
      ),
    [guardRefresh],
  );

  const writeSlot = useCallback(
    async (
      name: string,
      write: () => Promise<SkillSlotView>,
    ): Promise<boolean> => {
      const generation = saveGenerationRef.current;
      // Slots autosave through useContextEditorState (a debounce flush, then a
      // blur flush right behind it), so two writes of ONE slot overlap and the
      // older echo can land last. Merging it would put `override` back, flip the
      // status SkillSlotScreen memoizes off this list, and raise a spurious
      // "updated outside the editor" banner whose Reload adopts the superseded
      // content. Ordering is per slot, so a write to another slot never
      // interferes.
      const superseded = claim(name);

      beginSave();
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const updated = await write();

        if (isUnmounted()) return true;
        if (!superseded()) setStatus((prev) => mergeSlot(prev, updated));

        if (saveGenerationRef.current === generation) setSaveStatus("saved");

        return true;
      } catch (error: unknown) {
        if (isUnmounted()) return false;

        if (saveGenerationRef.current === generation) {
          setSaveError(errorMessage(error));
          setSaveStatus("error");
        }

        return false;
      } finally {
        endSave();
      }
    },
    [beginSave, endSave, claim, isUnmounted],
  );

  const saveSlot = useCallback(
    (name: string, content: string): Promise<boolean> =>
      writeSlot(name, () => putSlot(name, content)),
    [writeSlot],
  );

  const resetSlot = useCallback(
    (name: string): Promise<boolean> => writeSlot(name, () => deleteSlot(name)),
    [writeSlot],
  );

  const resetSaveStatus = useCallback((): void => {
    saveGenerationRef.current += 1;
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRefreshOnFocusAndPoll(refresh);

  return {
    status,
    saveStatus,
    saveError,
    saveSlot,
    resetSlot,
    refresh,
    resetSaveStatus,
  };
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
