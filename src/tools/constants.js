// src/tools/constants.js
export const MAX_AUTO_CREATED_TRACKS = 100;
export const MAX_AUTO_CREATED_SCENES = 1000;
export const MAX_CLIP_BEATS = 1_000_000;

// Monitoring states for user-facing API
export const MONITORING_STATE = {
  IN: "in",
  AUTO: "auto",
  OFF: "off",
};

// Live API numeric values for monitoring states
export const LIVE_API_MONITORING_STATE_IN = 0;
export const LIVE_API_MONITORING_STATE_AUTO = 1;
export const LIVE_API_MONITORING_STATE_OFF = 2;
