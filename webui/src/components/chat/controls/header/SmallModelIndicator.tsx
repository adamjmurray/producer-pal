// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface SmallModelIndicatorProps {
  active: boolean;
  diverges?: boolean;
}

const neutralColor = "text-zinc-500 dark:text-zinc-400";
const amberColor = "text-amber-600 dark:text-amber-400";

/**
 * Responsive model size indicator.
 * Shows small model (turtle) or large model (elephant) with full text at sm+.
 * Amber (and titled with what the setting has moved to) when the conversation's
 * locked value differs from the current default, neutral otherwise.
 * @param props - Component props
 * @param props.active - Whether small model mode is active for this conversation
 * @param props.diverges - Whether the value differs from the current default setting
 * @returns Indicator element
 */
export function SmallModelIndicator({
  active,
  diverges,
}: SmallModelIndicatorProps) {
  const emojiClass = active ? "" : "text-base";
  const emoji = <span className={emojiClass}>{active ? "🐢" : "🐘"}</span>;
  const label = active ? "small model" : "large model";
  const color = diverges ? amberColor : neutralColor;
  // Only while locked: otherwise the wrapping button's own title ("Connection
  // settings") shows, which is what the model display does too.
  const title = diverges
    ? `Locked: ${label} mode (default is now ${active ? "large model" : "small model"} mode)`
    : undefined;

  return (
    <span className={`text-xs leading-none ${color}`} title={title}>
      <span aria-label={label}>
        {emoji}
        <span className="hidden md:inline"> {label}</span>
      </span>
    </span>
  );
}
