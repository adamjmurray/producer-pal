// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import {
  getSkillOverrideUrl,
  getSkillOverridesUrl,
} from "#webui/utils/mcp-url";
import {
  runGuardedRefresh,
  useCollectionMutator,
  type SaveStatus,
  useRefreshOnFocusAndPoll,
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
  /** Whether this fragment is included in the assembled skills. */
  enabled: boolean;
  /** Whether to offer an off switch (false for the whole-document drivers). */
  canDisable: boolean;
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
  /** Switch one slot's fragment on or off, leaving any override body alone. */
  setSlotEnabled: (name: string, enabled: boolean) => Promise<boolean>;
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
  const { saveStatus, saveError, resetSaveStatus, guardRefresh, mutate } =
    useCollectionMutator();

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

  // Slots autosave through useContextEditorState (a debounce flush, then a blur
  // flush right behind it), so two writes of ONE slot overlap and the older echo
  // can land last. Merging it would put `override` back, flip the status
  // SkillSlotScreen memoizes off this list, and raise a spurious "updated
  // outside the editor" banner whose Reload adopts the superseded content —
  // hence the per-slot claim (a write to another slot never interferes).
  // `mutate` resolves the slot on success and null on failure, and a slot view
  // is never itself null, so the null check is the success signal.
  const writeSlot = useCallback(
    async (
      name: string,
      write: () => Promise<SkillSlotView>,
    ): Promise<boolean> => {
      const updated = await mutate(
        write,
        (slot) => setStatus((prev) => mergeSlot(prev, slot)),
        [name],
      );

      return updated !== null;
    },
    [mutate],
  );

  const saveSlot = useCallback(
    (name: string, content: string): Promise<boolean> =>
      writeSlot(name, () => putSlot(name, { content })),
    [writeSlot],
  );

  const setSlotEnabled = useCallback(
    (name: string, enabled: boolean): Promise<boolean> =>
      writeSlot(name, () => putSlot(name, { enabled })),
    [writeSlot],
  );

  const resetSlot = useCallback(
    (name: string): Promise<boolean> => writeSlot(name, () => deleteSlot(name)),
    [writeSlot],
  );

  useRefreshOnFocusAndPoll(refresh);

  return {
    status,
    saveStatus,
    saveError,
    saveSlot,
    setSlotEnabled,
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
  /** Optional so a slot from an older server reads as on rather than off. */
  enabled?: boolean;
  canDisable?: boolean;
}

/** The fields a per-slot PUT may carry; either alone is a valid write. */
interface SlotWriteBody {
  content?: string;
  enabled?: boolean;
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
 * PUT one slot's override body and/or its on/off flag. An omitted field is left
 * exactly as stored, so a toggle never clobbers an in-flight body save.
 * @param name - The slot name
 * @param write - The body (blank resets to built-in) and/or the flag
 * @returns The server's echo of the updated slot
 */
async function putSlot(
  name: string,
  write: SlotWriteBody,
): Promise<SkillSlotView> {
  return await sendSlot(getSkillOverrideUrl(name), "PUT", write);
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
 * @param jsonBody - Optional JSON request body (PUT only)
 * @returns The server's echo of the updated slot
 */
async function sendSlot(
  url: string,
  method: "PUT" | "DELETE",
  jsonBody?: SlotWriteBody,
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
    // Both flags default the safe way when a field is absent: the fragment
    // ships, and the toggle shows.
    enabled: raw.enabled !== false,
    canDisable: raw.canDisable !== false,
    drifted: raw.drifted,
    forkedFromVersion: raw.provenance?.producerPalVersion ?? null,
  };
}
