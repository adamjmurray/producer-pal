/**
 * Export all evaluation scenarios
 *
 * NOTE: This barrel file provides a single import point for all scenarios.
 * While the project generally discourages barrel files, this simplifies
 * scenario registration in load-scenarios.ts.
 */

export { connectToAbleton } from "./connect-to-ableton.ts";
export { createAndEditClip } from "./create-and-edit-clip.ts";
export { duplicate } from "./duplicate.ts";
export { projectNotesWorkflow } from "./project-notes-workflow.ts";
export { trackAndDeviceWorkflow } from "./track-and-device-workflow.ts";
