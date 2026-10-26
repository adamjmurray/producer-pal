// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { buttonClass, noteClass } from "./helpers/installation-classes";

interface RemoteScriptStepsProps {
  /** True while Live still has to be pointed at the script. */
  expanded: boolean;
  /** Re-reads the status, for after the steps are done. */
  onRefresh: () => void;
}

/**
 * What the user has to do in Live. Open, with a button to check again, while
 * Live isn't running the script; tucked away once it is, since by then the
 * steps are done.
 * @param {RemoteScriptStepsProps} props - Component props
 * @param {boolean} props.expanded - Whether Live still has to be pointed at the script
 * @param {Function} props.onRefresh - Re-reads the status
 * @returns {JSX.Element} The enable steps
 */
export function RemoteScriptSteps({
  expanded,
  onRefresh,
}: RemoteScriptStepsProps) {
  const steps = (
    <ol className="m-0 list-decimal space-y-0.5 pl-[18px]">
      <li>Restart Live — it only scans Remote Scripts at startup.</li>
      <li>In Live, open Settings → Tempo &amp; MIDI.</li>
      <li>
        Under Control Surface pick Producer Pal. Leave Input and Output as None.
      </li>
    </ol>
  );

  if (!expanded) {
    return (
      <details
        data-testid="remote-script-steps"
        className="text-zinc-600 dark:text-zinc-400"
      >
        <summary className="cursor-pointer">Setup steps</summary>
        <div className="mt-1.5">{steps}</div>
      </details>
    );
  }

  return (
    <div
      data-testid="remote-script-steps"
      className="flex flex-col gap-1.5 border-t border-zinc-300 pt-2 dark:border-zinc-600"
    >
      <h4 className="font-semibold">Enable it in Live</h4>
      {steps}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          data-testid="remote-script-refresh"
          onClick={onRefresh}
          className={`flex items-center gap-1.5 ${buttonClass}`}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 4v5h-5" />
          </svg>
          Check again
        </button>
        <span className={noteClass}>Turns green once Live loads it.</span>
      </div>
    </div>
  );
}
