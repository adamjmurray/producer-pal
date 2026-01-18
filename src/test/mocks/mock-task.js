export class Task {
  /**
   * Create a scheduled task
   * @param {Function} callback - Callback function
   * @param {unknown} context - Execution context
   */
  constructor(callback, context) {
    this.callback = callback.bind(context);
  }

  /**
   * Schedule the task (immediately invokes in tests)
   * @param {number} _ms - Delay in milliseconds (ignored in tests)
   */
  schedule(_ms) {
    this.callback(); // immediately invoke during tests
  }
}
