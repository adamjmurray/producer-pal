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
  /** Delete an entry (a confirm is shown here before it fires). */
  onDelete: (name: string) => void;
}

/**
 * Left pane: a fixed "New memory" toolbar above a flat, name-sorted, scrolling
 * list of the derived index — each row showing the slug over its one-line
 * description, with a hover trash. Mirrors both the conversation-history panel's
 * look and the always-injected MEMORY.md the assistant sees, so what the user
 * edits here is what the model reads.
 * @param props - List props
 * @returns List element
 */
export function MemoryList(props: MemoryListProps): preact.JSX.Element {
  const { entries, selectedName, creating, onSelect, onNew, onDelete } = props;
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  const confirmDelete = (name: string): void => {
    if (window.confirm(`Delete memory "${name}"? This cannot be undone.`)) {
      onDelete(name);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-300 px-2 py-2 dark:border-zinc-700">
        <NewEntryButton label="New memory" active={creating} onClick={onNew} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
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
              onDelete={confirmDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
