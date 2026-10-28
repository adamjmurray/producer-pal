// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How the steps that put the Producer Pal device in a Live Set report a
// failure. add-producer-pal and update-producer-pal share them.

/** A failure to report, worded for the model. */
export class SetupFailed extends Error {}

/** What a run of the steps is for, so a refusal can say what it left alone. */
export interface SetupPurpose {
  /** The ppal-manage action, which a refusal says to call again */
  action: "add-producer-pal" | "update-producer-pal";
  /** What needs the remote script, e.g. "adding the device" */
  doing: string;
  /** What a refusal says didn't happen, e.g. "nothing was added" */
  unchanged: string;
}

/**
 * @param text - A clause that starts in lower case
 * @returns The clause as the start of a sentence
 */
export function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
