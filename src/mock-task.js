// src/mock-task.js
export class Task {
  constructor(callback, context) {
    this.callback = callback.bind(context);
  }

  schedule(_ms) {
    this.callback(); // immediately invoke during tests
  }
}
