export type ServiceResult<T> =
  { ok: true; value: T } | { ok: false; statusCode: 400 | 403 | 404; error: string };
