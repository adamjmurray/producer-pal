// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CollectionList } from "#webui/components/context/collection/CollectionList";
import { CollectionScreen } from "#webui/components/context/collection/CollectionScreen";
import {
  type CustomSkillView,
  type UseCustomSkillsCollectionReturn,
} from "#webui/hooks/context/use-custom-skills-collection";
import { CustomSkillEditor } from "./CustomSkillEditor";

interface CustomSkillsScreenProps {
  /** The custom-skills collection hook (mounted in ContextTabs). */
  collection: UseCustomSkillsCollectionReturn;
  /** The Project | Global | Instructions | Skills | … tab strip. */
  tabSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * The Custom Skills tab: the shared two-pane {@link CollectionScreen} bound to
 * the user-authored skills collection — a flat left list ({@link
 * CollectionList}, dimming and tagging the disabled skills) and a right
 * per-skill form ({@link CustomSkillEditor}, which owns the delete). These are
 * additive user skills the assistant loads on demand, distinct from the
 * fixed-slot built-in overrides on the Skills tab.
 * @param props - Screen props
 * @returns Screen element
 */
export function CustomSkillsScreen(
  props: CustomSkillsScreenProps,
): preact.JSX.Element {
  const { collection, tabSlot, onClose } = props;

  return (
    <CollectionScreen
      title="Custom Skills"
      loadingLabel="Loading custom skills…"
      deletedBanner="This skill was deleted outside the editor. Save to re-create it."
      collection={collection}
      tabSlot={tabSlot}
      onClose={onClose}
      renderList={({ entries, selectedName, creating, onSelect, onNew }) => (
        <CollectionList
          entries={entries}
          newLabel="New skill"
          emptyLabel="No custom skills yet."
          selectedName={selectedName}
          creating={creating}
          onSelect={onSelect}
          onNew={onNew}
          decorateRow={decorateSkillRow}
        />
      )}
      renderEditor={({ entry, onSaved, onDeleted }) => (
        <CustomSkillEditor
          collection={collection}
          entry={entry}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    />
  );
}

// --- Helpers below main export ---

/**
 * Dim a disabled skill's row and tag it "off", so it's clear it isn't offered to
 * the assistant.
 * @param entry - The skill the row shows
 * @returns The row's decoration
 */
function decorateSkillRow(entry: CustomSkillView): {
  dimmed: boolean;
  trailing?: preact.JSX.Element;
} {
  return {
    dimmed: !entry.enabled,
    trailing: entry.enabled ? undefined : <OffTag />,
  };
}

/**
 * The small "off" tag shown beside a disabled skill's name.
 * @returns Tag element
 */
function OffTag(): preact.JSX.Element {
  return (
    <span className="rounded bg-zinc-200 px-1 text-[9px] tracking-wide text-zinc-500 uppercase dark:bg-zinc-700 dark:text-zinc-400">
      off
    </span>
  );
}
