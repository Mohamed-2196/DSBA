// Public API of the AI apps feature: apps like Claude reading the Hub as the student, through its MCP server.
// Other features import from here only.
//   <ConnectedApps />    Your account's "AI apps": the connected apps (each removable) and how to add one
//   mcpAddress()         the address a student pastes into their AI app (this origin + /api/mcp)
export { ConnectedApps } from './ConnectedApps';
export { mcpAddress } from './api';
