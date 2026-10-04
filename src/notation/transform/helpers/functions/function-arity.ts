// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type BarBeatPointNode,
  type ExpressionNode,
  type PredicateNode,
} from "../../parser/transform-parser.ts";

export type ArityNode = ExpressionNode | PredicateNode | BarBeatPointNode;

interface Arity {
  min: number;
  max: number;
  usage: string;
}

const MATH_1 = (name: string): Arity => ({
  min: 1,
  max: 1,
  usage: `${name}(value)`,
});
const MATH_3 = (name: string): Arity => ({
  min: 3,
  max: 3,
  usage: `${name}(value, min, max)`,
});
const WAVE = (name: string): Arity => ({
  min: 1,
  max: 2,
  usage: `${name}(period [, phase])`,
});

// How many positional arguments each built-in function takes (the trailing
// `sync`/`raw` keywords are not arguments).
const ARITY: Record<string, Arity | undefined> = {
  rand: { min: 0, max: 2, usage: "rand(), rand(max) or rand(min, max)" },
  choose: { min: 1, max: Infinity, usage: "choose(a, b, ...)" },
  seq: { min: 1, max: Infinity, usage: "seq(a, b, ...)" },
  clipseq: { min: 1, max: Infinity, usage: "clipseq(a, b, ...)" },
  snap: { min: 1, max: 1, usage: "snap(pitch)" },
  step: { min: 2, max: 2, usage: "step(basePitch, offset)" },
  quant: { min: 1, max: 1, usage: "quant(grid)" },
  swing: { min: 1, max: 2, usage: "swing(amount [, grid])" },
  legato: { min: 0, max: 1, usage: "legato([tolerance])" },
  pow: { min: 2, max: 2, usage: "pow(base, exponent)" },
  curve: { min: 3, max: 3, usage: "curve(start, end, exponent)" },
  ramp: { min: 2, max: 2, usage: "ramp(start, end)" },
  min: { min: 2, max: Infinity, usage: "min(a, b, ...)" },
  max: { min: 2, max: Infinity, usage: "max(a, b, ...)" },
  round: MATH_1("round"),
  floor: MATH_1("floor"),
  ceil: MATH_1("ceil"),
  abs: MATH_1("abs"),
  clamp: MATH_3("clamp"),
  wrap: MATH_3("wrap"),
  reflect: MATH_3("reflect"),
  cos: WAVE("cos"),
  sin: WAVE("sin"),
  tri: WAVE("tri"),
  saw: WAVE("saw"),
  square: {
    min: 1,
    max: 3,
    usage: "square(period [, phase] [, pulseWidth])",
  },
};

/**
 * Find a built-in function call with the wrong number of arguments, anywhere in
 * an expression or a where() predicate.
 * @param node - The expression or predicate to search
 * @returns What is wrong with the first such call, or null when all are fine
 */
export function findArityError(node: ArityNode | undefined): string | null {
  if (node == null || typeof node !== "object") {
    return null;
  }

  switch (node.type) {
    case "function": {
      const own = ownArityError(node.name, node.args.length);

      return own ?? firstArityError(node.args);
    }

    case "not":
      return findArityError(node.operand);

    case "variable":
    case "barBeatPoint":
    case "nDuration":
    case "barDuration":
    case "pitchLiteral":
      return null;

    default:
      // A binary, comparison or logical node: two operands.
      return firstArityError([node.left, node.right]);
  }
}

function firstArityError(nodes: ArityNode[]): string | null {
  for (const node of nodes) {
    const error = findArityError(node);

    if (error != null) {
      return error;
    }
  }

  return null;
}

function argumentCount(n: number): string {
  return `${n} argument${n === 1 ? "" : "s"}`;
}

function ownArityError(name: string, count: number): string | null {
  const arity = ARITY[name];

  if (arity == null || (count >= arity.min && count <= arity.max)) {
    return null;
  }

  const phrase =
    arity.min === arity.max
      ? `exactly ${argumentCount(arity.min)}`
      : arity.max === Infinity
        ? `at least ${argumentCount(arity.min)}`
        : `${arity.min}-${arity.max} arguments`;

  return `${name}() needs ${phrase}: ${arity.usage}`;
}
