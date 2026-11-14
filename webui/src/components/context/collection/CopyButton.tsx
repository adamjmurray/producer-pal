// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { copyText } from "#webui/lib/utils/copy-text";

interface CopyButtonProps {
  /** The text written to the clipboard on click. */
  text: string;
  /** Idle label (default "Copy"). */
  label?: string;
  /** Label shown briefly after a successful copy (default "Copied"). */
  copiedLabel?: string;
  /** Label shown briefly when the copy fails (default "Copy failed"). */
  failedLabel?: string;
  /** Button className — styling stays with the caller. */
  className?: string;
}

/** How long the "Copied" or "Copy failed" label stays up. */
const FEEDBACK_MS = 1500;

/**
 * A copy-to-clipboard button that confirms with a brief "Copied" label, or
 * "Copy failed" when no way of copying works. Works on plain-HTTP pages, where
 * the async clipboard API is missing. Styling is the caller's via `className`,
 * so it drops into the existing copy affordances unchanged.
 * @param props - Button props
 * @returns Button element
 */
export function CopyButton(props: CopyButtonProps): preact.JSX.Element {
  const {
    text,
    label = "Copy",
    copiedLabel = "Copied",
    failedLabel = "Copy failed",
    className,
  } = props;
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const labels = { copied: copiedLabel, failed: failedLabel };

  // Clear a pending reset if the button unmounts mid-confirmation.
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const onCopy = useCallback(() => {
    void copyText(text).then((ok) => {
      setFeedback(ok ? "copied" : "failed");
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className={className}
      aria-live="polite"
    >
      {feedback == null ? label : labels[feedback]}
    </button>
  );
}
