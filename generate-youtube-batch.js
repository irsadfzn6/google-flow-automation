/**
 * generate-youtube-batch.js - Batch Video & Image Generator for YouTube Project
 * Integrates Google Flow automation with 'roma-runtuh' prompts & characters
 */

const fs = require("fs");
const path = require("path");
const FlowClient = require("./src/client");

// Default paths
const DEFAULT_PROJECT_DIR = path.resolve("C:/Users/Dragon/Documents/proyek yt/roma-runtuh");
const PROMPTS_FILE = path.join(DEFAULT_PROJECT_DIR, "prompts-siap-pakai.md");

/**
 * Parses prompts-siap-pakai.md into structured shot objects
 */
function parsePromptsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompts file not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  const shots = [];
  let currentAdegan = null;
  let currentShot = null;
  let inCodeBlock = false;
  let promptLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");

    // Match Adegan heading (e.g. ## Adegan 1 – Hook)
    const adeganMatch = line.match(/^##\s+Adegan\s+(\d+)/i);
    if (adeganMatch) {
      currentAdegan = parseInt(adeganMatch[1], 10);
    }

    // Match Shot heading (e.g. ### Shot 001 [🖼️ GAMBAR - F: zoom in])
    const shotMatch = line.match(/^###\s+Shot\s+(\d+)\s+\[([^\]]+)\]/i);
    if (shotMatch) {
      if (currentShot) {
        currentShot.prompt = promptLines.join("\n").trim();
        shots.push(currentShot);
        promptLines = [];
        inCodeBlock = false;
      }

      const shotNum = parseInt(shotMatch[1], 10);
      const tagStr = shotMatch[2];
      const isVideo = tagStr.toUpperCase().includes("VIDEO");
      const isImage = tagStr.toUpperCase().includes("GAMBAR");

      currentShot = {
        number: shotNum,
        shotId: `shot_${String(shotNum).padStart(3, "0")}`,
        adegan: currentAdegan || 1,
        rawTag: tagStr,
        mediaType: isVideo ? "video" : "image",
        model: isVideo ? "Veo 3.1 - Fast" : "Nano Banana 2.1",
        duration: isVideo ? "4s" : undefined,
        aspect: "16:9",
        narasi: "",
        charRefRaw: "",
        characters: [],
        prompt: ""
      };
      continue;
    }

    if (!currentShot) continue;

    // Match Narasi
    const narasiMatch = line.match(/^\s*-\s*\*\*Narasi:\*\*\s*(.*)$/i);
    if (narasiMatch) {
      currentShot.narasi = narasiMatch[1].replace(/^["']|["']$/g, "").trim();
      continue;
    }

    // Match Karakter Referensi
    const refMatch = line.match(/^\s*-\s*\*\*📌 Referensi Karakter:\*\*\s*`?([^`\n]+)`?/i);
    if (refMatch) {
      const rawRef = refMatch[1].trim();
      currentShot.charRefRaw = rawRef;

      // Extract character names: rakyat, kaisar, prajurit, barbar, jenderal, remaja
      const chars = [];
      const known = ["rakyat", "kaisar", "prajurit", "barbar", "jenderal", "remaja"];
      const lowerRef = rawRef.toLowerCase();

      if (!lowerRef.includes("tanpa karakter")) {
        for (const k of known) {
          if (lowerRef.includes(k)) {
            chars.push(k);
          }
        }
      }
      currentShot.characters = chars;
      continue;
    }

    // Match code block for prompt
    if (line.trim().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        promptLines = [];
      } else {
        inCodeBlock = false;
        currentShot.prompt = promptLines.join("\n").trim();
      }
      continue;
    }

    if (inCodeBlock) {
      promptLines.push(line);
    }
  }

  // Push last shot
  if (currentShot) {
    if (!currentShot.prompt && promptLines.length > 0) {
      currentShot.prompt = promptLines.join("\n").trim();
    }
    shots.push(currentShot);
  }

  return shots;
}

/**
 * CLI Argument parser
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    adegan: null,
    shot: null,
    shots: null,
    dryRun: false,
    list: false,
    delay: 2000,
    projectDir: DEFAULT_PROJECT_DIR
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--adegan" && args[i + 1]) {
      options.adegan = parseInt(args[++i], 10);
    } else if (arg === "--shot" && args[i + 1]) {
      options.shot = parseInt(args[++i], 10);
    } else if (arg === "--shots" && args[i + 1]) {
      options.shots = args[++i]; // e.g. "1-5" or "1,2,3"
    } else if (arg === "--dry-run" || arg === "-d") {
      options.dryRun = true;
    } else if (arg === "--list" || arg === "-l") {
      options.list = true;
    } else if (arg === "--delay" && args[i + 1]) {
      options.delay = parseInt(args[++i], 10);
    } else if (arg === "--project-dir" && args[i + 1]) {
      options.projectDir = path.resolve(args[++i]);
    }
  }
  return options;
}

/**
 * Filter shots based on CLI options
 */
function filterShots(allShots, options) {
  let filtered = [...allShots];

  if (options.adegan !== null) {
    filtered = filtered.filter((s) => s.adegan === options.adegan);
  }

  if (options.shot !== null) {
    filtered = filtered.filter((s) => s.number === options.shot);
  }

  if (options.shots) {
    if (options.shots.includes("-")) {
      const [start, end] = options.shots.split("-").map((n) => parseInt(n.trim(), 10));
      filtered = filtered.filter((s) => s.number >= start && s.number <= end);
    } else if (options.shots.includes(",")) {
      const shotNums = options.shots.split(",").map((n) => parseInt(n.trim(), 10));
      filtered = filtered.filter((s) => shotNums.includes(s.number));
    } else {
      const num = parseInt(options.shots, 10);
      filtered = filtered.filter((s) => s.number === num);
    }
  }

  return filtered;
}

async function main() {
  const options = parseArgs();
  const promptsPath = path.join(options.projectDir, "prompts-siap-pakai.md");

  console.log(`[YouTube Batch] Membaca file prompts: ${promptsPath}`);
  const allShots = parsePromptsFile(promptsPath);
  console.log(`[YouTube Batch] Berhasil mem-parsing total ${allShots.length} shot dari file prompts.\n`);

  const shotsToRun = filterShots(allShots, options);

  if (shotsToRun.length === 0) {
    console.log("Tidak ada shot yang sesuai dengan kriteria filter.");
    process.exit(0);
  }

  if (options.list || options.dryRun) {
    console.log(`=== DAFTAR SHOT YANG AKAN DIPROSES (${shotsToRun.length} SHOT) ===`);
    shotsToRun.forEach((s) => {
      const charStr = s.characters.length > 0 ? s.characters.join(", ") : "Tanpa Karakter";
      console.log(`- [Shot ${String(s.number).padStart(3, "0")}] Adegan ${s.adegan} | ${s.mediaType.toUpperCase()} | Karakter: [${charStr}]`);
      console.log(`  Narasi: "${s.narasi}"`);
      console.log(`  Model: ${s.model} (${s.aspect}${s.duration ? ", " + s.duration : ""})`);
      console.log(`  Prompt: ${s.prompt.substring(0, 100)}...`);
      console.log();
    });

    if (options.dryRun) {
      console.log("[Dry Run Selesai] Mode simulasi aktif, tidak ada generasi yang dikirim ke Google Flow.");
      process.exit(0);
    }
  }

  // Connect to Google Flow
  console.log(`[YouTube Batch] Menghubungkan ke Google Flow (CDP Port 9222)...`);
  const client = new FlowClient({ port: 9222 });
  const page = await client.connect();

  console.log(`[YouTube Batch] Memulai pemrosesan ${shotsToRun.length} shot...\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < shotsToRun.length; i++) {
    const s = shotsToRun[i];
    const shotIdStr = String(s.number).padStart(3, "0");
    const targetDir = path.join(options.projectDir, "visual", `adegan${s.adegan}`);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = s.mediaType === "video" ? "mp4" : "png";
    const outputFile = path.join(targetDir, `shot_${shotIdStr}.${ext}`);

    console.log(`------------------------------------------------------------`);
    console.log(`[Proses ${i + 1}/${shotsToRun.length}] Shot ${shotIdStr} (Adegan ${s.adegan}) - ${s.mediaType.toUpperCase()}`);
    console.log(`- Narasi   : "${s.narasi}"`);
    console.log(`- Karakter : ${s.characters.length > 0 ? s.characters.join(", ") : "None"}`);
    console.log(`- Target   : ${outputFile}`);

    try {
      const res = await client.runScene({
        mediaType: s.mediaType,
        model: s.model,
        aspect: s.aspect,
        duration: s.duration,
        ingredients: s.characters,
        clearIngredients: true,
        prompt: s.prompt,
        generate: true,
        wait: true,
        timeout: 300,
        output: outputFile
      });

      console.log(`[BERHASIL] Shot ${shotIdStr} selesai digenerate dan didownload!`);
      if (res.download) {
        console.log(`  File: ${res.download.path} (${res.download.size} bytes)`);
      }
      successCount++;
    } catch (err) {
      console.error(`[GAGAL] Shot ${shotIdStr} error: ${err.message}`);
      failCount++;
    }

    if (i < shotsToRun.length - 1 && options.delay > 0) {
      console.log(`Menunggu jeda ${options.delay}ms sebelum shot berikutnya...`);
      await page.waitForTimeout(options.delay);
    }
  }

  console.log(`\n============================================================`);
  console.log(`[YouTube Batch Selesai] Total: ${shotsToRun.length} | Berhasil: ${successCount} | Gagal: ${failCount}`);
  console.log(`============================================================`);

  await client.disconnect();
}

main().catch((err) => {
  console.error("[Fatal Error]", err);
  process.exit(1);
});
