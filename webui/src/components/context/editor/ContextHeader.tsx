// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import logoSvg from "#webui/assets/producer-pal-logo.svg";
import { type DocStatus, type SaveStatus } from "#webui/hooks/context/use-doc";
import { usePreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { CONTEXT_DOCS_URL } from "#webui/lib/config";
import { SaveIndicator } from "./SaveIndicator";

// Circular "?" help badge, matching the chat header and settings help links.
// It has no padding of its own, so mx-1 gives it the same 4px inset that the
// close button's p-1 gives its icon, keeping the gaps even.
const helpLinkClass =
  "inline-flex items-center justify-center w-6 h-6 mx-1 text-sm font-semibold leading-none rounded-full border border-zinc-400 dark:border-zinc-500 text-zinc-500 dark:text-zinc-400 hover:border-zinc-200 hover:text-white dark:hover:border-zinc-300 dark:hover:text-white no-underline shrink-0 transition-colors";

interface ContextHeaderProps {
  title: string;
  tabSlot?: preact.JSX.Element;
  closeAriaLabel: string;
  status?: DocStatus;
  saveStatus?: SaveStatus;
  dirty?: boolean;

  /**
   * Replaces the save indicator when provided. Read-only screens (the skills
   * preview) pass their own status text here so the header doesn't show a
   * misleading "Auto-save on" for content that is never saved.
   */
  rightSlot?: preact.JSX.Element;
  onClose?: () => void;
}

/**
 * Header strip showing the Producer Pal Context brand (logo + title, top-left),
 * the tab strip (or a plain title), the save indicator (or a custom
 * `rightSlot`), a documentation help link (when help links are enabled in
 * preferences), and (when mounted inside the chat-app overlay) a close button.
 * Shared by every context screen (docs, memory, skills) so the brand and the
 * tab strip + help + close controls stay identical across tabs.
 * @param props - Header props
 * @returns Header element
 */
export function ContextHeader(props: ContextHeaderProps): preact.JSX.Element {
  const { title, tabSlot, closeAriaLabel, status, rightSlot, onClose } = props;
  const { showHelpLinks } = usePreferencesSettings();

  return (
    // Background, height (py-2), border, and shadow mirror the chat header bar
    // (see ChatHeader) so the two screens read as one product.
    //
    // Three columns: the left brand cell (logo + title) balances the right cluster
    // (save indicator + help + close) so the centered tab strip stays centered — the two
    // 1fr side columns are equal regardless of either side's changing width, so it
    // never nudges the tabs. The cluster lives in its own column (not absolutely
    // positioned), so the tabs can't slide under it; the center cell scrolls
    // horizontally instead when they outgrow a narrow viewport. The brand title
    // hides below `lg` (logo alone), mirroring the chat header, so it never crowds
    // the tabs on a narrow window.
    <header className="grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-400 dark:border-zinc-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] relative z-20">
      <a
        href="https://producer-pal.org"
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex items-center pl-7 lg:pl-9 min-w-0 hover:opacity-80 transition-opacity no-underline"
        title="Producer Pal website"
      >
        <img
          src={logoSvg}
          alt="Producer Pal"
          className="absolute left-0 h-5 scale-200"
        />
        <h1 className="hidden lg:inline text-base font-semibold truncate">
          Producer Pal Context
        </h1>
      </a>

      <div className="min-w-0 overflow-x-auto">
        {tabSlot ?? <h1 className="text-base font-semibold">{title}</h1>}
      </div>

      <div className="flex items-center justify-end gap-3">
        {rightSlot ??
          (status != null && (
            <SaveIndicator
              status={status}
              saveStatus={props.saveStatus ?? "idle"}
              dirty={props.dirty ?? false}
            />
          ))}
        {showHelpLinks && (
          <a
            href={CONTEXT_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={helpLinkClass}
            title="Documentation"
          >
            ?
          </a>
        )}
        {onClose != null && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel}
            title="Close (Esc)"
            className="p-1 -mr-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 4L14 14M14 4L4 14" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
