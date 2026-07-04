// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CollectionScreen } from "#webui/components/context/collection/CollectionScreen";
import { type UseCustomSkillsCollectionReturn } from "#webui/hooks/context/use-custom-skills-collection";
import { CustomSkillEditor } from "./CustomSkillEditor";
import { CustomSkillsList } from "./CustomSkillsList";

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
 * CustomSkillsList}) and a right per-skill form ({@link CustomSkillEditor}).
 * These are additive user skills the assistant loads on demand, distinct from
 * the fixed-slot built-in overrides on the Skills tab.
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
        <CustomSkillsList
          entries={entries}
          selectedName={selectedName}
          creating={creating}
          onSelect={onSelect}
          onNew={onNew}
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
