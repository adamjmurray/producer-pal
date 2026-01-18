/**
 * Manages user-defined project context stored in the Max device.
 * @param {{ action?: string, content?: string }} args - The parameters
 * @param {Partial<ToolContext>} [context] - The context object from main.js
 * @returns {{ enabled: boolean, writable?: boolean, content?: string }} Project context information
 */
export function memory({ action, content } = {}, context = {}) {
  if (!action) {
    throw new Error("Action is required");
  }

  if (action !== "read" && action !== "write") {
    throw new Error("Action must be 'read' or 'write'");
  }

  if (action === "read") {
    if (!context.projectNotes.enabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      writable: context.projectNotes.writable,
      content: context.projectNotes.content,
    };
  }

  if (action === "write") {
    if (!context.projectNotes.enabled) {
      throw new Error("Project context is disabled");
    }

    if (!context.projectNotes.writable) {
      throw new Error(
        "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
      );
    }

    if (!content) {
      throw new Error("Content required for write action");
    }

    context.projectNotes.content = content;

    // Send update to Max patch via outlet
    // Assuming outlet 0 is for communication back to Max
    outlet(0, "updatenotes", content);

    return {
      enabled: true,
      writable: context.projectNotes.writable,
      content: context.projectNotes.content,
    };
  }
}
