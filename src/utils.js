// src/utils.js

/**
 * Sets properties on a target object, but only for non-null values
 * @param {Object} target - The object to set properties on
 * @param {Object} properties - Object with key-value pairs to set
 * @returns {Object} The target object (for chaining)
 */
export function setAllNonNull(target, properties) {
  for (const [key, value] of Object.entries(properties)) {
    if (value != null) {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Creates a new object with all non-null properties from the input object
 * @param {Object} obj - Object with key-value pairs
 * @returns {Object} New object containing only non-null properties
 */
export function withoutNulls(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value != null) {
      result[key] = value;
    }
  }
  return result;
}