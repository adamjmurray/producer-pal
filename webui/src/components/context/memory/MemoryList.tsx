// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EntryRow,
  NewEntryButton,
} from "#webui/components/context/collection/collection-list-parts";
import { type MemoryEntryView } from "#webui/hooks/context/use-memory-collection";

interface MemoryListProps {
  /** All stored entries (sorted by name here for display). */
  entries: MemoryEntryView[];
  /** The name of the entry being edited, or null while creating a new one. */
  selectedName: string | null;
  /** Whether the "new memory" form is active (highlights the New button). */
  creating: boolean;
  /** Select an existing entry to edit. */
  onSelect: (name: string) => void;
  /** Start a new (empty) entry. */
  onNew: () => void;
}

/**
 * Left pane: a "New memory" button above a flat, name-sorted list of the
 * derived index — each row showing the slug and its one-line description.
 * Mirrors the always-injected MEMORY.md the assistant sees, so what the user
 * edits here is what the model reads.
 * @param props - List props
 * @returns List element
 */
export function MemoryList(props: MemoryListProps): preact.JSX.Element {
  const { entries, selectedName, creating, onSelect, onNew } = props;
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <NewEntryButton label="+ New memory" active={creating} onClick={onNew} />
      {entries.length === 0 ? (
        <p className="px-1 text-xs text-zinc-400 dark:text-zinc-500">
          No memories yet.
        </p>
      ) : (
        sorted.map((entry) => (
          <EntryRow
            key={entry.name}
            name={entry.name}
            description={entry.description}
            selected={entry.name === selectedName}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}
