// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type RegisteredMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  afterRenameScenario,
  failOnSet,
  manyScenario,
  repeatScenario,
} from "../../write-conformance-fixtures.ts";
import {
  type ToolArgs,
  type WriteToolAdapter,
} from "../../write-conformance-types.ts";

interface UpdateByIdConfig {
  tool: string;
  run: (args: ToolArgs) => unknown;
  /** Id prefix of the registered objects: `s` gives `s0`, `s1`, ... */
  prefix: string;
  /** What the tool updates, in the plural */
  nouns: string;
  /** Register `n` objects, ids `<prefix>0`... */
  register: (n: number) => RegisteredMockObject[];
  /** A property set after the name, which is where `afterChange` fails */
  lateProp: { name: string; value: unknown };
  /** A property the tool refuses for several targets at once */
  refusedProp: { name: string; value: unknown };
  /** Other calls with an unparsable entry, each in its own mode of the tool */
  unparsableModes?: (register: (n: number) => void) => Array<() => ToolArgs>;
}

/**
 * Build the adapter for a tool that updates objects named by id or path.
 * @param config - What differs between the tools
 * @returns The conformance adapter
 */
export function updateByIdAdapter(config: UpdateByIdConfig): WriteToolAdapter {
  const { prefix, register, lateProp, refusedProp } = config;
  const id = (i: number): string => `${prefix}${i}`;
  const ids = (...is: number[]): string => is.map(id).join(",");

  return {
    tool: config.tool,
    run: config.run,
    na: {
      unparsableDestination:
        "no destination list: path names what is updated, which the unparsable case covers",
      newTwice: `updates existing ${config.nouns} only`,
      replacedLater: "no destination: nothing is created or moved",
      countWithDestinations: "takes no count",
    },

    many: (n) => {
      register(n);

      return manyScenario(n, prefix, id);
    },

    repeat: () => {
      register(2);

      return repeatScenario(prefix, id);
    },

    unparsable: () => {
      register(2);

      return { path: `${id(0)},not-a-path`, name: "A,B" };
    },

    unparsableModes: config.unparsableModes?.(register),

    unappliable: () => {
      register(2);
      mockNonExistentObjects();

      return {
        args: { id: `${id(1)},nowhere,${id(0)}`, name: "A,B,C" },
        badIndex: 1,
        landed: [
          { kind: "set", id: id(1), name: "name", args: ["A"] },
          { kind: "set", id: id(0), name: "name", args: ["C"] },
        ],
        expected: [{ id: id(1) }, {}, { id: id(0) }],
      };
    },

    midway: () => {
      const [, second] = register(3);

      failOnSet(second as never);

      return {
        args: { id: ids(0, 1, 2), name: "A,B,C" },
        failIndex: 1,
        message: LIVE_FAILURE,
        expected: [{ id: id(0) }, {}, { id: id(2) }],
      };
    },

    afterChange: () =>
      afterRenameScenario(register(3), prefix, lateProp.name, lateProp.value),

    wrongLength: () => {
      register(2);

      return { id: ids(0, 1), name: "A,B,C" };
    },

    refusals: [
      () => {
        register(2);

        return { name: "A" };
      },
      () => {
        register(2);

        return { id: ids(0, 1), [refusedProp.name]: refusedProp.value };
      },
    ],

    loneSkipped: () => {
      register(1);
      mockNonExistentObjects();

      return { args: { id: "nowhere", name: "A" }, detail: "nowhere" };
    },
  };
}
