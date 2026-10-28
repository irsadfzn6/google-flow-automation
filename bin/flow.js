#!/usr/bin/env node

/**
 * flow - Executable binary for google-flow-cli
 */

const { runCli } = require("../src/cli");

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
