export class ApiError extends Error {
  public statusCode: number;
  public errors: string[];

  constructor(statusCode: number, message: string, errors: string[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors: string[] = []) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = 'Not authenticated') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  static conflict(message: string) {
    return new ApiError(409, message);
  }
  static unprocessable(message: string, errors: string[] = []) {
    return new ApiError(422, message, errors);
  }
  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }
}
