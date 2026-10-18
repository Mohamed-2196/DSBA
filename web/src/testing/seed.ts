/// <reference types="node" />
// For tests only (the app never imports this): the API's starting content (api/app/seed/data/<name>.json), read from
// the repository when a test runs, so tests check what the hub ships with rather than a copy of it.
import { readFileSync } from 'node:fs';

export function readSeed<T>(name: 'grades' | 'noora' | 'site'): T {
  return JSON.parse(readFileSync(new URL(`../../../api/app/seed/data/${name}.json`, import.meta.url), 'utf8')) as T;
}
