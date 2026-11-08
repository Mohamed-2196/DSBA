"""AI apps reading the Hub as a student, through the Hub's MCP server (Model Context Protocol).

- store.py: the apps that registered, students' connections, codes and tokens, and the per-student call limit.
- oauth.py: the OAuth 2.1 authorization server the MCP SDK serves (dynamic registration, PKCE, refresh, revoke);
  the student says yes on the Hub's own page (consent.py, routers/ai_apps.py) while signed in with its cookie.
- tools.py: what an app may ask: search, a file and its words, a page's words with its citation, a tagged question,
  the modules. Each reuses the services the site's routers use, with the same visibility rules.
- server.py: the MCP server, its routes under /api/mcp and the two /.well-known addresses discovery needs.

The rules: an app needs a student's token for everything (an unsigned call gets 401, less than a guest gets on the
site); tokens are read-only (scope hub:read), short-lived, and gone when the student removes the app in Settings or
the mcp switch is off for them; nothing an app asks is stored or logged, only each call's time, for the limit; and
every answer links back to its page in the Hub."""
