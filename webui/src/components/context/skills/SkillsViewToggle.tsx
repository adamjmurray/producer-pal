// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { ICON_BUTTON_CLASS } from "#webui/components/context/editor/context-buttons";

/** The two Skills-tab views: edit the fragment overrides, or preview the blob. */
export type SkillsView = "fragments" | "preview";

interface SkillsViewToggleProps {
  view: SkillsView;
  onSelect: (view: SkillsView) => void;
}

/**
 * Icon button toggling the Skills tab between the fragment editor and the
 * assembled-blob preview. It sits at the end of the controls strip in both
 * views (beside Import/Export while editing), so switching never moves it.
 *
 * It belongs up there rather than over the editor pane because the preview is a
 * WHOLE-document view: it assembles every fragment the driver includes, not the
 * one being edited. The old pane-header placement dates from when a fragment
 * could `@include` others and previewing one slot meant something.
 * @param props - Toggle props
 * @returns Toggle button element
 */
export function SkillsViewToggle(
  props: SkillsViewToggleProps,
): preact.JSX.Element {
  const { view, onSelect } = props;
  const previewing = view === "preview";

  return (
    <button
      type="button"
      onClick={() => onSelect(previewing ? "fragments" : "preview")}
      aria-label={
        previewing ? "Edit skill fragments" : "Preview assembled skills"
      }
      title={
        previewing ? "Back to the skill editor" : "Preview the assembled skills"
      }
      className={ICON_BUTTON_CLASS}
    >
      {previewing ? <SourceIcon /> : <PreviewIcon />}
    </button>
  );
}

// --- Helpers below main export ---

/**
 * Eye icon for switching to the assembled-blob preview.
 * @returns SVG element
 */
function PreviewIcon(): preact.JSX.Element {
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
      <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" />
      <circle cx="8" cy="8" r="1.75" />
    </svg>
  );
}

/**
 * Angle-brackets icon for switching back to the fragment source editor.
 * @returns SVG element
 */
function SourceIcon(): preact.JSX.Element {
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
      <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
    </svg>
  );
}
