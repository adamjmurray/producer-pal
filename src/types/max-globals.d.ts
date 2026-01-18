/**
 * Type declarations for Max/MSP V8 JavaScript environment globals.
 * These are available in the Max for Live runtime but not in Node.js.
 */

/**
 * Context object passed to tool functions.
 * Contains runtime state managed by the live-api-adapter.
 */
interface ToolContext {
  projectNotes: {
    enabled: boolean;
    writable: boolean;
    content: string;
  };
  smallModelMode: boolean;
  sampleFolder: string | null;
  holdingAreaStartBeats?: number;
}

/**
 * Max Dict object for storing and retrieving named dictionaries.
 */
declare class Dict {
  /** The name of the dictionary */
  readonly name: string;

  /** Serialize the dictionary to a JSON string */
  stringify(): string;
}

/**
 * Max V8 global function to post messages to the Max console.
 */
declare function post(...args: unknown[]): void;

/**
 * Max V8 global function to post error messages to the Max console.
 */
declare function error(...args: unknown[]): void;

/**
 * Max V8 global function to send messages to outlets.
 * @param outletNumber - The outlet index (0-based)
 * @param args - The message selector and arguments
 */
declare function outlet(outletNumber: number, ...args: unknown[]): void;

/**
 * Max V8 Task object for scheduling callbacks.
 */
declare class Task {
  constructor(callback: () => void);
  /** Schedule the task to run after a delay in milliseconds */
  schedule(delayMs: number): void;
  /** Cancel the scheduled task */
  cancel(): void;
}

/**
 * Max V8 Folder object for file system operations.
 */
declare class Folder {
  constructor(path: string);
  /** Current directory path */
  readonly pathname: string;
  /** Current file/folder name (iterate with next()) */
  readonly filename: string;
  /** File extension of current entry */
  readonly extension: string;
  /** Type of current entry: "file" or "fold" */
  readonly filetype: "file" | "fold";
  /** True when iteration is complete */
  readonly end: boolean;
  /** Move to next entry */
  next(): void;
  /** Close the folder handle */
  close(): void;
}
