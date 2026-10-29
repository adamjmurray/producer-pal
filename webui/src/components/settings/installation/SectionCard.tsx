// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ComponentChildren } from "preact";
import { StatusIcon, type StatusKind } from "./StatusIcon";

interface SectionCardProps {
  /** Unique id for the card, used to label the section by its title. */
  id: string;
  testId: string;
  kind: StatusKind;
  title: string;
  /** Sits at the right of the title. */
  aside?: ComponentChildren;
  /** The card's lines below the title. */
  children?: ComponentChildren;
}

/**
 * A bordered card for one part of the install: a status icon and title, an
 * optional button beside them, and whatever lines the part needs below.
 * @param {SectionCardProps} props - Component props
 * @param {string} props.id - Unique id for the card
 * @param {string} props.testId - The section's test id
 * @param {StatusKind} props.kind - Which status icon to draw
 * @param {string} props.title - The card's title
 * @param {ComponentChildren} [props.aside] - Content beside the title
 * @param {ComponentChildren} [props.children] - The card's lines below the title
 * @returns {JSX.Element} The card
 */
export function SectionCard({
  id,
  testId,
  kind,
  title,
  aside,
  children,
}: SectionCardProps) {
  const titleId = `${id}-title`;

  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      className="flex flex-col gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-[13px] dark:border-zinc-600 dark:bg-zinc-700/40"
    >
      <div className="flex min-h-7 items-center gap-2">
        <StatusIcon kind={kind} />
        <h3 id={titleId} className="min-w-0 flex-1 text-sm font-semibold">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
