// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type FunctionNode } from "../../parser/transform-parser.ts";
import { type ArityNode } from "./function-arity.ts";

const WAVEFORMS = new Set(["cos", "sin", "tri", "saw", "square"]);

/**
 * Throw for a waveform whose period uses a per-note value (`note.*`, `next.*`),
 * anywhere in an expression or where() predicate. The period is a cycle length,
 * so `sin(note.start * 6.28)` or `sin(note.start + 0.5)` is a radians habit that
 * gives a meaningless pattern. A negative or zero period is fine, and so are
 * clip values and random functions: only a note property is refused.
 * @param node - The expression or predicate to search
 * @throws Error naming the waveform and the property
 */
export function checkWaveformPeriods(node: ArityNode | undefined): void {
  for (const call of functionCalls(node)) {
    const property = WAVEFORMS.has(call.name)
      ? findNoteProperty(call.args[0])
      : null;

    if (property != null) {
      throw new Error(
        `${call.name}() period is a cycle length (e.g. ${call.name}(n/4) or ${call.name}(1bar)), not radians, so it can't use ${property}; put per-note variation in the phase (2nd argument)`,
      );
    }
  }
}

// Every function call in the tree, outermost first.
function* functionCalls(node: ArityNode | undefined): Generator<FunctionNode> {
  if (node == null || typeof node !== "object") {
    return;
  }

  if (node.type === "function") {
    yield node;

    for (const arg of node.args) {
      yield* functionCalls(arg);
    }
  } else if ("operand" in node) {
    yield* functionCalls(node.operand);
  } else if ("left" in node) {
    yield* functionCalls(node.left);
    yield* functionCalls(node.right);
  }
}

// The first per-note variable in an expression, as written (`note.start`).
function findNoteProperty(node: ArityNode | undefined): string | null {
  if (node == null || typeof node !== "object") {
    return null;
  }

  switch (node.type) {
    case "variable":
      return node.namespace === "note" || node.namespace === "next"
        ? `${node.namespace}.${node.name}`
        : null;

    case "function":
      return firstProperty(node.args);

    case "not":
      return findNoteProperty(node.operand);

    case "barBeatPoint":
    case "nDuration":
    case "barDuration":
    case "pitchLiteral":
      return null;

    default:
      return firstProperty([node.left, node.right]);
  }
}

function firstProperty(nodes: ArityNode[]): string | null {
  for (const node of nodes) {
    const property = findNoteProperty(node);

    if (property != null) {
      return property;
    }
  }

  return null;
}
