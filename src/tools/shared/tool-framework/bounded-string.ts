// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";

// llama.cpp rejects any grammar repetition above this
// (MAX_REPETITION_THRESHOLD in src/llama-grammar.cpp).
export const GBNF_REPETITION_LIMIT = 2000;

/**
 * A string param with a length cap that stays out of the JSON Schema.
 *
 * `z.string().max(n)` emits `maxLength`, which llama.cpp-based runtimes (Jan,
 * LM Studio, Ollama, llama-server) compile into a `char{0,n}` grammar
 * repetition. Anything over 2000 is rejected, and since every tool shares one
 * grammar, one oversized param breaks tool calling for ALL tools. A refinement
 * validates identically and emits nothing — so state the limit in the param
 * description instead. See ADR-0021.
 * @param max - Maximum length in characters
 * @returns Zod string schema rejecting longer input
 */
export function boundedString(max: number): z.ZodString {
  return z.string().refine((value) => value.length <= max, {
    message: `must be at most ${max} characters`,
  });
}
