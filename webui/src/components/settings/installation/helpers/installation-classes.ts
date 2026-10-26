// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Styles shared by the Installation tab's sections.

const baseButton =
  "rounded-md border px-3 py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = `${baseButton} border-zinc-300 bg-zinc-200 hover:bg-zinc-300 disabled:hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-700 dark:disabled:hover:bg-zinc-600`;

export const primaryButtonClass = `${baseButton} border-blue-600 bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:hover:bg-zinc-200 dark:disabled:border-zinc-600 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400 dark:disabled:hover:bg-zinc-700`;

export const noteClass = "text-xs text-zinc-600 dark:text-zinc-400";

/** Secondary text at the card's body size. */
export const mutedClass = "text-zinc-600 dark:text-zinc-400";

export const warnTextClass = "text-amber-700 dark:text-amber-400";

export const goodTextClass = "text-green-700 dark:text-green-400";

export const errorTextClass = "text-red-600 dark:text-red-400";

export const linkClass = "text-blue-600 hover:underline dark:text-blue-400";

export const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-900";
