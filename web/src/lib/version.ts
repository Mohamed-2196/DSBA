/**
 * A build's version as people read it: a commit's first seven characters, as GitHub shows them, or the version as it
 * is ('dev' for a build that doesn't know its commit). The build's own version is __APP_VERSION__ (vite.config.ts).
 */
export function shortVersion(version: string): string {
  return /^[0-9a-f]{7,40}$/i.test(version) ? version.slice(0, 7).toLowerCase() : version;
}
