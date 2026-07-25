// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-utils";
import {
  DEFAULT_NOTATION,
  isNotation,
  type Notation,
} from "#src/shared/notation";
import { getConfigUrl, getSkillsPreviewUrl } from "#webui/utils/mcp-url";

/** A notation + small-model-mode combination that selects a skills blob. */
export interface SkillsCombination {
  notation: Notation;
  smallModelMode: boolean;
}

/** One assembled preview, with its size derived client-side. */
export interface SkillsPreview extends SkillsCombination {
  /** The active notation head slot name (e.g. "stark"). */
  head: string;
  /** The active driver slot name (e.g. "basic"); it inlines the core body. */
  driver: string;
  /** The assembled "# Producer Pal Skills" blob. */
  skills: string;
  /** Exact character count of the blob (token estimate is derived at display). */
  charCount: number;
  /** Non-fatal assembly warnings (unknown/nested/unsafe refs); [] when clean. */
  warnings: string[];
}

/** Status of the currently-selected combination's preview. */
export type SkillsPreviewStatus =
  | { kind: "loading" }
  | { kind: "ready"; preview: SkillsPreview }
  | { kind: "error"; message: string };

export interface UseSkillsPreviewReturn {
  status: SkillsPreviewStatus;
  /** The combination being previewed. */
  selected: SkillsCombination;
  /** The device's live combination (null until /config resolves). */
  currentMode: SkillsCombination | null;
  setNotation: (notation: Notation) => void;
  setSmallModelMode: (smallModelMode: boolean) => void;
}

/**
 * Drive the Skills "Preview" view: fetch the assembled skills blob for the
 * selected notation + small-model combination, and read the device's live
 * combination from /config so the view can default to it and badge it as "live".
 * The selection defaults to the live combination once /config resolves, unless
 * the user has already picked one. Each selection change refetches with an
 * AbortController so an out-of-order response can't clobber a newer one.
 *
 * @returns Preview status, the selected + live combinations, and setters
 */
export function useSkillsPreview(): UseSkillsPreviewReturn {
  const [selected, setSelected] = useState<SkillsCombination>({
    notation: DEFAULT_NOTATION,
    smallModelMode: false,
  });
  const [currentMode, setCurrentMode] = useState<SkillsCombination | null>(
    null,
  );
  const [status, setStatus] = useState<SkillsPreviewStatus>({
    kind: "loading",
  });
  // Once the user picks a combination, stop auto-syncing the selection to the
  // live mode when /config resolves (the user's choice wins).
  const userPickedRef = useRef(false);

  const setNotation = useCallback((notation: Notation): void => {
    userPickedRef.current = true;
    setSelected((prev) => ({ ...prev, notation }));
  }, []);

  const setSmallModelMode = useCallback((smallModelMode: boolean): void => {
    userPickedRef.current = true;
    setSelected((prev) => ({ ...prev, smallModelMode }));
  }, []);

  // Read the live combination once; default the selection to it if untouched.
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const mode = await fetchCurrentMode(controller.signal);

      if (mode == null || controller.signal.aborted) return;

      setCurrentMode(mode);

      // Adopt the live mode as the selection, but keep the same object when it
      // already matches: a new-but-equal reference would re-run the preview
      // effect, flashing the loading state and refetching an identical blob.
      if (!userPickedRef.current) {
        setSelected((prev) => (sameCombination(prev, mode) ? prev : mode));
      }
    })();

    return () => controller.abort();
  }, []);

  // (Re)fetch the preview whenever the selected combination changes.
  useEffect(() => {
    const controller = new AbortController();

    setStatus({ kind: "loading" });

    void (async () => {
      try {
        const preview = await fetchPreview(selected, controller.signal);

        // A newer selection aborted this request; don't clobber its result.
        if (controller.signal.aborted) return;

        setStatus({ kind: "ready", preview });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;

        setStatus({ kind: "error", message: errorMessage(error) });
      }
    })();

    return () => controller.abort();
  }, [selected]);

  return { status, selected, currentMode, setNotation, setSmallModelMode };
}

// --- Helpers below main export ---

/**
 * Whether two combinations select the same skills blob (value equality).
 * @param a - First combination
 * @param b - Second combination
 * @returns True when both fields match
 */
function sameCombination(a: SkillsCombination, b: SkillsCombination): boolean {
  return a.notation === b.notation && a.smallModelMode === b.smallModelMode;
}

/** Server shape of a /skills-preview response. */
interface RawPreview {
  notation?: unknown;
  smallModelMode?: unknown;
  head?: unknown;
  driver?: unknown;
  skills?: unknown;
  warnings?: unknown;
}

/**
 * Fetch and size the assembled preview for a combination.
 * @param combination - The notation + small-model combination to preview
 * @param signal - Abort signal for the request
 * @returns The assembled preview with client-side size counts
 */
async function fetchPreview(
  combination: SkillsCombination,
  signal: AbortSignal,
): Promise<SkillsPreview> {
  const response = await fetch(
    getSkillsPreviewUrl(combination.notation, combination.smallModelMode),
    { signal, cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(
      `Skills preview failed (${response.status} ${response.statusText})`,
    );
  }

  const raw = (await response.json()) as RawPreview;
  const skills = typeof raw.skills === "string" ? raw.skills : "";

  return {
    notation: combination.notation,
    smallModelMode: combination.smallModelMode,
    head: typeof raw.head === "string" ? raw.head : "",
    driver: typeof raw.driver === "string" ? raw.driver : "",
    skills,
    charCount: skills.length,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}

/**
 * Read the device's live notation + small-model combination from /config.
 * @param signal - Abort signal for the request
 * @returns The live combination, or null when the fetch fails/aborts
 */
async function fetchCurrentMode(
  signal: AbortSignal,
): Promise<SkillsCombination | null> {
  try {
    const response = await fetch(getConfigUrl(), { signal, cache: "no-store" });

    if (!response.ok) return null;

    const config = (await response.json()) as {
      notation?: unknown;
      smallModelMode?: unknown;
    };

    return {
      notation: isNotation(config.notation)
        ? config.notation
        : DEFAULT_NOTATION,
      smallModelMode: Boolean(config.smallModelMode),
    };
  } catch {
    return null;
  }
}
