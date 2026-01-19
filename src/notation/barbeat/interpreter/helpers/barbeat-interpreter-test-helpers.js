import { expect, vi } from "vitest";
import {
  handleBarCopyRangeDestination,
  handleBarCopySingleDestination,
} from "./barbeat-interpreter-copy-helpers.js";

/**
 * Default buffer state for copy operations
 */
export const defaultBufferState = {
  inBuffer: false,
  currentPitches: [],
  pitchesEmitted: true,
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
 * @param {Function} handler - The handler function to call
 * @param {object} element - The copy element with source and destination
 * @param {string} errorContains - Substring that error message should contain
 * @param {Map} notesByBar - Notes map
 * @param {object} bufferState - Buffer state
 * @returns {true} Returns true after assertions pass
 */
function testCopyFailureWithHandler(
  handler,
  element,
  errorContains,
  notesByBar,
  bufferState,
) {
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => {});

  const result = handler(element, 4, 4, notesByBar, [], bufferState);

  expect(result).toStrictEqual(nullCopyResult);
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining(errorContains),
  );
  consoleErrorSpy.mockRestore();

  return true;
}

/**
 * Runs a test for handleBarCopyRangeDestination that expects a null result with an error message.
 * Returns true after all assertions pass.
 * @param {object} options - Test options
 * @param {object} options.element - The copy element with source and destination
 * @param {string} options.errorContains - Substring that error message should contain
 * @param {Map} [options.notesByBar] - Optional notes map
 * @param {object} [options.bufferState] - Optional buffer state override
 * @returns {true} Returns true after assertions pass
 */
export function testRangeCopyFailure({
  element,
  errorContains,
  notesByBar = new Map(),
  bufferState = defaultBufferState,
}) {
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
 * @param {object} options - Test options
 * @param {object} options.element - The copy element with source and destination
 * @param {string} options.errorContains - Substring that error message should contain
 * @param {Map} [options.notesByBar] - Optional notes map
 * @param {object} [options.bufferState] - Optional buffer state override
 * @returns {true} Returns true after assertions pass
 */
export function testSingleCopyFailure({
  element,
  errorContains,
  notesByBar = new Map(),
  bufferState = defaultBufferState,
}) {
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
 * @param {object} options - Test options
 * @param {object} options.element - The copy element with source and destination
 * @param {Map} [options.notesByBar] - Optional notes map
 * @param {object} [options.bufferState] - Optional buffer state override
 * @returns {true} Returns true after assertions pass
 */
export function testSingleCopyNullResult({
  element,
  notesByBar = new Map(),
  bufferState = defaultBufferState,
}) {
  const result = handleBarCopySingleDestination(
    element,
    4, // beatsPerBar
    4, // timeSigDenominator
    notesByBar,
    [],
    bufferState,
  );

  expect(result).toStrictEqual(nullCopyResult);

  return true;
}
