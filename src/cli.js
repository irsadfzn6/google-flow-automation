/**
 * cli.js - Command-line interface handler for google-flow-cli
 */

const path = require("path");
const readline = require("readline");
const FlowClient = require("./client");
const configHelper = require("./config");
const dom = require("./dom");

function promptConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function parseArgs(args) {
  const parsed = { _: [], options: {} };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const rawKey = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        parsed.options[key] = val;
        parsed.options[rawKey] = val;
      } else {
        const rawKey = arg.slice(2);
        const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          parsed.options[key] = next;
          parsed.options[rawKey] = next;
          i++;
        } else {
          parsed.options[key] = true;
          parsed.options[rawKey] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const flagMap = {
        "-s": "start",
        "-e": "end",
        "-p": "prompt",
        "-o": "output",
        "-w": "wait",
        "-t": "timeout",
        "-r": "resolution",
        "-d": "duration",
        "-a": "aspect",
        "-m": "mode",
        "-M": "model",
        "-B": "batches",
        "-f": "force",
        "-j": "json",
        "-h": "help"
      };
      const key = flagMap[arg] || arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        parsed.options[key] = next;
        i++;
      } else {
        parsed.options[key] = true;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

function showHelp() {
  console.log(`
google-flow-cli (flow) - Universal Google Flow Video Generation CLI

USAGE:
  flow <command> [subcommand] [flags]

COMMANDS:
  init                     Scaffold a new flow.json project configuration
  project list             List all user projects (alias: ls, flow projects)
  project create [title]   Create a new project on Google Flow and switch to it
  project switch <id>      Switch active browser tab to project by ID (alias: open, nav)
  project delete [id]      Delete a project by ID or current project (--force to bypass)
  doctor                   Run full environment, Chrome CDP, and auth diagnostics
  status                   Inspect active project state, settings, frames, and prompt
  config                   Set generation media type, model, resolution, duration, aspect, or mode
  scene                    Configure keyframes, prompt, and trigger scene generation
  run                      Execute declarative scene pipeline from flow.json
  videos list              List all generated videos and signed CDN URLs
  videos download-latest   Download the newest generated video
  launch                   Launch Google Chrome with persistent profile on CDP port 9222

OPTIONS / FLAGS:
  --project <id>           Target or bind a specific Google Flow project ID
  --new                    Create a fresh Google Flow project automatically
  --media <type>           Media generation type: video or image
  -M, --model <name>       Generation model:
                             Video: 'Omni 1.1 Flash', 'Veo 3.1 - Fast', 'Veo 3.1 - Lite', 'Veo 3.1 - Quality'
                             Image: 'Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite'
  -s, --start <path>       Path to Start keyframe image
  -e, --end <path>         Path to End keyframe image
  -p, --prompt <text>      Motion graphic / image prompt text
  -o, --output <path>      Output file path for generated MP4 video or PNG image
  -r, --resolution <res>   Resolution: 720p or 360p (video only)
  -d, --duration <dur>     Duration: 4s, 6s, 8s, or 10s (video only)
  -a, --aspect <ratio>     Aspect ratio: 9:16, 16:9 (video/image); 1:1, 4:3, 3:4 (image only)
  -m, --mode <mode>        Generation mode: Frames (start/end) or Ingredients
  -B, --batch <multiplier> Batch count: x1, x2, x3, or x4
  -w, --wait               Wait for generation to complete (default: true for run)
  -t, --timeout <sec>      Timeout in seconds (default: 300)
  --dry-run                Validate and preview pipeline without triggering live generation
  --scene <name>           Run only a specific scene from flow.json
  -f, --force              Force overwrite existing files or bypass confirmation
  -j, --json               Output raw JSON for machine composition
  -h, --help               Show this help message

EXAMPLES:
  # List all projects
  flow project list
  flow projects --json

  # Create a new project and bind to flow.json
  flow project create "Product Launch Video"

  # Switch to an existing project
  flow project switch 547683bf-5c5e-4ad3-8943-d2df0a4575c5

  # Delete a project
  flow project delete <id> --force

  # Initialize a new config bound to a newly created project
  flow init --new --name "My Project"

  # Check active connection, model, and project status
  flow doctor
  flow status

  # Configure video model and parameters
  flow config --media video -M "Veo 3.1 - Fast" -r 720p -d 8s -a 9:16 -m Frames

  # Configure image model for static keyframe creation
  flow config --media image -M "Nano Banana Pro" -a 9:16

  # Generate a single scene with keyframes
  flow scene -s start.png -e end.png -p "Swiss kinetic animation" --generate -o scene_01.mp4

  # Run pipeline declared in flow.json
  flow run --dry-run
  flow run --scene scene_01
`);
}

async function runCli(argv = process.argv.slice(2)) {
  const { _, options } = parseArgs(argv);
  const command = _[0] || (options.help ? "help" : "status");
  const subcommand = _[1];

  if (command === "help" || options.help) {
    showHelp();
    return;
  }

  const client = new FlowClient({
    port: options.port || 9222,
    autoLaunch: options.autoLaunch !== false,
    profileDir: options.profileDir || null
  });

  try {
    switch (command) {
      case "init": {
        const targetDir = _[1] || process.cwd();
        let projectId = options.project || options.projectId || null;
        let projectUrl = null;
        let projectTitle = options.title || null;

        if (options.new) {
          console.log("Creating new Google Flow project for initialization...");
          const newProj = await client.createProject({ title: options.name || options.title });
          projectId = newProj.id;
          projectUrl = newProj.url;
          projectTitle = newProj.title;
          console.log(`Created project ${projectId} (${projectTitle})`);
        } else if (projectId) {
          projectUrl = `https://flow.google.com/project/${projectId}`;
        }

        const res = configHelper.scaffoldConfig(targetDir, {
          name: options.name,
          template: options.template,
          force: options.force,
          projectId,
          projectUrl,
          title: projectTitle
        });

        if (options.json) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log(`Successfully initialized Google Flow project configuration at: ${res.path}`);
          if (projectId) {
            console.log(`Bound to project ID: ${projectId}`);
          }
        }
        break;
      }

      case "projects":
      case "project": {
        const action = (command === "projects" && !subcommand) ? "list" : (subcommand || "list");

        switch (action) {
          case "list":
          case "ls": {
            const projects = await client.listProjects();
            if (options.json) {
              console.log(JSON.stringify(projects, null, 2));
            } else {
              console.log(`\nGoogle Flow Projects (${projects.length} total):\n`);
              console.log(
                "  #".padEnd(5) +
                "PROJECT ID".padEnd(40) +
                "TITLE".padEnd(30) +
                "URL"
              );
              console.log("  " + "-".repeat(110));
              projects.forEach((p, idx) => {
                const num = String(idx + 1).padStart(2);
                const id = (p.id || "").padEnd(38);
                const title = (p.title || "Untitled").slice(0, 28).padEnd(28);
                console.log(`  ${num}  ${id}  ${title}  ${p.url}`);
              });
              console.log(`\nUse 'flow project switch <id>' to switch to a project.`);
            }
            break;
          }

          case "create": {
            const titleArg = _[2] || options.title || options.name;
            const res = await client.createProject({ title: titleArg });
            const configUpdated = configHelper.updateProjectConfig(res.id, res.url, res.title);

            if (options.json) {
              console.log(JSON.stringify({ ...res, flowJsonUpdated: !!configUpdated }, null, 2));
            } else {
              console.log("\nCreated new Google Flow project:");
              console.log(`  Project ID:   ${res.id}`);
              console.log(`  Title:        ${res.title}`);
              console.log(`  URL:          ${res.url}`);
              if (configUpdated) {
                console.log(`  Configuration: Updated ${configUpdated.path}`);
              }
            }
            break;
          }

          case "switch":
          case "open":
          case "nav": {
            const targetId = _[2] || options.id || options.project || options.projectId;
            if (!targetId) {
              throw new Error("Project ID is required. Usage: flow project switch <id>");
            }
            const res = await client.switchProject(targetId);
            const configUpdated = configHelper.updateProjectConfig(res.id, res.url, res.title);

            if (options.json) {
              console.log(JSON.stringify({ ...res, flowJsonUpdated: !!configUpdated }, null, 2));
            } else {
              console.log("\nSwitched active Google Flow project:");
              console.log(`  Project ID:   ${res.id}`);
              if (res.title) console.log(`  Title:        ${res.title}`);
              console.log(`  URL:          ${res.url}`);
              if (configUpdated) {
                console.log(`  Configuration: Updated ${configUpdated.path}`);
              }
            }
            break;
          }

          case "delete": {
            const targetId = _[2] || options.id || options.project || options.projectId || null;
            if (!options.force && !options.f) {
              const promptMsg = targetId
                ? `Are you sure you want to delete project ${targetId}? [y/N]: `
                : "Are you sure you want to delete the currently active project? [y/N]: ";
              const confirmed = await promptConfirm(promptMsg);
              if (!confirmed) {
                console.log("Deletion cancelled.");
                break;
              }
            }

            const res = await client.deleteProject(targetId, options);
            if (options.json) {
              console.log(JSON.stringify(res, null, 2));
            } else {
              console.log(`\nSuccessfully deleted Google Flow project: ${res.id}`);
            }
            break;
          }

          default:
            console.error(`Unknown project subcommand: ${action}`);
            console.log("Available subcommands: list (ls), create, switch (open), delete");
            process.exit(1);
        }
        break;
      }

      case "doctor": {
        const report = await client.doctor();
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log("\n=== Google Flow Doctor Diagnostics ===");
          console.log(`Node.js Version:      ${report.nodeVersion}`);
          console.log(`Operating System:    ${report.platform}`);
          console.log(`Playwright:          ${report.playwright ? "OK (Discovered)" : "FAILED (Not found)"}`);
          console.log(`Chrome Binary:       ${report.chromeBinary || "Not found"}`);
          console.log(`CDP Port 9222:       ${report.cdpOpen ? "OPEN & ACCEPTING CONNECTIONS" : "CLOSED"}`);
          console.log(`Google Auth Status:  ${report.googleAuthenticated ? "AUTHENTICATED & READY" : "NOT AUTHENTICATED / NO TAB"}`);
          console.log(`Active URL:          ${report.activeUrl || "None"}`);
          console.log(`Active Project ID:   ${report.projectId || "None"}`);
          if (report.errors.length > 0) {
            console.log("\nIssues Detected:");
            report.errors.forEach((e) => console.log(`  - ${e}`));
          }
        }
        break;
      }

      case "status": {
        const status = await client.status();
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else if (status.isDashboard) {
          console.log("\n=== Google Flow Dashboard Status ===");
          console.log(`URL:                ${status.url}`);
          console.log(`Active Canvas:      Dashboard / Home (No project open)`);
          console.log(`Detected Projects:  ${status.dashboardProjectsCount} project cards`);
          console.log("\nQuick Actions:");
          console.log("  flow project list              # View all available projects");
          console.log("  flow project create [title]    # Create and switch to a new project");
          console.log("  flow project switch <id>       # Open a specific project");
        } else {
          console.log("\n=== Active Google Flow Project Status ===");
          console.log(`Title:            ${status.projectTitle || "Untitled"}`);
          console.log(`Project ID:       ${status.projectId || "None"}`);
          console.log(`URL:              ${status.url}`);
          console.log(`Settings:         ${status.settingsSummary || "Defaults"}`);
          console.log(`Media Type:       ${status.mediaType || "video"}`);
          console.log(`Start Keyframe:   ${status.startFrame.set ? "SET" : "EMPTY"}`);
          console.log(`End Keyframe:     ${status.endFrame.set ? "SET" : "EMPTY"}`);
          console.log(`Prompt:           ${status.promptText ? `"${status.promptText.slice(0, 80)}..."` : "EMPTY"}`);
          console.log(`Can Generate:     ${status.canGenerate ? "YES" : "NO (Waiting for frames/prompt)"}`);
          console.log(`Generating Now:   ${status.hasSpinner ? "YES (Spinner Active)" : "NO"}`);
          console.log(`Project Videos:   ${status.videoCount} video tiles detected`);
        }
        break;
      }

      case "config": {
        const updated = await client.configure({
          mediaType: options.mediaType || options.media,
          model: options.model || options.M,
          resolution: options.resolution || options.r,
          duration: options.duration || options.d,
          aspect: options.aspect || options.a,
          mode: options.mode || options.m,
          batches: options.batches || options.batch || options.B
        });
        if (options.json) {
          console.log(JSON.stringify({ configured: updated }, null, 2));
        } else {
          console.log(`Configured options: ${updated.join(", ")}`);
        }
        break;
      }

      case "scene": {
        const res = await client.runScene({
          mediaType: options.mediaType || options.media,
          model: options.model || options.M,
          start: options.start,
          end: options.end,
          prompt: options.prompt,
          resolution: options.resolution || options.r,
          duration: options.duration || options.d,
          aspect: options.aspect || options.a,
          mode: options.mode || options.m,
          batches: options.batches || options.batch || options.B,
          generate: options.generate || !!options.output,
          wait: options.wait !== false,
          timeout: parseInt(options.timeout || "300", 10),
          output: options.output
        });
        if (options.json) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log("Scene execution finished successfully.");
          if (res.video) console.log(`Video URL: ${res.video.url}`);
          if (res.download) console.log(`Saved output: ${res.download.path} (${res.download.size} bytes)`);
        }
        break;
      }

      case "run": {
        const res = await client.runProject({
          configPath: options.config,
          scene: options.scene,
          dryRun: options.dryRun
        });
        if (options.json) {
          console.log(JSON.stringify(res, null, 2));
        } else if (res.dryRun) {
          console.log("\n[DRY RUN] Preview of execution plan for:", res.project);
          res.scenesToExecute.forEach((s, idx) => {
            console.log(`\n  ${idx + 1}. Scene: [${s.name}]`);
            console.log(`     Start:     ${s.start || "(None)"}`);
            console.log(`     End:       ${s.end || "(None)"}`);
            console.log(`     Prompt:    ${s.prompt.slice(0, 65)}...`);
            console.log(`     Output:    ${s.output}`);
            console.log(`     Settings:  ${s.resolution} | ${s.duration} | ${s.aspect} | ${s.mode}`);
          });
          console.log("\nRun without --dry-run to execute live generation.");
        } else {
          console.log(`Pipeline finished. Executed ${res.executed.length} scenes.`);
        }
        break;
      }

      case "videos": {
        if (subcommand === "download-latest") {
          const outputPath = options.output || options.o || "./latest_flow_video.mp4";
          const res = await client.downloadLatest(outputPath);
          if (options.json) {
            console.log(JSON.stringify(res, null, 2));
          } else {
            console.log(`Downloaded latest video (${res.size} bytes) to: ${res.path}`);
          }
        } else {
          const videos = await client.getVideos();
          if (options.json) {
            console.log(JSON.stringify(videos, null, 2));
          } else {
            console.log(`\nDiscovered ${videos.length} videos in project:`);
            videos.forEach((v, idx) => {
              const label = (typeof v.tileIndex === "number" && !isNaN(v.tileIndex)) ? v.tileIndex + 1 : idx + 1;
              console.log(`\n[Video #${label}]`);
              console.log(`  Source: ${v.url.substring(0, 95)}...`);
              console.log(`  Google CDN: ${v.isGoogleCdn ? "YES" : "NO"} (Signed: ${v.hasSignature ? "YES" : "NO"})`);
            });
          }
        }
        break;
      }

      case "launch": {
        const launched = await dom.launchChrome(options.port || 9222, options.profileDir);
        if (options.json) {
          console.log(JSON.stringify({ launched }, null, 2));
        } else {
          console.log(launched ? "Chrome launched and CDP port 9222 is active." : "Failed to launch Chrome.");
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error(`\nError: ${err.message}`);
    }
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

module.exports = { runCli, parseArgs };
