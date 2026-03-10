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

/**
 * Down-arrow-into-tray icon for exporting conversations
 * @returns SVG element
 */
export function ExportIcon() {
  return <TransferIcon arrowPath="M8 2v8M5 7l3 3 3-3" />;
}

/**
 * Up-arrow-from-tray icon for importing conversations
 * @returns SVG element
 */
export function ImportIcon() {
  return <TransferIcon arrowPath="M8 10V2M5 5l3-3 3 3" />;
}

/**
 * Gear/cog icon for settings
 * @returns SVG element
 */
export function SettingsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.14 12.94a7.9 7.9 0 0 0 .05-.94 7.9 7.9 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.28 7.28 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.9 7.9 0 0 0-.05.94 7.9 7.9 0 0 0 .05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.13-.56 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64z" />

      <circle cx="12" cy="12" r="3.25" />
    </svg>
  );
}

/**
 * Small SVG chevron for disclosure/collapsible toggles.
 * For `<details>` elements, pair with `.disclosure` CSS class for open rotation.
 * For button-driven toggles, apply `rotate-90` conditionally.
 * @returns SVG chevron element
 */
export function DisclosureChevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="chevron shrink-0 transition-transform text-stone-500 dark:text-stone-400"
    >
      <path d="M3.5 2L7 5L3.5 8" />
    </svg>
  );
}

// --- Helpers below main exports ---

/**
 * Shared 16x16 SVG wrapper for import/export transfer icons.
 * @param props - Component props
 * @param props.arrowPath - SVG path data for the arrow direction
 * @returns SVG element with arrow and tray
 */
function TransferIcon({ arrowPath }: { arrowPath: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={arrowPath} />
      <path d="M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2" />
    </svg>
  );
}
