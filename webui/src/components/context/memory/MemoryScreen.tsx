// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CollectionList } from "#webui/components/context/collection/CollectionList";
import { CollectionScreen } from "#webui/components/context/collection/CollectionScreen";
import { type UseMemoryCollectionReturn } from "#webui/hooks/context/use-memory-collection";
import { MemoryEntryEditor } from "./MemoryEntryEditor";

interface MemoryScreenProps {
  /** The memory collection hook (mounted in ContextTabs). */
  collection: UseMemoryCollectionReturn;
  /** The Project | Global | Instructions | Skills | … tab strip. */
  tabSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * The Memory tab: the shared two-pane {@link CollectionScreen} bound to the
 * memory collection — a flat, name-sorted left index ({@link CollectionList},
 * with a trash on each row) and a right per-entry form ({@link
 * MemoryEntryEditor}).
 * @param props - Screen props
 * @returns Screen element
 */
export function MemoryScreen(props: MemoryScreenProps): preact.JSX.Element {
  const { collection, tabSlot, onClose } = props;

  return (
    <CollectionScreen
      title="Memory"
      loadingLabel="Loading memory…"
      deletedBanner="This memory was deleted outside the editor. Save to re-create it."
      description="Facts Producer Pal remembers about you across every project. The AI saves and recalls these as you work. You can add or edit entries too."
      collection={collection}
      tabSlot={tabSlot}
      onClose={onClose}
      renderList={({
        entries,
        selectedName,
        creating,
        onSelect,
        onNew,
        onDelete,
      }) => (
        <CollectionList
          entries={entries}
          newLabel="New memory"
          emptyLabel="No memories yet."
          selectedName={selectedName}
          creating={creating}
          onSelect={onSelect}
          onNew={onNew}
          rowDelete={{ noun: "memory", onDelete }}
        />
      )}
      renderEditor={({ entry, onSaved, onRenamed }) => (
        <MemoryEntryEditor
          collection={collection}
          entry={entry}
          onSaved={onSaved}
          onRenamed={onRenamed}
        />
      )}
    />
  );
}
