/**
 * index.js - Main entry point and library exports for google-flow-cli
 */

const FlowClient = require("./client");
const dom = require("./dom");
const config = require("./config");
const mcp = require("./mcp");

module.exports = {
  FlowClient,
  ...dom,
  ...config,
  ...mcp,

  // Convenience helper functions
  createClient: (options) => new FlowClient(options),
  initProject: (dir, options) => config.scaffoldConfig(dir, options),
  runScene: async (sceneConfig, clientOptions) => {
    const client = new FlowClient(clientOptions);
    try {
      return await client.runScene(sceneConfig);
    } finally {
      await client.disconnect();
    }
  },
  runProject: async (options, clientOptions) => {
    const client = new FlowClient(clientOptions);
    try {
      return await client.runProject(options);
    } finally {
      await client.disconnect();
    }
  }
};
