// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

interface CopyButtonProps {
  /** The text written to the clipboard on click. */
  text: string;
  /** Idle label (default "Copy"). */
  label?: string;
  /** Label shown briefly after a successful copy (default "Copied"). */
  copiedLabel?: string;
  /** Button className — styling stays with the caller. */
  className?: string;
}

/** How long the "Copied" confirmation stays up after a successful copy. */
const COPIED_FEEDBACK_MS = 1500;

/**
 * A copy-to-clipboard button that confirms with a brief "Copied" label and
 * swallows a failed clipboard write (denied permission / insecure context)
 * instead of leaking an unhandled rejection. Styling is the caller's via
 * `className`, so it drops into the existing copy affordances unchanged.
 * @param props - Button props
 * @returns Button element
 */
export function CopyButton(props: CopyButtonProps): preact.JSX.Element {
  const { text, label = "Copy", copiedLabel = "Copied", className } = props;
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Clear a pending reset if the button unmounts mid-confirmation.
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const onCopy = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(
          () => setCopied(false),
          COPIED_FEEDBACK_MS,
        );
      } catch {
        // Clipboard write denied; leave the label untouched rather than throw.
      }
    })();
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className={className}
      aria-live="polite"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
