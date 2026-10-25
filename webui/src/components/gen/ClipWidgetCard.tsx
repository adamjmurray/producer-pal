// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from "preact/hooks";
import { type ClipWidget } from "#src/shared/gen-ui-types";
import { useAbortableLoad } from "#webui/hooks/connection/use-abortable-load";
import { type LiveTick } from "#webui/hooks/connection/use-gen-ui-stream";
import { changeAffectsClip } from "#webui/lib/utils/gen-ui/change-affects-clip";
import { readClip, type ClipRead } from "#webui/lib/utils/gen-ui/read-clip";
import { PianoRoll } from "./PianoRoll";

const BEATS_PER_BAR = 4;

/**
 * Shows one Session clip and re-reads it when the AI changes it. A clip that
 * is gone shows as missing, never as what it used to hold.
 *
 * @param props - Component props
 * @param props.widget - The clip widget
 * @param props.live - The latest "Live changed" tick
 * @returns Card element
 */
export function ClipWidgetCard({
  widget,
  live,
}: {
  widget: ClipWidget;
  live: LiveTick | null;
}): preact.JSX.Element {
  const { read, refreshing } = useClipRead(widget.ref, live);
  const heading =
    widget.title ?? (read?.status === "ready" ? read.clip.name : undefined);

  return (
    <section
      aria-busy={refreshing}
      className={`rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900 ${refreshing ? "opacity-60" : ""}`}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <h3 className="truncate font-medium text-zinc-800 dark:text-zinc-100">
          {heading ?? `Clip ${widget.ref}`}
        </h3>
        <span className="shrink-0 font-mono text-xs text-zinc-500">
          {widget.ref}
        </span>
      </header>
      <ClipBody read={read} />
    </section>
  );
}

/**
 * @param props - Component props
 * @param props.read - The latest read, or null before the first
 * @returns The clip's body
 */
function ClipBody({ read }: { read: ClipRead | null }): preact.JSX.Element {
  if (read == null) {
    return <p className="text-xs text-zinc-500">Loading...</p>;
  }

  if (read.status === "missing") {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
        Clip missing: {read.message}
      </p>
    );
  }

  if (read.status === "error") {
    return (
      <p className="text-xs text-red-700 dark:text-red-400" role="status">
        {read.message}
      </p>
    );
  }

  const { clip } = read;
  const bars = /^(\d+)bar$/.exec(clip.length ?? "")?.[1];

  return (
    <div>
      <p className="mb-1 text-xs text-zinc-500">
        {clip.type} · {clip.length ?? "?"} · {clip.notes.length} notes
        {clip.path != null ? ` · ${clip.path}` : ""}
      </p>
      {clip.type === "midi" ? (
        <PianoRoll
          notes={clip.notes}
          lengthBeats={bars == null ? undefined : Number(bars) * BEATS_PER_BAR}
        />
      ) : (
        <p className="text-xs text-zinc-500">Audio clip</p>
      )}
    </div>
  );
}

/**
 * Read the clip on mount and again when a tick names it. A newer read wins: an
 * older answer arriving late is dropped.
 *
 * @param ref - The widget's clip id or path
 * @param live - The latest tick
 * @returns The latest read (null before the first), and whether a re-read is
 *   under way
 */
function useClipRead(
  ref: string,
  live: LiveTick | null,
): { read: ClipRead | null; refreshing: boolean } {
  const [read, setRead] = useState<ClipRead | null>(null);
  const [reads, setReads] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Ticks from before this card mounted are already reflected in its first read.
  const [handledSeq, setHandledSeq] = useState(live?.seq ?? 0);

  // A new `reads` count makes a fresh loader, and so a fresh read of the clip.
  const load = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      // The first read shows "Loading"; later ones dim the old picture.
      setRefreshing(reads > 0);

      try {
        setRead(await readClip(ref, signal));
        setRefreshing(false);
      } catch {
        // Aborted by a newer read.
      }
    },
    [ref, reads],
  );

  useAbortableLoad(load);

  useEffect(() => {
    if (live == null || live.seq === handledSeq) {
      return;
    }

    setHandledSeq(live.seq);

    const known = read?.status === "ready" ? read.clip : {};

    if (changeAffectsClip(live.change, ref, known)) {
      setReads((n) => n + 1);
    }
  }, [live, handledSeq, read, ref]);

  return { read, refreshing };
}
