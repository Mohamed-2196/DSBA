// The typed API client. Paths and payloads come from src/api/schema.d.ts, generated from the backend's
// OpenAPI document (npm run api:types after the API changes). Use `call()` to get the data or an ApiError.
import createClient, { type Middleware } from 'openapi-fetch';
import { ApiError, toApiError } from './errors';
import type { paths } from './schema';

/** '' = the same origin as the app (the dev server and the production proxy both forward /api). */
export const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? '';
const CSRF_COOKIE = 'dsba_csrf';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

/** The API rejects unsafe requests without the CSRF token: echo the dsba_csrf cookie (fetching it once if needed). */
const csrf: Middleware = {
  async onRequest({ request }) {
    if (!UNSAFE.has(request.method)) return request;
    let token = readCookie(CSRF_COOKIE);
    if (!token) {
      await fetch(`${API_ORIGIN}/api/v1/auth/csrf`, { credentials: 'include' });
      token = readCookie(CSRF_COOKIE);
    }
    if (token) request.headers.set('X-CSRF-Token', token);
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: API_ORIGIN, credentials: 'include' });
api.use(csrf);

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Await an api.GET/POST/... call: resolves to its data, or throws an ApiError (also for network failures). */
export async function call<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await request;
  } catch (e) {
    throw new ApiError({ status: 0, code: 'network', message: 'Could not reach the server. Check your connection.', cause: e });
  }
  if (result.error !== undefined || !result.response.ok) throw toApiError(result.response, result.error);
  return result.data as T;
}

/** A same-origin URL for endpoints the browser opens itself (downloads, media, the calendar feed). */
export function apiUrl(path: `/api/v1/${string}`): string {
  return `${API_ORIGIN}${path}`;
}
