// Every API failure arrives as { error: { code, message, fields?, retryAfter? } } (api/app/core/errors.py).
import type { ErrorDetail } from './schema';

/** The codes the API answers with (api/app/schemas/common.py ErrorCode), and those the web app makes itself when
 *  the request never got an answer: 'network', 'aborted', and the bucket refusing or failing an upload. Branch on
 *  these, never on messages: a typo in a code is a type error (code quality review CQ-10). */
export type ApiErrorCode = ErrorDetail['code'] | 'network' | 'aborted' | 'upload_refused' | 'upload_failed';

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string> | null;
  retryAfter?: number | null;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Record<string, string>;
  readonly retryAfter: number | null;

  constructor({ status, code, message, fields, retryAfter, cause }: ApiErrorInit) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields ? fieldsByName(fields) : {};
    this.retryAfter = retryAfter ?? null;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

interface ErrorBody {
  error?: { code?: ApiErrorCode; message?: string; fields?: Record<string, string> | null; retryAfter?: number | null };
}

export function toApiError(response: Response, body: unknown): ApiError {
  const e = (body as ErrorBody | undefined)?.error;
  return new ApiError({
    status: response.status,
    code: e?.code ?? (response.status >= 500 ? 'internal' : 'error'),
    message: e?.message ?? (response.status >= 500 ? 'Something went wrong on our side.' : 'Request failed.'),
    fields: e?.fields ?? null,
    retryAfter: e?.retryAfter ?? null,
  });
}

/** Where a request's value came from, as a validation error's path may start: never a field's own name in a path. */
const LOCATIONS = new Set(['body', 'query', 'path', 'header', 'cookie']);

/**
 * A field error's key as a form names the field: 'title', 'data.tagline', 'links.0.url'. A leading 'body.' or
 * 'query.' says only where the value came from, so it goes; a field called 'body' (a post's text) keeps its name.
 */
export function fieldKey(key: string): string {
  const dot = key.indexOf('.');
  return dot > 0 && LOCATIONS.has(key.slice(0, dot)) ? key.slice(dot + 1) : key;
}

/** Every key of the API's `fields` as fieldKey names it; the first message wins when two keys name one field. */
function fieldsByName(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    const name = fieldKey(key);
    if (!(name in out)) out[name] = message;
  }
  return out;
}

/** A form's field errors: each on the field it names, and the messages no field of the form shows. */
export interface PlacedErrors<K extends string> {
  fields: Partial<Record<K, string>>;
  /** about the request as a whole, or a field the form doesn't show, once each */
  other: string[];
}

/**
 * Put the API's field errors on a form's fields. A key goes to the field it names, or to the closest field it lies
 * under: 'tags.1' (one of the tags) goes to 'tags', 'links.0.url' to 'links.0.url' when the form has that field and
 * to 'links' when it has only the list. Keys are taken as fieldKey names them, so 'body.title' goes to 'title'.
 */
export function placeFieldErrors<K extends string>(
  fields: Record<string, string>,
  names: readonly K[],
): PlacedErrors<K> {
  const out: PlacedErrors<K> = { fields: {}, other: [] };
  for (const [key, message] of Object.entries(fields)) {
    const path = fieldKey(key);
    let field: K | undefined;
    for (const name of names) {
      if ((path === name || path.startsWith(`${name}.`)) && (field === undefined || name.length > field.length))
        field = name;
    }
    if (field === undefined) {
      if (!out.other.includes(message)) out.other.push(message);
    } else if (out.fields[field] === undefined) {
      out.fields[field] = message;
    }
  }
  return out;
}

/**
 * What a form says above its fields after `e`: the API's message when it put nothing on a field, else the messages
 * no field shows, or null when every message is on a field.
 */
export function unplacedMessage<K extends string>(e: unknown, placed: PlacedErrors<K>): string | null {
  if (!e) return null;
  if (!Object.keys(placed.fields).length) return errorMessage(e);
  return placed.other.join(' ') || null;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** A 404 because the feature is switched off for this person. */
export function isFeatureOff(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'feature_off';
}

/** The request never reached the API (offline, DNS, the server down behind the proxy). */
export const NETWORK_MESSAGE = 'Couldn’t reach the Hub. Check your connection and try again.';
/** The browser says there is no connection: an action can't go through, and only kept pages show (api/offline.ts). */
export const OFFLINE_ACTION_MESSAGE = 'You’re offline, so this didn’t go through. Try again once you’re back online.';
export const OFFLINE_LOAD_MESSAGE =
  'You’re offline and this wasn’t kept from your last visit. It loads once you’re back online.';

const browserOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** The API failed, or the app did: not something the person can fix by checking their Wi-Fi (UX review UX-10). */
export const SERVER_MESSAGE = 'Something went wrong on our side. Try again in a minute.';

/** True when the request never got an answer, so the connection is the likely cause. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'network';
}

/**
 * A message fit to show a person after an action failed, whatever was thrown: the API's own message (it says what
 * to do: "Try another title."), the connection message when there was no answer, and `fallback` for anything else
 * (a bug of ours: its text is not for people). The one helper for every area (code quality review CQ-5).
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.code === 'network') return browserOffline() ? OFFLINE_ACTION_MESSAGE : NETWORK_MESSAGE;
  if (e.code === 'internal') return SERVER_MESSAGE;
  return e.message || fallback;
}

/**
 * What to say under "… didn't load" (UX-10): blame the connection only when there was no answer. A refusal the
 * person can act on (403, 404, 429) keeps the API's message; a server failure or a bug of ours says so.
 */
export function loadProblem(e: unknown): string {
  if (!(e instanceof ApiError)) return SERVER_MESSAGE;
  if (e.code === 'network') return browserOffline() ? OFFLINE_LOAD_MESSAGE : NETWORK_MESSAGE;
  if (e.status >= 500 || e.code === 'internal' || e.code === 'error' || !e.message) return SERVER_MESSAGE;
  return e.message;
}
