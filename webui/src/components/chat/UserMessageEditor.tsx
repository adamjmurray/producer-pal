// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";

interface UserMessageEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Inline editor for user messages, shown when editing a message
 * @param {UserMessageEditorProps} props - Component props
 * @param {string} props.text - Current text value
 * @param {(text: string) => void} props.onTextChange - Text change callback
 * @param {() => void} props.onSave - Save callback
 * @param {() => void} props.onCancel - Cancel callback
 * @returns {JSX.Element} - React component
 */
export function UserMessageEditor({
  text,
  onTextChange,
  onSave,
  onCancel,
}: UserMessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      if (text.trim()) {
        onSave();
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="py-1">
      <textarea
        ref={textareaRef}
        className="w-full resize-none rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
        value={text}
        onInput={(e) => onTextChange((e.target as HTMLTextAreaElement).value)}
        onKeyDown={handleKeyDown}
        rows={3}
        data-testid="edit-message-textarea"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1 text-sm hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-700"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!text.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="edit-message-save"
        >
          Save & Send
        </button>
      </div>
    </div>
  );
}
