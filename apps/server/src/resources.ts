/** Release binaries extract embedded assets and name the directory here; read once, then hidden from MCP Server processes. */
export const resourceDir = process.env["STUDIO_RESOURCE_DIR"] || undefined;
delete process.env["STUDIO_RESOURCE_DIR"];
