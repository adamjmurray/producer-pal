// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared left-pane list chrome for the collection managers (memory, custom
// skills): the solid "New …" button and one entry row (slug over its
// description). Both mirror the conversation-history panel — a filled action
// button above flush, divider-separated rows with a full-cell hover and a blue
// selected accent, and an always-visible per-row trash. Custom skills
// additionally dims disabled rows via `dimmed`/`trailing`, and memory adds the
// trash via `onDelete`, but the button and row otherwise render identically, so
// they live here.

import { TrashIcon } from "#webui/components/chat/controls/header/HeaderIcons";

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
export function NewEntryButton(props: NewEntryButtonProps): preact.JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors ${
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
export function EntryRow(props: EntryRowProps): preact.JSX.Element {
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
