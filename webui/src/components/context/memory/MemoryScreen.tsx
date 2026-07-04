// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { ContextHeader } from "#webui/components/context/ContextScreen";
import { type UseMemoryCollectionReturn } from "#webui/hooks/context/use-memory-collection";
import { MemoryEntryEditor } from "./MemoryEntryEditor";
import { MemoryList } from "./MemoryList";

const CLOSE_ARIA_LABEL = "Close context editor";

/** Which memory the right pane is editing: an existing entry, or a fresh one. */
type Selection = { mode: "edit"; name: string } | { mode: "new" };

interface MemoryScreenProps {
  /** The memory collection hook (mounted in ContextTabs). */
  collection: UseMemoryCollectionReturn;
  /** The Project | Global | Instructions | Skills | Memory tab strip. */
  tabSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
}

/**
 * The Memory tab: a two-pane manager for the LLM-managed memory collection. The
 * left pane lists the derived index (grouped by type, plus a "New memory"
 * button); the right pane edits the selected entry or creates a new one. The
 * editor is keyed by the selection so its draft re-seeds on switch. Loading and
 * error states reuse the shared context header.
 * @param props - Screen props
 * @returns Screen element
 */
export function MemoryScreen(props: MemoryScreenProps): preact.JSX.Element {
  const { collection, tabSlot, onClose } = props;
  const [selected, setSelected] = useState<Selection>({ mode: "new" });

  if (collection.status.kind !== "ready") {
    return (
      <MemoryStatusScreen
        tabSlot={tabSlot}
        onClose={onClose}
        message={
          collection.status.kind === "error"
            ? collection.status.message
            : "Loading memory…"
        }
        tone={collection.status.kind === "error" ? "error" : "muted"}
      />
    );
  }

  const entries = collection.status.entries;
  const activeEntry =
    selected.mode === "edit"
      ? (entries.find((entry) => entry.name === selected.name) ?? null)
      : null;
  const editorKey = activeEntry ? activeEntry.name : "__new__";

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title="Memory"
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        onClose={onClose}
      />
      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 flex flex-col min-h-0 border-r border-zinc-200 dark:border-zinc-700">
          <MemoryList
            entries={entries}
            selectedName={activeEntry?.name ?? null}
            creating={activeEntry == null}
            onSelect={(name) => setSelected({ mode: "edit", name })}
            onNew={() => setSelected({ mode: "new" })}
          />
        </aside>
        <div className="flex-1 min-h-0 flex flex-col">
          <MemoryEntryEditor
            key={editorKey}
            collection={collection}
            entry={activeEntry}
            onSaved={(name) => setSelected({ mode: "edit", name })}
            onDeleted={() => setSelected({ mode: "new" })}
          />
        </div>
      </div>
    </div>
  );
}

// --- Helpers below main export ---

interface MemoryStatusScreenProps {
  tabSlot: preact.JSX.Element;
  onClose?: () => void;
  message: string;
  tone: "muted" | "error";
}

/**
 * Loading/error state for the Memory tab: the shared header and a centered
 * message.
 * @param props - Status screen props
 * @returns Status screen element
 */
function MemoryStatusScreen(
  props: MemoryStatusScreenProps,
): preact.JSX.Element {
  const { tabSlot, onClose, message, tone } = props;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title="Memory"
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        status={
          tone === "error" ? { kind: "error", message } : { kind: "loading" }
        }
        onClose={onClose}
      />
      <div
        className={`flex items-center justify-center flex-1 px-8 text-center ${
          tone === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-500"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
