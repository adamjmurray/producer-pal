// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef } from "preact/hooks";

/**
 * A `vi.mock` factory for the CodeMirror MarkdownEditor, which can't be driven
 * in happy-dom and is seed-only. Stubs it with a labelled uncontrolled
 * <textarea> that captures its seed at mount, so tests drive the body as before
 * and a re-seed still needs a remount (an editorKey bump), exactly like the real
 * editor; the real component is covered by MarkdownEditor.test. Shared by the
 * collection editor test files (memory, custom skills) so the stub lives once.
 * @returns The mocked module shape ({ MarkdownEditor }).
 */
export function markdownEditorTestMock(): {
  MarkdownEditor: (props: {
    ariaLabel?: string;
    initialValue: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
  }) => preact.JSX.Element;
} {
  return {
    MarkdownEditor: (props) => {
      const seeded = useRef(props.initialValue);

      return (
        <textarea
          aria-label={props.ariaLabel}
          defaultValue={seeded.current}
          onInput={(e) =>
            props.onChange((e.target as HTMLTextAreaElement).value)
          }
          onBlur={props.onBlur}
        />
      );
    },
  };
}
