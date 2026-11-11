export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...this.extra,
      },
    };
  }
}
