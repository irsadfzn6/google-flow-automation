#!/usr/bin/env node

/**
 * flow-mcp - Stdio Model Context Protocol (MCP) server for Google Flow CLI
 */

const { runMcpServer } = require("../src/mcp");

runMcpServer().catch((err) => {
  console.error("Fatal MCP Server Error:", err);
  process.exit(1);
});
