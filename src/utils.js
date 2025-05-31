// src/utils.js

/**
 * Sets properties on a target object, but only for non-null values
 * @param {Object} target - The object to set properties on
 * @param {Object} properties - Object with key-value pairs to set
 */
export function setAllNonNull(target, properties) {
  for (const [key, value] of Object.entries(properties)) {
    if (value != null) {
      target[key] = value;
    }
  }
}