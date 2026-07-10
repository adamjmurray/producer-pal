// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CollectionScreen } from "#webui/components/context/collection/CollectionScreen";
import { type UseMemoryCollectionReturn } from "#webui/hooks/context/use-memory-collection";
import { MemoryEntryEditor } from "./MemoryEntryEditor";
import { MemoryList } from "./MemoryList";

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
 * memory collection — a flat, name-sorted left index ({@link MemoryList}) and a
 * right per-entry form ({@link MemoryEntryEditor}).
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
        <MemoryList
          entries={entries}
          selectedName={selectedName}
          creating={creating}
          onSelect={onSelect}
          onNew={onNew}
          onDelete={onDelete}
        />
      )}
      renderEditor={({ entry, onSaved }) => (
        <MemoryEntryEditor
          collection={collection}
          entry={entry}
          onSaved={onSaved}
        />
      )}
    />
  );
}
