// device/utils.js
function parseIds(idArray) {
  var result = [];
  for (var i = 0; i < idArray.length; i += 2) {
    result.push(idArray[i] + " " + idArray[i + 1]); // e.g., "id 30"
  }
  return result;
}

function parseId(idArray) {
  return `${idArray[0]} ${idArray[1]}`;
}

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

module.exports = {
  parseIds,
  parseId,
  liveColorToCss,
};
