export type ServiceResult<T> =
  { ok: true; value: T } | { ok: false; statusCode: 400 | 401 | 403 | 404 | 409; error: string };
