// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** Provider-side refusals: capacity, rate and usage limits, billing, overload. */
const PROVIDER_REFUSAL =
  /at capacity|rate.?limit|usage limit|credit balance|overloaded|too many requests|quota|\b(?:429|503|529)\b/i;

/**
 * Whether an error is the model provider refusing the request. Such a run
 * tested nothing about the model, so it is an infra error, not a fail.
 *
 * @param error - Error message from the provider, CLI, or harness
 * @returns True when the provider refused the request
 */
export function isProviderRefusal(error: string): boolean {
  return PROVIDER_REFUSAL.test(error);
}
