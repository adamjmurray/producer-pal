// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared left-pane list chrome for the collection managers (memory, custom
// skills): the dashed "+ New …" button and one entry row (slug over its
// description). Memory groups its rows by type and custom skills lists them flat
// with an enabled/disabled treatment, but the button and row render identically,
// so they live here.

interface NewEntryButtonProps {
  /** Button text, e.g. "+ New memory". */
  label: string;
  /** Whether the create form is active (highlights the button). */
  active: boolean;
  /** Start a new (empty) entry. */
  onClick: () => void;
}

/**
 * The dashed "+ New …" button above a collection list.
 * @param props - Button props
 * @returns Button element
 */
export function NewEntryButton(props: NewEntryButtonProps): preact.JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`shrink-0 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium transition-colors ${
        props.active
          ? "border-blue-500 text-blue-600 dark:text-blue-400"
          : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600"
      }`}
    >
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
}

/**
 * One entry row: the slug (with optional trailing tag) over its description,
 * highlighted when selected and dimmed when requested.
 * @param props - Row props
 * @returns Row element
 */
export function EntryRow(props: EntryRowProps): preact.JSX.Element {
  const { name, description, selected, onSelect, dimmed, trailing } = props;

  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      className={`flex flex-col items-start rounded-md px-2 py-1 text-left transition-colors ${
        selected
          ? "bg-zinc-200 dark:bg-zinc-700/70"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }${dimmed ? " opacity-50" : ""}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
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
  );
}
