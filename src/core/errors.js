export class ImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.details = details;
  }
}
