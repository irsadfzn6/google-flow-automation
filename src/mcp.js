/**
 * mcp.js - Lightweight, zero-external-dependency Model Context Protocol (MCP) server
 * for Google Flow CLI automation over stdio JSON-RPC 2.0.
 */

const readline = require("readline");
const FlowClient = require("./client");
const configHelper = require("./config");

let sharedClient = null;

function getClient(options = {}) {
  if (!sharedClient) {
    sharedClient = new FlowClient(options);
  }
  return sharedClient;
}

const MCP_TOOLS = [
  {
    name: "flow_session_status",
    description: "Checks Google Flow connection, CDP port status, project ID, auth status, and active settings.",
    inputSchema: {
      type: "object",
      properties: {
        port: {
          type: "number",
          description: "Chrome CDP remote debugging port (default: 9222)"
        }
      }
    }
  },
  {
    name: "flow_generate_video",
    description: "Generates video via Veo 3.1 or Omni 1.1 Flash (supports Text-to-Video and Frames-to-Video with start/end frames).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Video motion and scene prompt text"
        },
        model: {
          type: "string",
          enum: ["Veo 3.1 - Fast", "Veo 3.1 - Lite", "Veo 3.1 - Quality", "Omni 1.1 Flash"],
          description: "Video generation model (default: Veo 3.1 - Fast)"
        },
        start_frame: {
          type: "string",
          description: "Absolute file path to Start keyframe image (for Frames-to-Video)"
        },
        end_frame: {
          type: "string",
          description: "Absolute file path to End keyframe image (for Frames-to-Video)"
        },
        resolution: {
          type: "string",
          enum: ["720p", "360p"],
          description: "Video resolution (default: 720p)"
        },
        duration: {
          type: "string",
          enum: ["4s", "6s", "8s", "10s"],
          description: "Video duration (default: 8s)"
        },
        aspect: {
          type: "string",
          enum: ["9:16", "16:9"],
          description: "Video aspect ratio (default: 9:16)"
        },
        mode: {
          type: "string",
          enum: ["Frames", "Ingredients"],
          description: "Generation mode: Frames (start/end) or Ingredients (default: Frames)"
        },
        batches: {
          type: "string",
          enum: ["x1", "x2", "x3", "x4"],
          description: "Batch multiplier: x1, x2, x3, or x4 (default: x1)"
        },
        clear_frames: {
          type: "boolean",
          description: "Explicitly clear existing Start/End keyframe chips before generation"
        },
        output: {
          type: "string",
          description: "Local output path to download the generated video MP4 directly"
        },
        wait: {
          type: "boolean",
          description: "Wait and poll for generation to complete (default: true)"
        },
        timeout: {
          type: "number",
          description: "Generation timeout in seconds (default: 300)"
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "flow_generate_image",
    description: "Generates static keyframes via Nano Banana models.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Image composition, subject, and style prompt text"
        },
        model: {
          type: "string",
          enum: ["Nano Banana Pro", "Nano Banana 2.1", "Nano Banana 2 Lite"],
          description: "Image generation model (default: Nano Banana Pro)"
        },
        aspect: {
          type: "string",
          enum: ["9:16", "16:9", "1:1", "4:3", "3:4"],
          description: "Image aspect ratio: 9:16, 16:9, 1:1, 4:3, or 3:4 (default: 9:16)"
        },
        batches: {
          type: "string",
          enum: ["x1", "x2", "x3", "x4"],
          description: "Batch multiplier: x1, x2, x3, or x4 (default: x1)"
        },
        output: {
          type: "string",
          description: "Local output path to download the generated image"
        },
        wait: {
          type: "boolean",
          description: "Wait for generation to complete (default: true)"
        },
        timeout: {
          type: "number",
          description: "Generation timeout in seconds (default: 180)"
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "flow_list_projects",
    description: "Lists all user projects on Google Flow.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "flow_switch_project",
    description: "Switches active project canvas in Chrome.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "UUID of the Google Flow project to open and switch to"
        }
      },
      required: ["project_id"]
    }
  },
  {
    name: "flow_run_pipeline",
    description: "Executes or dry-runs flow.json pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        config_path: {
          type: "string",
          description: "Path to flow.json file (defaults to auto-discovering flow.json in cwd or parents)"
        },
        scene: {
          type: "string",
          description: "Optional specific scene name to execute from flow.json"
        },
        dry_run: {
          type: "boolean",
          description: "Validate and preview execution plan without triggering live generation (default: false)"
        }
      }
    }
  }
];

async function handleToolCall(name, args = {}) {
  const client = getClient({ port: args.port });

  switch (name) {
    case "flow_session_status": {
      const doctor = await client.doctor();
      let status = null;
      if (doctor.cdpOpen && doctor.googleAuthenticated) {
        try {
          status = await client.status();
        } catch (e) {
          status = { error: e.message };
        }
      }
      return { doctor, status };
    }

    case "flow_generate_video": {
      if (args.clear_frames) {
        try {
          await client.clearFrames();
        } catch (e) {}
      }
      return await client.runScene({
        mediaType: "video",
        model: args.model || "Veo 3.1 - Fast",
        resolution: args.resolution || "720p",
        duration: args.duration || "8s",
        aspect: args.aspect || "9:16",
        mode: args.mode || "Frames",
        batches: args.batches || "x1",
        start: args.start_frame || args.start,
        end: args.end_frame || args.end,
        prompt: args.prompt,
        generate: true,
        wait: args.wait !== false,
        timeout: args.timeout || 300,
        output: args.output
      });
    }

    case "flow_generate_image": {
      return await client.runScene({
        mediaType: "image",
        model: args.model || "Nano Banana Pro",
        aspect: args.aspect || "9:16",
        batches: args.batches || "x1",
        prompt: args.prompt,
        generate: true,
        wait: args.wait !== false,
        timeout: args.timeout || 180,
        output: args.output
      });
    }

    case "flow_list_projects": {
      return await client.listProjects();
    }

    case "flow_switch_project": {
      const projectId = args.project_id || args.projectId || args.id;
      if (!projectId) {
        throw new Error("project_id argument is required");
      }
      const res = await client.switchProject(projectId);
      const configUpdated = configHelper.updateProjectConfig(res.id, res.url, res.title);
      return { project: res, flowJsonUpdated: !!configUpdated };
    }

    case "flow_run_pipeline": {
      return await client.runProject({
        configPath: args.config_path || args.configPath,
        scene: args.scene,
        dryRun: !!args.dry_run || !!args.dryRun
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRpcMessage(msg) {
  if (!msg || typeof msg !== "object") return null;

  // JSON-RPC Notification: no response needed
  if (msg.id === undefined || msg.id === null) {
    return null;
  }

  const { id, method, params } = msg;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "google-flow-mcp",
          version: "1.0.0"
        }
      }
    };
  }

  if (method === "ping") {
    return {
      jsonrpc: "2.0",
      id,
      result: {}
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: MCP_TOOLS
      }
    };
  }

  if (method === "tools/call") {
    const toolName = params && params.name;
    const toolArgs = (params && params.arguments) || {};
    try {
      const output = await handleToolCall(toolName, toolArgs);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: typeof output === "string" ? output : JSON.stringify(output, null, 2)
            }
          ],
          isError: false
        }
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `Error executing ${toolName}: ${err.message}`
            }
          ],
          isError: true
        }
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    }
  };
}

async function runMcpServer(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;

  const rl = readline.createInterface({
    input,
    terminal: false
  });

  let queue = Promise.resolve();

  const writeMessage = (msg) => {
    output.write(JSON.stringify(msg) + "\n");
  };

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    queue = queue.then(async () => {
      let req;
      try {
        req = JSON.parse(trimmed);
      } catch (err) {
        writeMessage({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` }
        });
        return;
      }

      try {
        const res = await handleRpcMessage(req);
        if (res) {
          writeMessage(res);
        }
      } catch (err) {
        if (req.id !== undefined && req.id !== null) {
          writeMessage({
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32603, message: `Internal error: ${err.message}` }
          });
        }
      }
    });
  });

  return new Promise((resolve) => {
    rl.on("close", async () => {
      await queue;
      if (sharedClient) {
        try {
          await sharedClient.disconnect();
        } catch (e) {}
      }
      process.exit(0);
    });
  });
}

module.exports = {
  runMcpServer,
  handleRpcMessage,
  handleToolCall,
  MCP_TOOLS
};
