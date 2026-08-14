// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  type Extension,
} from "@codemirror/state";
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
import { useEffect, useRef } from "preact/hooks";

interface MarkdownEditorProps {
  /**
   * Content used to seed the editor at mount. After mount the editor owns
   * its own state — changes to this prop are intentionally ignored. To force
   * a reset (e.g. a "Clear" action), remount the component via a `key` prop.
   */
  initialValue: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  /**
   * Accessible name for the editable region, applied to the content DOM via
   * CodeMirror's contentAttributes. Read once at mount like the seed props.
   * Set it wherever a plain `<textarea>` would have carried a label (the
   * memory / custom-skill body, the skills preview) so the editor isn't a
   * nameless textbox to screen readers.
   */
  ariaLabel?: string;
}

/**
 * Uncontrolled CodeMirror 6 markdown editor. The editor instance owns its
 * document; the parent reads changes via `onChange` but does NOT feed them
 * back as props. This deliberately rules out the controlled round-trip that
 * could otherwise loop (editor change → setState → new value prop → dispatch
 * → updateListener → setState → …) if any normalization ever diverged.
 * Wrapped in a card-style frame so the editable region reads as an input,
 * not page background.
 * @param props - Editor props
 * @returns Editor element
 */
export function MarkdownEditor(props: MarkdownEditorProps): preact.JSX.Element {
  const { initialValue, readOnly, onChange, onFocus, onBlur, className } =
    props;
  const { ariaLabel } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);

  // Keep callback refs current. Updating in an effect (vs. during render)
  // satisfies react-hooks/refs and keeps the editor instance stable.
  useEffect(() => {
    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;
    onBlurRef.current = onBlur;
  }, [onChange, onFocus, onBlur]);

  useEffect(() => {
    // Ref is set by the rendered <div ref={containerRef} />; always defined
    // when this effect runs.
    const container = containerRef.current as HTMLDivElement;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }

      if (update.focusChanged) {
        notifyFocusChange(
          update.view.hasFocus,
          onFocusRef.current,
          onBlurRef.current,
        );
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          ...(ariaLabel != null
            ? [EditorView.contentAttributes.of({ "aria-label": ariaLabel })]
            : []),
          bulletMarkerPlugin,
          markdownEditorTheme,
          updateListener,
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        ],
      }),
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally seed-only: the editor is uncontrolled. To reset, the parent remounts via `key`.
  }, []);

  // Toggle read-only via compartment so we don't recreate the editor.
  useEffect(() => {
    const view = viewRef.current as EditorView;

    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  // Frame the editable region so it visually reads as an input, not page bg.
  // Inner host is the CodeMirror parent; outer is the frame + focus ring.
  const frameClass =
    "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500/60 overflow-hidden flex flex-col";
  const wrapperClass = className ? `${frameClass} ${className}` : frameClass;

  return (
    <div className={wrapperClass}>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto text-zinc-900 dark:text-zinc-200"
      />
    </div>
  );
}

// --- Helpers below main export ---

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

/** CodeMirror extensions providing markdown styling for both themes. */
const markdownEditorTheme: Extension[] = [
  editorTheme,
  syntaxHighlighting(markdownHighlightStyle),
];

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
 * Dispatch a focus or blur callback based on whether the editor has focus.
 * Extracted so it can be unit-tested directly — happy-dom doesn't reliably
 * drive CodeMirror's focus tracking.
 * @param hasFocus - Editor focus state after the update
 * @param onFocus - Focus callback (optional)
 * @param onBlur - Blur callback (optional)
 */
export function notifyFocusChange(
  hasFocus: boolean,
  onFocus: (() => void) | undefined,
  onBlur: (() => void) | undefined,
): void {
  if (hasFocus) {
    onFocus?.();
  } else {
    onBlur?.();
  }
}
