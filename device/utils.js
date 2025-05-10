// device/utils.js

function liveColorToCss(colorValue) {
  var r = (colorValue >> 16) & 0xff;
  var g = (colorValue >> 8) & 0xff;
  var b = colorValue & 0xff;

  // Convert each to 2-digit hex and concatenate
  return (
    "#" +
    r.toString(16).padStart(2, "0").toUpperCase() +
    g.toString(16).padStart(2, "0").toUpperCase() +
    b.toString(16).padStart(2, "0").toUpperCase()
  );
}

function cssToLiveColor(cssColor) {
  if (!cssColor.startsWith("#") || cssColor.length !== 7) {
    throw new Error(`Invalid color format: must be "#RRGGBB"`);
  }

  // Parse hex values to RGB
  const r = parseInt(cssColor.substring(1, 3), 16);
  const g = parseInt(cssColor.substring(3, 5), 16);
  const b = parseInt(cssColor.substring(5, 7), 16);

  // Check for NaN values from invalid hex
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    throw new Error(`Invalid hex values in color: ${cssColor}`);
  }

  // Return in Live's color format (0x00RRGGBB)
  return (r << 16) | (g << 8) | b;
}

module.exports = {
  liveColorToCss,
  cssToLiveColor,
};
