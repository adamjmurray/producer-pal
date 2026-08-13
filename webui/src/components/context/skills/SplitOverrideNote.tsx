// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type SkillSlotView,
  type SplitStale,
} from "#webui/hooks/context/use-skill-overrides";

const BANNER_CLASS =
  "shrink-0 rounded-md border border-amber-400 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300 space-y-1";

const LINK_CLASS =
  "underline underline-offset-2 hover:no-underline font-medium cursor-pointer";

interface SplitOverrideNoteProps {
  /** Every slot, so a driver can point at a stale one elsewhere. */
  slots: SkillSlotView[];
  /** The slot currently being edited. */
  slot: SkillSlotView;
  /** Switch to another slot. */
  onSelectSlot: (name: string) => void;
}

/**
 * Banner for overrides that predate a `-write` split and still carry the
 * sibling's text, so the model reads it twice.
 *
 * On two slots only. The affected one gets the fix. The DRIVERS get a pointer to
 * it, because they are the whole document and the editor opens on one — a note
 * that waited to be selected would be invisible to the user who has the problem.
 * Everywhere else the dropdown's "⚠" carries it, rather than repeating a banner
 * on every fragment until it is fixed.
 * @param props - Note props
 * @returns The banner, or null when this slot has nothing to report
 */
export function SplitOverrideNote(
  props: SplitOverrideNoteProps,
): preact.JSX.Element | null {
  const { slots, slot, onSelectSlot } = props;

  if (slot.splitStale) {
    return (
      <Banner>
        <SelectedSlotNote split={slot.splitStale} />
      </Banner>
    );
  }

  // canDisable is false for the drivers alone (see SkillSlotDef.alwaysOn).
  if (slot.canDisable) return null;

  const stale = slots.filter((other) => other.splitStale != null);

  if (stale.length === 0) return null;

  return (
    <Banner>
      {stale.map((other) => (
        <OtherSlotNote
          key={other.name}
          name={other.name}
          onSelect={() => onSelectSlot(other.name)}
        />
      ))}
    </Banner>
  );
}

// --- Helpers below main export ---

/**
 * The amber frame both notes share.
 * @param props - Banner props
 * @param props.children - The note lines
 * @returns Banner element
 */
function Banner(props: {
  children: preact.ComponentChildren;
}): preact.JSX.Element {
  return (
    <div role="alert" className={BANNER_CLASS}>
      {props.children}
    </div>
  );
}

/**
 * The full note for the slot on screen: what overlaps, and the two ways out.
 * @param props - Note props
 * @param props.split - The overlap with the `-write` sibling
 * @returns Note element
 */
function SelectedSlotNote(props: { split: SplitStale }): preact.JSX.Element {
  const { sibling, sharedLines } = props.split;

  return (
    <p>
      <span className="font-medium">
        ⚠ This override predates the writing-notes split.
      </span>{" "}
      {sharedLines} of its lines are still Producer Pal's, and that text now
      ships separately as <Filename name={sibling} /> — so the AI reads it
      twice. Delete those lines here, or switch <Filename name={sibling} /> off.
    </p>
  );
}

/**
 * One line naming a stale fragment elsewhere in the list, with a jump to it.
 * @param props - Note props
 * @param props.name - The stale slot's name
 * @param props.onSelect - Select that slot
 * @returns Note element
 */
function OtherSlotNote(props: {
  name: string;
  onSelect: () => void;
}): preact.JSX.Element {
  return (
    <p>
      ⚠ <Filename name={props.name} /> predates the writing-notes split, so its
      writing section ships twice.{" "}
      <button type="button" onClick={props.onSelect} className={LINK_CLASS}>
        Open it
      </button>
    </p>
  );
}

/**
 * A fragment name written the way the editor's dropdown and the override file
 * both spell it.
 * @param props - Filename props
 * @param props.name - The slot name
 * @returns Filename element
 */
function Filename(props: { name: string }): preact.JSX.Element {
  return <span className="font-mono">{props.name}.md</span>;
}
