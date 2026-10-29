/**
 * generate-assistant.js - Autonomous executor for Google Flow (Video & Image)
 */

const path = require("path");
const fs = require("fs");
const FlowClient = require("./src/client");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    type: "video",      // 'video' | 'image'
    prompt: "",
    model: null,
    aspect: null,       // '16:9', '9:16', '1:1'
    duration: "8s",
    resolution: "720p",
    ingredients: null,  // comma-separated character names or paths
    outputDir: path.resolve(__dirname, "../outputs")
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--type" && args[i + 1]) {
      options.type = args[++i].toLowerCase();
    } else if (arg === "--prompt" && args[i + 1]) {
      options.prompt = args[++i];
    } else if (arg === "--model" && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === "--aspect" && args[i + 1]) {
      options.aspect = args[++i];
    } else if (arg === "--duration" && args[i + 1]) {
      options.duration = args[++i];
    } else if (arg === "--resolution" && args[i + 1]) {
      options.resolution = args[++i];
    } else if ((arg === "--ingredients" || arg === "--ingredient") && args[i + 1]) {
      options.ingredients = args[++i];
    } else if (arg === "--outputDir" && args[i + 1]) {
      options.outputDir = path.resolve(args[++i]);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs();

  if (!options.prompt) {
    console.error(JSON.stringify({ error: "MISSING_PROMPT", message: "Parameter --prompt harus diisi." }));
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  const client = new FlowClient({ port: 9222 });

  try {
    const page = await client.connect();

    // Check auth status
    const currentUrl = page.url();
    if (currentUrl.includes("/about")) {
      const isLoginVisible = await page.evaluate(() => {
        return !!document.querySelector("a[href*='ServiceLogin'], a[href*='signin']") ||
          Array.from(document.querySelectorAll("button, a")).some(el => el.innerText && el.innerText.trim() === "Sign in");
      });
      if (isLoginVisible) {
        console.log(JSON.stringify({
          status: "NEED_LOGIN",
          message: "Jendela Chrome Google Flow terbuka, namun akun Google Anda belum login. Silakan klik 'Sign in' di jendela Chrome terlebih dahulu."
        }, null, 2));
        process.exit(0);
      }
    }

    // Ensure we are inside a project
    if (!page.url().includes("/project/")) {
      console.log("[Assistant] Memeriksa daftar project di Google Flow...");
      const projects = await client.listProjects();
      if (projects && projects.length > 0) {
        console.log(`[Assistant] Membuka project '${projects[0].title}' (${projects[0].id})...`);
        await client.openProject(projects[0].id);
      } else {
        console.log("[Assistant] Membuat project baru 'AI Studio'...");
        await client.createProject({ title: "AI Studio" });
      }
      await page.waitForTimeout(2000);
    }

    // Prepare target download file
    const isImage = options.type === "image";
    const defaultModel = isImage ? "Nano Banana Pro" : "Veo 3.1 - Fast";
    const defaultAspect = isImage ? (options.aspect || "1:1") : (options.aspect || "16:9");
    const timestamp = Date.now();
    const ext = isImage ? "png" : "mp4";
    const targetFile = path.join(options.outputDir, `${options.type}_${timestamp}.${ext}`);

    console.log(`[Assistant] Menjalankan scene: Type=${options.type}, Model=${options.model || defaultModel}, Aspect=${defaultAspect}, Ingredients=${options.ingredients || 'none'}...`);
    console.log(`[Assistant] Prompt: "${options.prompt}"`);

    const result = await client.runScene({
      mediaType: isImage ? "image" : "video",
      model: options.model || defaultModel,
      aspect: defaultAspect,
      duration: isImage ? undefined : options.duration,
      resolution: isImage ? undefined : options.resolution,
      ingredients: options.ingredients,
      prompt: options.prompt,
      generate: true,
      wait: true,
      timeout: 300,
      output: targetFile
    });

    console.log(JSON.stringify({
      status: "SUCCESS",
      type: options.type,
      prompt: options.prompt,
      download: result.download,
      video: result.video,
      message: `Generasi ${options.type} berhasil diselesaikan!`
    }, null, 2));

  } catch (err) {
    console.error(JSON.stringify({
      status: "ERROR",
      error: err.message
    }, null, 2));
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

main();
