// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EntryRow,
  NewEntryButton,
} from "#webui/components/context/collection/collection-list-parts";
import { type CustomSkillView } from "#webui/hooks/context/use-custom-skills-collection";

interface CustomSkillsListProps {
  /** All stored skills (sorted by name here for display). */
  entries: CustomSkillView[];
  /** The name of the skill being edited, or null while creating a new one. */
  selectedName: string | null;
  /** Whether the "new skill" form is active (highlights the New button). */
  creating: boolean;
  /** Select an existing skill to edit. */
  onSelect: (name: string) => void;
  /** Start a new (empty) skill. */
  onNew: () => void;
}

/**
 * Left pane: a "New skill" button above a flat, name-sorted list of the
 * user-authored skills. Disabled skills are dimmed and tagged "off" so it's
 * clear they aren't offered to the assistant. Unlike memory there is no type
 * grouping — a skill's only axes are its name and whether it's enabled.
 * @param props - List props
 * @returns List element
 */
export function CustomSkillsList(
  props: CustomSkillsListProps,
): preact.JSX.Element {
  const { entries, selectedName, creating, onSelect, onNew } = props;
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-3">
      <NewEntryButton label="+ New skill" active={creating} onClick={onNew} />
      {entries.length === 0 ? (
        <p className="px-1 text-xs text-zinc-400 dark:text-zinc-500">
          No custom skills yet.
        </p>
      ) : (
        sorted.map((entry) => (
          <EntryRow
            key={entry.name}
            name={entry.name}
            description={entry.description}
            selected={entry.name === selectedName}
            onSelect={onSelect}
            dimmed={!entry.enabled}
            trailing={!entry.enabled ? <OffTag /> : undefined}
          />
        ))
      )}
    </div>
  );
}

// --- Helpers below main export ---

/**
 * The small "off" tag shown beside a disabled skill's name.
 * @returns Tag element
 */
function OffTag(): preact.JSX.Element {
  return (
    <span className="rounded bg-zinc-200 dark:bg-zinc-700 px-1 text-[9px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      off
    </span>
  );
}
