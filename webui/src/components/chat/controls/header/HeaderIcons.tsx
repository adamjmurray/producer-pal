// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pen-on-paper icon for new conversation
 * @returns SVG element
 */
export function NewConversationIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2.5l2.5 2.5-8.75 8.75H6.25v-2.5L15 2.5z" />
      <path d="M3.75 17.5h12.5" />
    </svg>
  );
}

/**
 * Star icon for bookmarking conversations
 * @param props - Component props
 * @param props.bookmarked - Whether the conversation is bookmarked
 * @returns SVG element
 */
export function BookmarkIcon({ bookmarked }: { bookmarked: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill={bookmarked ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.5l2.35 4.75 5.25.75-3.8 3.7.9 5.25L10 14.5l-4.7 2.45.9-5.25-3.8-3.7 5.25-.75z" />
    </svg>
  );
}

/**
 * Panel toggle icon showing sidebar with list lines
 * @param props - Component props
 * @param props.isOpen - Whether the panel is open
 * @returns SVG element
 */
export function PanelToggleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="16" height="16" rx="2.5" />
      <line x1="8" y1="2" x2="8" y2="18" />

      {isOpen ? (
        <>
          <rect
            x="2.75"
            y="2.75"
            width="5.25"
            height="14.5"
            rx="1.5"
            fill="currentColor"
            stroke="none"
          />

          <line
            x1="4"
            y1="7"
            x2="7"
            y2="7"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line
            x1="4"
            y1="10"
            x2="7"
            y2="10"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line
            x1="4"
            y1="13"
            x2="7"
            y2="13"
            stroke="currentColor"
            strokeWidth="1"
          />
        </>
      ) : (
        <>
          <line x1="4.5" y1="7" x2="6.5" y2="7" strokeWidth="1" />
          <line x1="4.5" y1="10" x2="6.5" y2="10" strokeWidth="1" />
          <line x1="4.5" y1="13" x2="6.5" y2="13" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}
