// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import type { BarCopyNote, NoteEvent } from "#src/notation/types.ts";
import type {
  BufferState,
  PitchState,
} from "./barbeat-interpreter-buffer-helpers.ts";
import {
  handleBarCopyRangeDestination,
  handleBarCopySingleDestination,
} from "./barbeat-interpreter-copy-helpers.ts";

type BarCopyElement = Parameters<typeof handleBarCopySingleDestination>[0];
type CopyHandler = typeof handleBarCopySingleDestination;

/**
 * Default buffer state for copy operations
 */
export const defaultBufferState: BufferState = {
  currentPitches: [] as PitchState[],
  pitchesEmitted: true,
  stateChangedSinceLastPitch: false,
  pitchGroupStarted: false,
  stateChangedAfterEmission: false,
};

/**
 * Expected result when a bar copy operation fails/returns null
 */
export const nullCopyResult = {
  currentTime: null,
  hasExplicitBarNumber: false,
};

/**
 * Internal helper to test copy failure for either range or single destination handlers.
 * @param handler - The handler function to call
 * @param element - The copy element with source and destination
 * @param errorContains - Substring that error message should contain
 * @param notesByBar - Notes map
 * @param bufferState - Buffer state
 * @returns Returns true after assertions pass
 */
function testCopyFailureWithHandler(
  handler: CopyHandler,
  element: BarCopyElement,
  errorContains: string,
  notesByBar: Map<number, BarCopyNote[]>,
  bufferState: BufferState,
): true {
  const result = handler(element, 4, 4, notesByBar, [], bufferState);

  expect(result).toStrictEqual(nullCopyResult);
  expect(outlet).toHaveBeenCalledWith(
    1,
    expect.stringContaining(errorContains),
  );

  return true;
}

/**
 * Runs a test for handleBarCopyRangeDestination that expects a null result with an error message.
 * Returns true after all assertions pass.
 * @param options - Test options
 * @param options.element - The copy element with source and destination
 * @param options.errorContains - Substring that error message should contain
 * @param options.notesByBar - Optional notes map
 * @param options.bufferState - Optional buffer state override
 * @returns Returns true after assertions pass
 */
export function testRangeCopyFailure({
  element,
  errorContains,
  notesByBar = new Map(),
  bufferState = defaultBufferState,
}: {
  element: BarCopyElement;
  errorContains: string;
  notesByBar?: Map<number, BarCopyNote[]>;
  bufferState?: BufferState;
}): true {
  return testCopyFailureWithHandler(
    handleBarCopyRangeDestination,
    element,
    errorContains,
    notesByBar,
    bufferState,
  );
}

/**
 * Runs a test for handleBarCopySingleDestination that expects a null result with an error message.
 * Returns true after all assertions pass.
 * @param options - Test options
 * @param options.element - The copy element with source and destination
 * @param options.errorContains - Substring that error message should contain
 * @param options.notesByBar - Optional notes map
 * @param options.bufferState - Optional buffer state override
 * @returns Returns true after assertions pass
 */
export function testSingleCopyFailure({
  element,
  errorContains,
  notesByBar = new Map(),
  bufferState = defaultBufferState,
}: {
  element: BarCopyElement;
  errorContains: string;
  notesByBar?: Map<number, BarCopyNote[]>;
  bufferState?: BufferState;
}): true {
  return testCopyFailureWithHandler(
    handleBarCopySingleDestination,
    element,
    errorContains,
    notesByBar,
    bufferState,
  );
}

/**
 * Runs a test for handleBarCopySingleDestination that expects a null result without error.
 * Returns true after all assertions pass.
 * @param options - Test options
 * @param options.element - The copy element with source and destination
 * @param options.notesByBar - Optional notes map
 * @param options.bufferState - Optional buffer state override
 * @returns Returns true after assertions pass
 */
export function testSingleCopyNullResult({
  element,
  notesByBar = new Map(),
  bufferState = defaultBufferState,
}: {
  element: BarCopyElement;
  notesByBar?: Map<number, BarCopyNote[]>;
  bufferState?: BufferState;
}): true {
  const result = handleBarCopySingleDestination(
    element,
    4, // beatsPerBar
    4, // timeSigDenominator
    notesByBar,
    [] as NoteEvent[],
    bufferState,
  );

  expect(result).toStrictEqual(nullCopyResult);

  return true;
}
