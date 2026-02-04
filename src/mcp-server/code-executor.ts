/**
 * Sandboxed JavaScript code executor for MIDI note transformation.
 * Uses Node's vm module to run user-provided code with timeout and security isolation.
 */

import vm from "node:vm";
import {
  CODE_EXEC_TIMEOUT_MS,
  type CodeExecutionContext,
  type CodeExecutionResult,
  type CodeNote,
} from "#src/tools/clip/code-exec/code-exec-types.ts";

/**
 * Safe builtins exposed to user code.
 * Excludes: require, process, global, fetch, setTimeout, setInterval, Buffer, etc.
 */
const SAFE_GLOBALS = {
  Math,
  Array,
  Object,
  Number,
  String,
  Boolean,
  JSON,
  Date,
  Map,
  Set,
  parseInt: Number.parseInt,
  parseFloat: Number.parseFloat,
  isNaN: Number.isNaN,
  isFinite: Number.isFinite,
  undefined,
  NaN: Number.NaN,
  Infinity,
};

/**
 * Execute user-provided JavaScript code to transform notes.
 *
 * @param code - JavaScript code that receives (notes, context) and returns transformed notes
 * @param notes - Array of notes to transform
 * @param context - Execution context with track/clip/liveSet info
 * @param timeoutMs - Timeout in milliseconds (default: CODE_EXEC_TIMEOUT_MS)
 * @returns Transformed notes or error
 */
export function executeCode(
  code: string,
  notes: CodeNote[],
  context: CodeExecutionContext,
  timeoutMs: number = CODE_EXEC_TIMEOUT_MS,
): CodeExecutionResult {
  // Create sandbox with safe globals and deep-copied inputs
  const sandbox = {
    ...SAFE_GLOBALS,
    notes: structuredClone(notes),
    context: Object.freeze(structuredClone(context)),
  };

  const vmContext = vm.createContext(sandbox);

  // Wrap user code in a function that receives notes and context
  const wrappedCode = `
    (function(notes, context) {
      ${code}
    })(notes, context)
  `;

  let result: unknown;

  try {
    result = vm.runInContext(wrappedCode, vmContext, {
      timeout: timeoutMs,
      displayErrors: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check for timeout error
    if (message.includes("Script execution timed out")) {
      return {
        success: false,
        error: `Code execution timed out after ${timeoutMs}ms`,
      };
    }

    return { success: false, error: `Code execution error: ${message}` };
  }

  // Validate result is an array
  if (!Array.isArray(result)) {
    return {
      success: false,
      error: `Code must return an array of notes, got ${typeof result}`,
    };
  }

  // Validate and sanitize each note
  const validatedNotes: CodeNote[] = [];

  for (const note of result) {
    const validated = validateAndSanitizeNote(note);

    if (validated.valid) {
      validatedNotes.push(validated.note);
    }
    // Invalid notes are silently filtered out
  }

  return { success: true, notes: validatedNotes };
}

/**
 * Validate and sanitize a note from user code.
 * Returns a valid note with clamped values, or invalid if note is malformed.
 *
 * @param note - The note object to validate
 * @returns Valid note with sanitized values, or invalid marker
 */
function validateAndSanitizeNote(
  note: unknown,
): { valid: true; note: CodeNote } | { valid: false } {
  if (typeof note !== "object" || note === null) {
    return { valid: false };
  }

  const n = note as Record<string, unknown>;

  // Check required properties exist and are numbers
  if (
    typeof n.pitch !== "number" ||
    typeof n.start !== "number" ||
    typeof n.duration !== "number" ||
    typeof n.velocity !== "number"
  ) {
    return { valid: false };
  }

  // Validate ranges (start can be negative for notes before clip start)
  if (n.duration <= 0) {
    return { valid: false };
  }

  // Sanitize by clamping values
  const sanitized: CodeNote = {
    pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
    start: n.start,
    duration: Math.max(0.001, n.duration),
    velocity: Math.max(1, Math.min(127, Math.round(n.velocity))),
    velocityDeviation: Math.max(
      0,
      Math.min(127, Math.round(Number(n.velocityDeviation) || 0)),
    ),
    probability: Math.max(
      0,
      Math.min(1, n.probability == null ? 1 : Number(n.probability)),
    ),
  };

  return { valid: true, note: sanitized };
}
