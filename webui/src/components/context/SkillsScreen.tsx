// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { type UseSkillOverridesReturn } from "#webui/hooks/context/use-skill-overrides";
import { ContextHeader } from "./ContextScreen";
import { SkillSlotScreen } from "./SkillSlotScreen";

const CLOSE_ARIA_LABEL = "Close context editor";

interface SkillsScreenProps {
  /** The skills-overrides collection hook (mounted in ContextTabs). */
  overrides: UseSkillOverridesReturn;
  /** The Project | Global | Instructions | Skills tab strip. */
  tabSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * The Skills tab: pick a built-in skills fragment and override it. Owns the
 * selected-slot state (which must persist across slot switches) and delegates
 * the actual editing to {@link SkillSlotScreen}, keyed by slot so the editor
 * re-seeds on switch. Loading and error states reuse the shared context header.
 * @param props - Screen props
 * @returns Screen element
 */
export function SkillsScreen(props: SkillsScreenProps): preact.JSX.Element {
  const { overrides, tabSlot, onClose } = props;
  const [selected, setSelected] = useState<string | null>(null);

  if (overrides.status.kind !== "ready") {
    return (
      <StatusScreen
        tabSlot={tabSlot}
        onClose={onClose}
        message={
          overrides.status.kind === "error"
            ? overrides.status.message
            : "Loading skills…"
        }
        tone={overrides.status.kind === "error" ? "error" : "muted"}
      />
    );
  }

  const slots = overrides.status.slots;

  if (slots.length === 0) {
    return (
      <StatusScreen
        tabSlot={tabSlot}
        onClose={onClose}
        message="No skills fragments available."
        tone="muted"
      />
    );
  }

  // Length checked above, so index 0 is present (noUncheckedIndexedAccess).
  const first = slots[0] as (typeof slots)[number];
  const active = slots.find((slot) => slot.name === selected) ?? first;

  return (
    <SkillSlotScreen
      key={active.name}
      overrides={overrides}
      slots={slots}
      slot={active}
      onSelectSlot={setSelected}
      tabSlot={tabSlot}
      onClose={onClose}
    />
  );
}

// --- Helpers below main export ---

interface StatusScreenProps {
  tabSlot: preact.JSX.Element;
  onClose?: () => void;
  message: string;
  tone: "muted" | "error";
}

/**
 * Loading/error/empty state for the Skills tab: the shared header over a
 * centered message, so the tab strip and close button stay usable while the
 * slots load or when the fetch fails.
 * @param props - Status screen props
 * @returns Status screen element
 */
function StatusScreen(props: StatusScreenProps): preact.JSX.Element {
  const { tabSlot, onClose, message, tone } = props;
  const status =
    tone === "error" ? ({ kind: "error", message } as const) : undefined;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title="Skills"
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        status={status ?? { kind: "loading" }}
        saveStatus="idle"
        dirty={false}
        onClose={onClose}
      />
      <div
        className={`flex items-center justify-center flex-1 px-8 text-center ${
          tone === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-500"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
