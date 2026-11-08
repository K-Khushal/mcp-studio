# One HTTP transport: Streamable HTTP with legacy SSE fallback

MCP Studio exposes a single "HTTP" transport. It tries Streamable HTTP (MCP spec 2025-03-26+) first and falls back to the deprecated HTTP+SSE transport if the server rejects it, so users never choose between them. The negotiated variant is surfaced in the UI.
