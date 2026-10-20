/** The token in a reset link's fragment ('#token=…'), or null when it is missing or can't be one. */
export function readResetToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}
