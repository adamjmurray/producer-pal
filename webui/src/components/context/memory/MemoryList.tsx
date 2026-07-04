// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type MemoryEntryView } from "#webui/hooks/context/use-memory-collection";
import {
  MEMORY_TYPE_META,
  MEMORY_TYPE_ORDER,
  type MemoryTypeName,
} from "./memory-types";

interface MemoryListProps {
  /** All stored entries (unordered; grouped/sorted here for display). */
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
 * Left pane: a "New memory" button above the derived index — entries grouped by
 * type (in injection order) with a per-group heading, each row showing the slug
 * and its one-line description. Mirrors the always-injected MEMORY.md the
 * assistant sees, so what the user edits here is what the model reads.
 * @param props - List props
 * @returns List element
 */
export function MemoryList(props: MemoryListProps): preact.JSX.Element {
  const { entries, selectedName, creating, onSelect, onNew } = props;

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <button
        type="button"
        onClick={onNew}
        className={`shrink-0 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium transition-colors ${
          creating
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600"
        }`}
      >
        + New memory
      </button>
      {entries.length === 0 ? (
        <p className="px-1 text-xs text-zinc-400 dark:text-zinc-500">
          No memories yet.
        </p>
      ) : (
        MEMORY_TYPE_ORDER.map((type) => (
          <MemoryGroup
            key={type}
            type={type}
            entries={groupFor(entries, type)}
            selectedName={selectedName}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}

// --- Helpers below main export ---

interface MemoryGroupProps {
  type: MemoryTypeName;
  entries: MemoryEntryView[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}

/**
 * One type group: a heading (label + injection hint) and its entry rows. Renders
 * nothing when the group is empty.
 * @param props - Group props
 * @returns Group element (or null when empty)
 */
function MemoryGroup(props: MemoryGroupProps): preact.JSX.Element | null {
  const { type, entries, selectedName, onSelect } = props;

  if (entries.length === 0) return null;

  const meta = MEMORY_TYPE_META[type];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {meta.label}
        </span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          {meta.injection}
        </span>
      </div>
      {entries.map((entry) => (
        <MemoryRow
          key={entry.name}
          entry={entry}
          selected={entry.name === selectedName}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface MemoryRowProps {
  entry: MemoryEntryView;
  selected: boolean;
  onSelect: (name: string) => void;
}

/**
 * One entry row: the slug over its description, highlighted when selected.
 * @param props - Row props
 * @returns Row element
 */
function MemoryRow(props: MemoryRowProps): preact.JSX.Element {
  const { entry, selected, onSelect } = props;

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.name)}
      className={`flex flex-col items-start rounded-md px-2 py-1 text-left transition-colors ${
        selected
          ? "bg-zinc-200 dark:bg-zinc-700/70"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
        {entry.name}
      </span>
      {entry.description !== "" && (
        <span className="w-full truncate text-[11px] text-zinc-500 dark:text-zinc-400">
          {entry.description}
        </span>
      )}
    </button>
  );
}

/**
 * The entries of one type, sorted by name (the group render order).
 * @param entries - All entries
 * @param type - The type to filter to
 * @returns The type's entries, name-sorted
 */
function groupFor(
  entries: MemoryEntryView[],
  type: MemoryTypeName,
): MemoryEntryView[] {
  return entries
    .filter((entry) => entry.type === type)
    .sort((a, b) => a.name.localeCompare(b.name));
}
