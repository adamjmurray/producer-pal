// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ComponentChildren } from "preact";

interface BranchNavProps {
  /** 1-based position of the active branch within its sibling set. */
  current: number;
  /** Total number of sibling branches at this divergence point. */
  total: number;
  /** Switch to the previous sibling; omitted (disabled) on the first branch. */
  onPrev?: () => void;
  /** Switch to the next sibling; omitted (disabled) on the last branch. */
  onNext?: () => void;
}

/**
 * Claude-style ‹ n/m › control for paging between sibling conversation branches
 * created by editing or retrying a turn. Sits under the message the branches
 * diverged at; the arrows switch to the previous/next sibling conversation. An
 * arrow is disabled when its handler is omitted (i.e. at the ends of the set).
 * @param {BranchNavProps} root0 - Component props
 * @param {number} root0.current - 1-based position within the sibling set
 * @param {number} root0.total - Number of sibling branches
 * @param {() => void} [root0.onPrev] - Switch to the previous sibling
 * @param {() => void} [root0.onNext] - Switch to the next sibling
 * @returns {JSX.Element} The branch navigation control
 */
export function BranchNav({ current, total, onPrev, onNext }: BranchNavProps) {
  return (
    <div
      className="flex items-center gap-0.5 text-xs text-zinc-500 dark:text-zinc-400"
      data-testid="branch-nav"
    >
      <BranchArrow label="Previous version" onClick={onPrev}>
        ‹
      </BranchArrow>
      <span className="tabular-nums" data-testid="branch-nav-position">
        {current} / {total}
      </span>
      <BranchArrow label="Next version" onClick={onNext}>
        ›
      </BranchArrow>
    </div>
  );
}

/**
 * A single previous/next arrow button. Disabled when no handler is provided.
 * @param props - Component props
 * @param props.label - Accessible label / tooltip
 * @param props.onClick - Click handler, or undefined to disable the arrow
 * @param props.children - The arrow glyph
 * @returns {JSX.Element} The arrow button
 */
function BranchArrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      onClick={onClick}
      disabled={onClick == null}
      title={label}
      aria-label={label}
      className="size-5 flex items-center justify-center rounded text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default"
    >
      {children}
    </button>
  );
}
