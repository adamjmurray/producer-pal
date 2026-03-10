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
        className="w-full px-2 py-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded resize-none text-sm"
        value={text}
        onInput={(e) => onTextChange((e.target as HTMLTextAreaElement).value)}
        onKeyDown={handleKeyDown}
        rows={3}
        data-testid="edit-message-textarea"
      />
      <div className="flex gap-2 mt-1 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-stone-100 dark:bg-stone-600 hover:bg-stone-200 dark:hover:bg-stone-700"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!text.trim()}
          className="px-3 py-1 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
          data-testid="edit-message-save"
        >
          Save & Send
        </button>
      </div>
    </div>
  );
}
