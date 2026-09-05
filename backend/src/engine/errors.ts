import type { ApiErrorCode } from '@formatavern/shared';

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: ApiErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
