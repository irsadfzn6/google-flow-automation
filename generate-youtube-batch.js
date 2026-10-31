/**
 * batch.js - Autonomous Batch Video & Image Generator for YouTube (Long & Shorts)
 * Integrates Google Flow automation via Chrome CDP (port 9222).
 * Enforces strictly 1 variation (x1) and 4-second video clips to prevent credit waste.
 */

const fs = require("fs");
const path = require("path");

// Dynamic resolver for FlowClient
const FlowClient = fs.existsSync(path.join(__dirname, "client.js"))
  ? require("./client")
  : (fs.existsSync(path.join(__dirname, "src", "client.js"))
    ? require("./src/client")
    : require(path.join(__dirname, "..", "..", "engine", "flow", "client")));

/**
 * Parses prompts-siap-pakai.md into structured shot objects
 */
function parsePromptsFile(filePath, defaultAspect = "16:9") {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompts file not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const isVerticalProject = /9:16|vertical|shorts|portrait/i.test(content);
  const projectAspect = isVerticalProject ? "9:16" : defaultAspect;

  const lines = content.split("\n");
  const shots = [];
  let currentAdegan = 1;
  let currentShot = null;
  let inCodeBlock = false;
  let promptLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");

    // Match Adegan heading (e.g. ## Adegan 1 – Hook)
    const adeganMatch = line.match(/^##+\s+Adegan\s+(\d+)/i);
    if (adeganMatch) {
      currentAdegan = parseInt(adeganMatch[1], 10);
    }

    // Match Shot heading (e.g. ### Shot 001 [🖼️ GAMBAR] or ### Shot 001 | Video)
    const shotMatch = line.match(/^###\s+Shot\s+(\d+)(?:\s+\[([^\]]+)\]|\s*\|\s*([^|\n]+))?/i);
    if (shotMatch) {
      if (currentShot) {
        currentShot.prompt = promptLines.join("\n").trim();
        shots.push(currentShot);
        promptLines = [];
        inCodeBlock = false;
      }

      const shotNum = parseInt(shotMatch[1], 10);
      const tagStr = (shotMatch[2] || shotMatch[3] || "").trim();
      const isVideo = tagStr.toUpperCase().includes("VIDEO") || tagStr.toUpperCase().includes("GERAK");
      const isShotVertical = tagStr.includes("9:16") || isVerticalProject;

      currentShot = {
        number: shotNum,
        shotId: `shot_${String(shotNum).padStart(3, "0")}`,
        adegan: currentAdegan || 1,
        rawTag: tagStr,
        mediaType: isVideo ? "video" : "image",
        model: isVideo ? "Omni 1.1 Flash" : "Nano Banana 2.1",
        duration: isVideo ? "4s" : undefined,
        aspect: isShotVertical ? "9:16" : "16:9",
        batches: "x1", // ALWAYS 1 variation only
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
    if (line.includes("Referensi Karakter") || line.includes("Reference Image") || line.includes("karakter acuan")) {
      const parts = line.split(/(?:Referensi Karakter|Reference Image|Karakter Acuan)[:* ]+/i);
      if (parts.length > 1) {
        const rawRef = parts[1].replace(/[*`\r\n]/g, "").trim();
        currentShot.charRefRaw = rawRef;
        const chars = [];
        const lowerRef = rawRef.toLowerCase();
        if (!lowerRef.includes("tanpa karakter") && !lowerRef.includes("tidak memerlukan")) {
          const fileMatches = rawRef.match(/([a-zA-Z0-9_\-]+(?:\.png)?)/g) || [];
          const ignoreWords = [
            "unggah", "sebagai", "image", "reference", "di", "flow", "dan", "atau",
            "tidak", "memerlukan", "referensi", "karakter", "khusus", "fokus",
            "lingkungan", "bencana", "visual"
          ];
          for (const m of fileMatches) {
            const clean = m.toLowerCase().replace(/\.png$/, "");
            if (!ignoreWords.includes(clean) && clean.length > 2 && !chars.includes(clean)) {
              chars.push(clean);
            }
          }
        }
        currentShot.characters = chars;
        continue;
      }
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
  const rawArgs = process.argv.slice(2);
  const options = {
    adegan: null,
    shot: null,
    shots: null,
    dryRun: false,
    list: false,
    delay: 2000,
    projectDir: process.cwd(),
    overwrite: false,
    aspect: null
  };

  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--adegan" && rawArgs[i + 1]) {
      options.adegan = parseInt(rawArgs[++i], 10);
    } else if (arg === "--shot" && rawArgs[i + 1]) {
      options.shot = parseInt(rawArgs[++i], 10);
    } else if (arg === "--shots" && rawArgs[i + 1]) {
      options.shots = rawArgs[++i];
    } else if (arg === "--aspect" && rawArgs[i + 1]) {
      options.aspect = rawArgs[++i];
    } else if (arg === "--dry-run" || arg === "-d") {
      options.dryRun = true;
    } else if (arg === "--list" || arg === "-l") {
      options.list = true;
    } else if (arg === "--overwrite" || arg === "-f") {
      options.overwrite = true;
    } else if (arg === "--delay" && rawArgs[i + 1]) {
      options.delay = parseInt(rawArgs[++i], 10);
    } else if (arg === "--project-dir" && rawArgs[i + 1]) {
      options.projectDir = path.resolve(rawArgs[++i]);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    options.projectDir = path.resolve(positional[0]);
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

  console.log(`[Flow Batch] Mengakses direktori proyek: ${options.projectDir}`);
  console.log(`[Flow Batch] Membaca file prompts: ${promptsPath}`);

  if (!fs.existsSync(promptsPath)) {
    console.error(`[Error] File prompts-siap-pakai.md tidak ditemukan di: ${promptsPath}`);
    process.exit(1);
  }

  const allShots = parsePromptsFile(promptsPath, options.aspect || "16:9");
  console.log(`[Flow Batch] Berhasil mem-parsing total ${allShots.length} shot.\n`);

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
      console.log(`  Model: ${s.model} (${s.aspect}${s.duration ? ", " + s.duration : ""}) | Variasi: 1 (x1)`);
      console.log(`  Prompt: ${s.prompt.substring(0, 100)}...`);
      console.log();
    });

    if (options.dryRun) {
      console.log("[Dry Run Selesai] Mode simulasi aktif, tidak ada generasi yang dikirim ke Google Flow.");
      process.exit(0);
    }
  }

  // Connect to Google Flow
  console.log(`[Flow Batch] Menghubungkan ke Google Flow (CDP Port 9222)...`);
  const client = new FlowClient({ port: 9222 });
  const page = await client.connect();

  console.log(`[Flow Batch] Memulai pemrosesan ${shotsToRun.length} shot (Strict: 1 variasi x1 per shot)...\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < shotsToRun.length; i++) {
    const s = shotsToRun[i];
    const shotIdStr = String(s.number).padStart(3, "0");

    // Check directory layout: either visual/adeganX or visual/shots or remotion/public/shots
    let targetDir = path.join(options.projectDir, "visual", `adegan${s.adegan}`);
    if (s.aspect === "9:16" && fs.existsSync(path.join(options.projectDir, "remotion", "public", "shots"))) {
      targetDir = path.join(options.projectDir, "remotion", "public", "shots");
    } else if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = s.mediaType === "video" ? "mp4" : "png";
    const outputFile = path.join(targetDir, `shot_${shotIdStr}.${ext}`);

    if (!options.overwrite && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 10000) {
      console.log(`[SKIP] Shot ${shotIdStr} sudah ada: ${outputFile} (${(fs.statSync(outputFile).size / 1024).toFixed(1)} KB)`);
      successCount++;
      continue;
    }

    console.log(`------------------------------------------------------------`);
    console.log(`[Proses ${i + 1}/${shotsToRun.length}] Shot ${shotIdStr} (Adegan ${s.adegan}) - ${s.mediaType.toUpperCase()}`);
    console.log(`- Narasi   : "${s.narasi}"`);
    console.log(`- Model    : ${s.model} | Aspek: ${s.aspect} | Variasi: 1 (x1) | Durasi: ${s.duration || "N/A"}`);
    console.log(`- Karakter : ${s.characters.length > 0 ? s.characters.join(", ") : "None"}`);
    console.log(`- Target   : ${outputFile}`);

    try {
      const res = await client.runScene({
        mediaType: s.mediaType,
        model: s.model,
        aspect: options.aspect || s.aspect,
        duration: s.duration || (s.mediaType === "video" ? "4s" : undefined),
        batches: "x1", // Strictly 1 variation to save credits and time
        ingredients: s.characters.map((c) => {
          const pPng = path.join(options.projectDir, "visual", "karakter", c.endsWith(".png") ? c : `${c}.png`);
          return fs.existsSync(pPng) ? pPng : c;
        }),
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

      // Fallback: If video generation failed due to credit exhaustion, fall back to Nano Banana 2.1 static image
      if (s.mediaType === "video" && (err.message.includes("poin") || err.message.includes("credit") || err.message.includes("quota"))) {
        console.log(`[FALLBACK] Kuota video habis! Beralih otomatis ke GAMBAR STATIS Nano Banana 2.1 (0 kredit)...`);
        try {
          const fallbackOutputFile = path.join(targetDir, `shot_${shotIdStr}.png`);
          const fbRes = await client.runScene({
            mediaType: "image",
            model: "Nano Banana 2.1",
            aspect: options.aspect || s.aspect,
            batches: "x1",
            ingredients: s.characters.map((c) => {
              const pPng = path.join(options.projectDir, "visual", "karakter", c.endsWith(".png") ? c : `${c}.png`);
              return fs.existsSync(pPng) ? pPng : c;
            }),
            clearIngredients: true,
            prompt: s.prompt,
            generate: true,
            wait: true,
            timeout: 300,
            output: fallbackOutputFile
          });
          console.log(`[FALLBACK BERHASIL] Shot ${shotIdStr} digenerate sebagai gambar: ${fallbackOutputFile}`);
          successCount++;
        } catch (fbErr) {
          console.error(`[FALLBACK GAGAL] ${fbErr.message}`);
          failCount++;
        }
      } else {
        failCount++;
      }
    }

    if (i < shotsToRun.length - 1 && options.delay > 0) {
      console.log(`Menunggu jeda ${options.delay}ms sebelum shot berikutnya...`);
      await page.waitForTimeout(options.delay);
    }
  }

  console.log(`\n============================================================`);
  console.log(`[Flow Batch Selesai] Total: ${shotsToRun.length} | Berhasil: ${successCount} | Gagal: ${failCount}`);
  console.log(`============================================================`);

  await client.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[Fatal Error] ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parsePromptsFile,
  filterShots,
  main
};
