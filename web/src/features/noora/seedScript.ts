/// <reference types="node" />
// For the tests only (the app never imports this): her script as the API starts with it
// (api/app/seed/data/noora.json), read from the repository when a test runs, so the tests check the words she ships
// with rather than a copy of them.
import { readFileSync } from 'node:fs';
import type { NooraScript } from '../../api/types';

export function seedScript(): NooraScript {
  const doc = JSON.parse(readFileSync(new URL('../../../../api/app/seed/data/noora.json', import.meta.url), 'utf8')) as { script: NooraScript };
  return doc.script;
}
