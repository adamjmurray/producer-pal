// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The left pane of the collection managers (memory, custom skills): a fixed
// "New …" toolbar above a flat, name-sorted, scrolling list, mirroring the
// conversation-history panel. What differs per collection is a label, an
// optional per-row trash, and an optional row decoration (custom skills dim and
// tag their disabled entries), so one list serves both.

import { TrashIcon } from "#webui/components/chat/controls/header/HeaderIcons";
import { confirmEntryDelete } from "#webui/components/context/collection/collection-delete-confirm";

/** The fields the list reads off an entry; each collection carries more. */
interface ListEntry {
  name: string;
  description: string;
}

/** Per-row extras a collection can add (custom skills' dimmed "off" rows). */
interface RowDecoration {
  dimmed?: boolean;
  trailing?: preact.ComponentChildren;
}

interface CollectionListProps<TEntry extends ListEntry> {
  /** All stored entries (sorted by name here for display). */
  entries: TEntry[];
  /** The "New …" button's label, e.g. "New memory". */
  newLabel: string;
  /** What to show instead of rows when nothing is stored. */
  emptyLabel: string;
  /** The name of the entry being edited, or null while creating a new one. */
  selectedName: string | null;
  /** Whether the create form is active (highlights the New button). */
  creating: boolean;
  /** Select an existing entry to edit. */
  onSelect: (name: string) => void;
  /** Start a new (empty) entry. */
  onNew: () => void;
  /**
   * A per-row trash, with the noun for its confirm. Omitted by collections whose
   * delete lives in the editor instead (custom skills).
   */
  rowDelete?: { noun: string; onDelete: (name: string) => void };
  /** Decorate a row (dim it, tag it). */
  decorateRow?: (entry: TEntry) => RowDecoration;
}

/**
 * The left pane: the "New …" button over the name-sorted entry rows, each
 * showing the slug above its one-line description. Mirrors the always-injected
 * index the assistant sees, so what the user edits here is what the model reads.
 * @param props - List props
 * @returns List element
 */
export function CollectionList<TEntry extends ListEntry>(
  props: CollectionListProps<TEntry>,
): preact.JSX.Element {
  const { entries, selectedName, onSelect, rowDelete, decorateRow } = props;
  const sorted = entries.toSorted((a, b) => a.name.localeCompare(b.name));

  const confirmDelete =
    rowDelete == null
      ? undefined
      : (name: string): void => {
          if (confirmEntryDelete(rowDelete.noun, name)) {
            rowDelete.onDelete(name);
          }
        };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-300 px-2 py-2 dark:border-zinc-700">
        <NewEntryButton
          label={props.newLabel}
          active={props.creating}
          onClick={props.onNew}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
            {props.emptyLabel}
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
              {...decorateRow?.(entry)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- Helpers below main export ---

interface NewEntryButtonProps {
  /** Button text, e.g. "New memory". */
  label: string;
  /** Whether the create form is active (deepens the button). */
  active: boolean;
  /** Start a new (empty) entry. */
  onClick: () => void;
}

/**
 * The filled "New …" button above a collection list, styled like the
 * conversation panel's New Conversation button (a leading plus icon + label).
 * @param props - Button props
 * @returns Button element
 */
function NewEntryButton(props: NewEntryButtonProps): preact.JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white transition-colors ${
        props.active ? "bg-blue-600" : "bg-blue-500 hover:bg-blue-600"
      }`}
    >
      <PlusIcon />
      {props.label}
    </button>
  );
}

interface EntryRowProps {
  /** The entry slug (shown monospace). */
  name: string;
  /** One-line description (hidden when empty). */
  description: string;
  /** Whether this row is the selected entry. */
  selected: boolean;
  /** Select this entry to edit. */
  onSelect: (name: string) => void;
  /** Dim the row (e.g. a disabled custom skill). */
  dimmed?: boolean;
  /** Optional element beside the name (e.g. an "off" tag). */
  trailing?: preact.ComponentChildren;
  /** Delete this entry — renders a trash button when provided. */
  onDelete?: (name: string) => void;
}

/**
 * One entry row: the slug (with optional trailing tag) over its description.
 * Flush with a bottom divider and a full-cell hover, a blue accent when
 * selected, and dimmed when requested — mirroring a conversation-history row.
 * An always-visible trash button is rendered when `onDelete` is supplied.
 * @param props - Row props
 * @returns Row element
 */
function EntryRow(props: EntryRowProps): preact.JSX.Element {
  const { name, description, selected, onSelect, dimmed, trailing, onDelete } =
    props;

  return (
    <div
      className={`flex items-stretch border-b border-l-2 border-b-zinc-100 transition-colors dark:border-b-zinc-800 ${
        selected
          ? "border-l-blue-500 bg-blue-50 dark:bg-blue-900/30"
          : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
      }${dimmed ? " opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSelect(name)}
        aria-label={`Edit ${name}`}
        className="flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left"
      >
        <span className="flex max-w-full items-center gap-1.5">
          <span
            className={`truncate font-mono text-xs ${
              selected
                ? "text-blue-700 dark:text-blue-300"
                : "text-zinc-800 dark:text-zinc-200"
            }`}
          >
            {name}
          </span>
          {trailing}
        </span>
        {description !== "" && (
          <span className="w-full truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            {description}
          </span>
        )}
      </button>
      {onDelete != null && (
        <button
          type="button"
          onClick={() => onDelete(name)}
          aria-label={`Delete ${name}`}
          title="Delete"
          className="shrink-0 self-center px-2 text-zinc-400 transition-colors hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"
        >
          <TrashIcon size={13} />
        </button>
      )}
    </div>
  );
}

/**
 * A small plus glyph for the New-entry button (no shared PlusIcon exists).
 * @returns SVG element
 */
function PlusIcon(): preact.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M7 2.5v9M2.5 7h9" />
    </svg>
  );
}
