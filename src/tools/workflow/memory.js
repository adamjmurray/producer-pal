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

  const projectNotes = context.projectNotes;

  if (!projectNotes) {
    return { enabled: false };
  }

  if (action === "read") {
    if (!projectNotes.enabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      writable: projectNotes.writable,
      content: projectNotes.content,
    };
  }

  // action === "write" (validated above)
  if (!projectNotes.enabled) {
    throw new Error("Project context is disabled");
  }

  if (!projectNotes.writable) {
    throw new Error(
      "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
    );
  }

  if (!content) {
    throw new Error("Content required for write action");
  }

  projectNotes.content = content;

  // Send update to Max patch via outlet
  // Assuming outlet 0 is for communication back to Max
  outlet(0, "updatenotes", content);

  return {
    enabled: true,
    writable: projectNotes.writable,
    content: projectNotes.content,
  };
}
