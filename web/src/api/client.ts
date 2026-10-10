// The typed API client. Paths and payloads come from src/api/schema.d.ts, generated from the backend's
// OpenAPI document (npm run api:types after the API changes). Use `call()` to get the data or an ApiError.
import createClient, { type Middleware } from 'openapi-fetch';
import { ApiError, toApiError } from './errors';
import type { paths } from './schema';

/** '' = the same origin as the app (the dev server and the production proxy both forward /api). */
export const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? '';
/** The API's CSRF cookie: dsba_csrf in development, __Host-dsba_csrf in production (set when the app is built). */
const CSRF_COOKIE: string = import.meta.env.VITE_CSRF_COOKIE || 'dsba_csrf';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

/** The CSRF cookie's token, asking the API for one first if the browser has none yet. */
async function csrfToken(): Promise<string | null> {
  const token = readCookie(CSRF_COOKIE);
  if (token) return token;
  await fetch(`${API_ORIGIN}/api/v1/auth/csrf`, { credentials: 'include' });
  return readCookie(CSRF_COOKIE);
}

/** 403 {"error": {"code": "csrf_failed"}} (read from a copy: the caller still reads the answer itself). */
async function isCsrfFailure(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body: unknown = await response.clone().json();
    if (typeof body !== 'object' || body === null || !('error' in body)) return false;
    const { error } = body;
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'csrf_failed';
  } catch {
    return false;
  }
}

/** Unsafe requests on their way, each with an untouched copy kept for one retry (a body can only be sent once). */
const copies = new WeakMap<Request, Request>();

/**
 * The API rejects unsafe requests without the CSRF token: echo the CSRF cookie in X-CSRF-Token. The token belongs
 * to the session and changes at sign-in and sign-out, so a request that crossed one (another tab signed out, a
 * page left open) gets 403 csrf_failed together with the right cookie: it is sent once more with the new token.
 */
const csrf: Middleware = {
  async onRequest({ request }) {
    if (!UNSAFE.has(request.method)) return request;
    const token = await csrfToken();
    if (token) request.headers.set('X-CSRF-Token', token);
    copies.set(request, request.clone());
    return request;
  },
  async onResponse({ request, response }) {
    const copy = copies.get(request);
    copies.delete(request);
    if (!copy || !(await isCsrfFailure(response))) return undefined;
    const token = readCookie(CSRF_COOKIE);
    if (token) copy.headers.set('X-CSRF-Token', token);
    return fetch(copy);
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
