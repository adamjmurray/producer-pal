// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleTabFocusMode,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { type Extension, Prec, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * Heading style block shared by the six markdown heading levels.
 * @param size - CSS font size (e.g. "1.4em")
 * @param weight - CSS font weight (defaults to "600")
 * @returns A CodeMirror highlight-style declaration
 */
const headingStyle = (
  size: string,
  weight = "600",
): { fontSize: string; fontWeight: string; lineHeight: string } => ({
  fontSize: size,
  fontWeight: weight,
  lineHeight: "1.25",
});

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, ...headingStyle("1.6em", "700") },
  { tag: t.heading2, ...headingStyle("1.4em", "700") },
  { tag: t.heading3, ...headingStyle("1.2em") },
  { tag: t.heading4, ...headingStyle("1.1em") },
  { tag: t.heading5, ...headingStyle("1em") },
  { tag: t.heading6, ...headingStyle("0.95em") },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  // Inline `code` and ``` fenced ``` bodies: monospace on a translucent chip
  // so they read unmistakably as code. The chip is a theme-neutral grey (works
  // on both the light and dark editor backgrounds); text color stays inherited
  // so it never loses contrast. No vertical padding — the chip box tracks the
  // line height, so a multi-line fenced block reads as one continuous block
  // rather than a stack of gapped pills.
  {
    tag: t.monospace,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    backgroundColor: "rgba(135, 131, 120, 0.18)",
    borderRadius: "3px",
    padding: "0 0.28em",
  },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.url, textDecoration: "underline" },
  { tag: t.list, fontWeight: "500" },
  { tag: t.quote, fontStyle: "italic" },
  // Tone down markdown punctuation (#, *, _, `, etc).
  { tag: t.processingInstruction, opacity: "0.5" },
  { tag: t.meta, opacity: "0.5" },
]);

// Single theme. Text color and caret inherit from the Tailwind-styled
// wrapper, so `dark:text-...` on the host element controls visibility in
// both light and dark modes. The selection background is set per mode via
// `::selection`, keyed on the `html.dark` class useTheme() sets on the root.
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.95rem",
    backgroundColor: "transparent",
    color: "inherit",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    lineHeight: "1.55",
    padding: "1rem",
  },
  ".cm-content": {
    color: "inherit",
    caretColor: "currentColor",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-line": {
    padding: "0 0.25rem",
  },
  // The `•` glyph that replaces a `-`/`*`/`+` list marker (see
  // bulletMarkerPlugin). Full-opacity and nudged for optical alignment so it
  // reads as a real bullet, not the faded punctuation the raw marker would be.
  ".cm-bullet-marker": {
    color: "inherit",
    paddingRight: "0.15em",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "currentColor",
  },
  ".cm-placeholder": {
    color: "rgb(113 113 122)", // zinc-500
  },
  "html.dark & .cm-placeholder": {
    color: "rgb(161 161 170)", // zinc-400
  },
  // Native browser selection (there is no drawSelection extension, so
  // `.cm-selectionBackground` never renders — only `::selection` applies). Both
  // rules scope `::selection` to the editor via `&`, which CodeMirror's theme
  // system replaces with the generated editor class. The dark override MUST
  // keep the `&`: a bare `html.dark ::selection` is rewritten to the impossible
  // `.cm-editor html.dark ::selection` (html as a descendant of the editor) and
  // never matches — which left selected text invisible in dark mode (light text
  // over the light-mode selection). `html.dark & ::selection` becomes
  // `html.dark .cm-editor ::selection`, which wins under the `html.dark` class.
  "& ::selection": {
    backgroundColor: "rgb(228 228 231)", // zinc-200
  },
  "html.dark & ::selection": {
    backgroundColor: "rgb(63 63 70)", // zinc-700
  },
});

// --- Bullet-marker prettifier ---

/**
 * Widget standing in for a bulleted list's raw marker, rendering a real `•`
 * where the source has `-`/`*`/`+`. The character stays in the document; only
 * its rendering changes (like the dimmed `#` kept beside a styled heading).
 */
class BulletMarkerWidget extends WidgetType {
  /**
   * Build the bullet element.
   * @returns A span rendering the `•` glyph.
   */
  toDOM(): HTMLElement {
    const span = document.createElement("span");

    span.className = "cm-bullet-marker";
    span.textContent = "•";

    return span;
  }
}

const bulletMarkerDecoration = Decoration.replace({
  widget: new BulletMarkerWidget(),
});

/**
 * Build replace-decorations swapping each bulleted-list marker (`-`, `*`, `+`)
 * for a `•`. Ordered-list markers (`1.`, `2)`) are left as-is.
 * @param view - The editor view to scan (visible ranges only)
 * @returns The decoration set to render
 */
function buildBulletMarkers(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "ListMark") return;
        const marker = view.state.doc.sliceString(node.from, node.to);

        if (marker === "-" || marker === "*" || marker === "+") {
          builder.add(node.from, node.to, bulletMarkerDecoration);
        }
      },
    });
  }

  return builder.finish();
}

/**
 * View plugin keeping the bullet-marker decorations in sync with the document.
 * Rebuilds unconditionally on every update — cheap for note-sized docs and it
 * keeps the plugin branch-free.
 */
const bulletMarkerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    /** @param view - The editor view being initialized */
    constructor(view: EditorView) {
      this.decorations = buildBulletMarkers(view);
    }

    /** @param update - The view update to react to */
    update(update: ViewUpdate): void {
      this.decorations = buildBulletMarkers(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * The base extension set every MarkdownEditor instance shares: keymap,
 * markdown language, line wrapping, bullet rendering, and theme. Per-instance
 * extensions (read-only, placeholder, submit keymap) layer on top of this.
 */
export const markdownEditorExtensions: Extension[] = [
  history(),
  // Tab / Shift+Tab indent and outdent. Keyboard users tab out via Tab-focus
  // mode: Ctrl-m, or Escape then Tab. Ctrl-m is bound here on every platform
  // because defaultKeymap's macOS binding (Alt-Shift-m) never matches —
  // macOS reports the composed character, not "m".
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    indentWithTab,
    { key: "Ctrl-m", run: toggleTabFocusMode },
  ]),
  markdown(),
  EditorView.lineWrapping,
  bulletMarkerPlugin,
  editorTheme,
  syntaxHighlighting(markdownHighlightStyle),
];

/**
 * Chat-input additions on top of {@link markdownEditorExtensions}: tighter
 * padding (matching the old textarea's `px-3 py-2`), a two-line minimum, an
 * internal scroll past ~40vh, and the browser's spellcheck / autocorrect back
 * on for prose (CodeMirror turns them off by default). The theme is
 * `Prec.high` so its rules mount after the base theme's and win at equal
 * specificity.
 */
export const chatInputExtensions: Extension = [
  Prec.high(
    EditorView.theme({
      ".cm-scroller": {
        padding: "0.25rem 0.5rem",
        maxHeight: "40vh",
      },
      ".cm-content": {
        minHeight: "3.1em", // two lines at line-height 1.55
      },
    }),
  ),
  EditorView.contentAttributes.of({
    spellcheck: "true",
    autocorrect: "on",
    autocapitalize: "sentences",
  }),
];
