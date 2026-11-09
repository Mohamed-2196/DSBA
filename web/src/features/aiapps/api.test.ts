import { describe, expect, it } from 'vitest';
import { mcpAddress, safeReturn } from './api';

describe('safeReturn', () => {
  it('lets the student go back to a web page or an app', () => {
    expect(safeReturn('https://claude.ai/api/mcp/auth_callback?code=x&state=y')).toBe(true);
    expect(safeReturn('http://localhost:6274/oauth/callback?code=x')).toBe(true);
    expect(safeReturn('com.cursor.app:/oauth/callback?code=x')).toBe(true);
  });

  it('never runs an address as script on the Hub', () => {
    expect(safeReturn('javascript:alert(document.domain)//?error=access_denied')).toBe(false);
    expect(safeReturn('JavaScript:alert(1)')).toBe(false);
    expect(safeReturn(' javascript:alert(1)')).toBe(false);
    expect(safeReturn('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(safeReturn('vbscript:msgbox(1)')).toBe(false);
    expect(safeReturn('not a url')).toBe(false);
  });
});

describe('mcpAddress', () => {
  it('is this origin’s /api/mcp', () => {
    expect(mcpAddress('https://hub.example')).toBe('https://hub.example/api/mcp');
  });
});
