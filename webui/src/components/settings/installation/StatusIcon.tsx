// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type JSX } from "preact";

/**
 * - `warning`: something is left to do.
 * - `waiting`: done on our side; waiting for Live.
 * - `done`: nothing left to do.
 * - `unknown`: not read yet.
 */
export type StatusKind = "warning" | "waiting" | "done" | "unknown";

const colorClass: Record<StatusKind, string> = {
  warning: "text-amber-700 dark:text-amber-400",
  waiting: "text-amber-700 dark:text-amber-400",
  done: "text-green-700 dark:text-green-400",
  unknown: "text-zinc-600 dark:text-zinc-300",
};

const clock = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);

/** The path data for each icon, on a 24px grid. */
const shapes: Record<StatusKind, JSX.Element> = {
  warning: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </>
  ),
  waiting: clock,
  unknown: clock,
  done: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

/**
 * The small icon at the head of a section card. Decorative: the card's text
 * says the same thing.
 * @param {object} props - Component props
 * @param {StatusKind} props.kind - Which state to draw
 * @returns {JSX.Element} The icon
 */
export function StatusIcon({ kind }: { kind: StatusKind }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={kind === "done" ? 2.6 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${colorClass[kind]}`}
      data-testid="status-icon"
      data-kind={kind}
    >
      {shapes[kind]}
    </svg>
  );
}
