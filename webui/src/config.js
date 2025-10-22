export const getModelName = (modelId) => {
  switch (modelId) {
    case "gemini-2.5-pro":
      return "Gemini 2.5 Pro";
    case "gemini-2.5-flash":
      return "Gemini 2.5 Flash";
    case "gemini-2.5-flash-lite":
      return "Gemini 2.5 Flash-Lite";
    default:
      return modelId;
  }
};

export const getThinkingBudget = (level) => {
  switch (level) {
    case "Off":
      return 0;
    case "Low":
      return 2048;
    case "Medium":
      return 4096;
    case "High":
      return 8192;
    case "Ultra":
      return 16384;
    case "Auto":
      return -1;
    default:
      return 0;
  }
};
