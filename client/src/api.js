export class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The studio could not be reached. Check your connection and try again.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The studio returned an unexpected response.');
  }

  if (!response.ok) {
    const problem = payload?.error ?? {};
    throw new ApiError(
      response.status,
      problem.code ?? 'REQUEST_FAILED',
      problem.message ?? 'The request could not be completed.',
      problem.fields,
    );
  }

  return payload.data;
}

export const formatMoney = (minor) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);

export const formatDateTime = (value) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
