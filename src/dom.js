/**
 * dom.js - Google Flow DOM automation and Chrome CDP connection primitives
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const http = require("http");

/**
 * Dynamically resolves Playwright without hardcoded paths or strict dependency constraints.
 */
function getPlaywright() {
  // 1. Standard module resolution (local project node_modules)
  try {
    return require("playwright");
  } catch (e1) {}

  // 2. Custom environment override
  if (process.env.PLAYWRIGHT_PATH) {
    try {
      return require(process.env.PLAYWRIGHT_PATH);
    } catch (e2) {}
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [];

  // 3. Global npm root
  try {
    const globalNpm = execSync("npm root -g", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000
    }).trim();
    if (globalNpm) candidates.push(path.join(globalNpm, "playwright"));
  } catch (e3) {}

  // 4. Node Version Manager (NVM) environments
  const nvmDir = path.join(homeDir, ".nvm/versions/node");
  if (fs.existsSync(nvmDir)) {
    try {
      const versions = fs.readdirSync(nvmDir);
      for (const v of versions) {
        candidates.push(path.join(nvmDir, v, "lib/node_modules/playwright"));
      }
    } catch (e4) {}
  }

  // 5. Cross-platform system and package manager locations
  candidates.push(
    "/usr/lib/node_modules/playwright",
    "/usr/local/lib/node_modules/playwright",
    path.join(homeDir, ".npm-global/lib/node_modules/playwright"),
    path.join(homeDir, "AppData/Roaming/npm/node_modules/playwright")
  );

  for (const cand of candidates) {
    if (cand && fs.existsSync(cand)) {
      try {
        return require(cand);
      } catch (err) {}
    }
  }

  throw new Error(
    "Playwright is not installed or discoverable.\n" +
    "Install it in your project via: npm install playwright\n" +
    "Or globally: npm install -g playwright\n" +
    "Or set PLAYWRIGHT_PATH=/path/to/playwright"
  );
}

/**
 * Checks if a given CDP port is accepting HTTP connections.
 */
function checkCdpPort(port = 9222) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Detects the Google Chrome executable across Linux, macOS, and Windows.
 */
function findChromeBinary() {
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";

  const candidates = isWindows ? [
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env["LocalAppData"] || "", "Google\\Chrome\\Application\\chrome.exe")
  ] : isMac ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    path.join(process.env.HOME || "", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
  ] : [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/opt/google/chrome/chrome",
    "/snap/bin/chromium"
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return isWindows ? "chrome.exe" : "google-chrome";
}

/**
 * Spawns Google Chrome with remote debugging enabled and a persistent profile.
 */
async function launchChrome(port = 9222, profileDir = null) {
  const chromeBin = findChromeBinary();
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const defaultDir = path.join(homeDir, ".config/google-chrome-flow");
  const targetDir = profileDir || defaultDir;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${targetDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "https://flow.google.com"
  ];

  if (process.platform === "win32") {
    const fullCmd = `"${chromeBin}" ${args.join(" ")}`;
    try {
      execSync(`powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = '${fullCmd.replace(/'/g, "''")}'}"`, { stdio: "ignore" });
    } catch (e) {}
  }
  const child = spawn(chromeBin, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  // Poll until CDP port answers
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkCdpPort(port)) return true;
  }
  return false;
}

/**
 * Safely dismisses active Angular CDK overlays and backdrops using Escape.
 */
async function dismissOverlays(page) {
  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  } catch (e) {}
}

/**
 * Connects to Google Chrome over CDP and returns the active Google Flow tab.
 */
async function getFlowSession(cdpUrl = "http://127.0.0.1:9222", autoLaunch = true) {
  const { chromium } = getPlaywright();
  const urlObj = new URL(cdpUrl);
  const port = parseInt(urlObj.port || "9222", 10);

  let isPortOpen = await checkCdpPort(port);
  if (!isPortOpen && autoLaunch) {
    const launched = await launchChrome(port);
    if (!launched) {
      throw new Error(`Chrome failed to launch or open CDP port on ${port}.`);
    }
  }

  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error("Connected to Chrome via CDP, but no browser contexts were found.");
  }

  const context = contexts[0];
  const allPages = context.pages();
  let page = allPages.find((p) => p.url().includes("flow.google.com/project/")) ||
             allPages.find((p) => p.url().includes("flow.google.com"));

  if (!page) {
    page = await context.newPage();
    await page.goto("https://flow.google.com", { waitUntil: "domcontentloaded" });
  }

  return { browser, context, page };
}

/**
 * Injects text cleanly into Google Flow's ProseMirror editor.
 */
async function setPrompt(page, promptText) {
  await dismissOverlays(page);
  const editor = await page.$(".ProseMirror");
  if (!editor) throw new Error("ProseMirror prompt editor not found in DOM");

  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  if (promptText && promptText.length > 0) {
    await page.keyboard.type(promptText, { delay: 4 });
  }
  return true;
}

/**
 * Uploads a local image or selects an asset for Start or End keyframe.
 */
async function setKeyframe(page, type, { filePath, index }) {
  await dismissOverlays(page);

  // Click keyframe chip
  let chipSelector = type === "start"
    ? "button.empty-chip:has-text('Start'), [aria-label*='Start frame'], flow-prompt-chip:has-text('Start')"
    : "button.empty-chip:has-text('End'), [aria-label*='End frame'], flow-prompt-chip:has-text('End')";

  let chip = await page.$(chipSelector);
  if (!chip) {
    const chips = await page.$$("button.empty-chip, flow-prompt-chip, .prompt-chip");
    for (const c of chips) {
      const text = await c.innerText();
      if (type === "start" && text.includes("Start")) { chip = c; break; }
      if (type === "end" && text.includes("End")) { chip = c; break; }
    }
  }

  if (!chip) throw new Error(`Could not find ${type} frame trigger chip.`);
  await chip.click();
  await page.waitForTimeout(600);

  if (filePath) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) throw new Error(`Keyframe file not found: ${absPath}`);

    const uploadBtn = await page.$(
      ".cdk-overlay-pane button:has-text('Upload media'), " +
      ".cdk-overlay-pane button:has-text('Upload'), " +
      "button[aria-label*='Upload']"
    );

    if (!uploadBtn) {
      await dismissOverlays(page);
      throw new Error("Upload media button not found in overlay popover.");
    }

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      uploadBtn.click()
    ]);

    await fileChooser.setFiles(absPath);
    await page.waitForTimeout(2800);

    const assetItem = await page.$(".cdk-overlay-pane .asset-item, .asset-list-item");
    if (assetItem) {
      await assetItem.click();
      await page.waitForTimeout(400);
    }
  } else if (typeof index === "number") {
    const assetItems = await page.$$(".cdk-overlay-pane .asset-item, .asset-list-item");
    if (index >= assetItems.length) {
      await dismissOverlays(page);
      throw new Error(`Asset index ${index} out of range (found ${assetItems.length} assets).`);
    }
    await assetItems[index].click();
    await page.waitForTimeout(400);
  }

  // Explicit confirmation button click
  const addBtn = await page.$(
    ".cdk-overlay-pane button.detail-add-to-prompt-btn, " +
    ".cdk-overlay-pane button:has-text('Add to prompt'), " +
    ".cdk-overlay-pane button:has-text('Select frame')"
  );
  if (addBtn) {
    await addBtn.click();
    await page.waitForTimeout(400);
  }

  await dismissOverlays(page);
  return true;
}

/**
 * Scans video elements and virtual-scroll tiles, returning signed Cloud CDN URLs.
 */
async function getVideos(page) {
  // Trigger virtual-scroll lazy mounting
  const tiles = await page.$$("flow-video-tile, .video-tile, cdk-virtual-scroll-viewport flow-video-tile");
  for (let i = 0; i < Math.min(tiles.length, 12); i++) {
    try {
      await tiles[i].hover();
      await page.waitForTimeout(80);
    } catch (e) {}
  }

  return await page.evaluate(() => {
    const videoEls = Array.from(document.querySelectorAll("video"));
    const tilesList = Array.from(document.querySelectorAll("flow-video-tile, .video-tile"));

    const results = [];
    const seen = new Set();

    videoEls.forEach((v, idx) => {
      const src = v.src || v.currentSrc;
      if (src && !seen.has(src)) {
        seen.add(src);
        results.push({
          index: idx,
          url: src,
          isGoogleCdn: src.includes("flow-content.google"),
          hasSignature: src.includes("Signature="),
          videoWidth: v.videoWidth || null,
          videoHeight: v.videoHeight || null,
          duration: v.duration || null
        });
      }
    });

    tilesList.forEach((t, tIdx) => {
      const v = t.querySelector("video");
      const src = v ? (v.src || v.currentSrc) : null;
      if (src && !seen.has(src)) {
        seen.add(src);
        results.push({
          tileIndex: tIdx,
          url: src,
          isGoogleCdn: src.includes("flow-content.google"),
          hasSignature: src.includes("Signature=")
        });
      }
    });

    return results;
  });
}

/**
 * Downloads a video from a signed Cloud CDN URL or Playwright browser download.
 */
async function downloadUrl(page, videoUrl, outputPath) {
  const absOut = path.resolve(outputPath);
  const outDir = path.dirname(absOut);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Use direct curl if signed Cloud CDN URL
  if (videoUrl.includes("flow-content.google") || videoUrl.includes("Signature=")) {
    execSync(`curl -s -L -o "${absOut}" "${videoUrl}"`, { timeout: 60000 });
  } else {
    // Fallback download via browser fetch
    const response = await page.request.get(videoUrl);
    fs.writeFileSync(absOut, await response.body());
  }

  const stat = fs.statSync(absOut);
  return { path: absOut, size: stat.size };
}

/**
 * Normalizes model names and user aliases into exact Google Flow menu item text.
 */
function normalizeModelName(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().trim().replace(/_/g, "-");

  // Video Models
  if (s.includes("omni") || s === "flash") return "Omni 1.1 Flash";
  if (s.includes("lite") && (s.includes("veo") || s.startsWith("veo"))) return "Veo 3.1 - Lite";
  if (s.includes("fast") && (s.includes("veo") || s.startsWith("veo"))) return "Veo 3.1 - Fast";
  if ((s.includes("quality") || s.includes("pro")) && (s.includes("veo") || s.startsWith("veo"))) return "Veo 3.1 - Quality";
  if (s === "veo" || s === "veo-3.1" || s === "veo3.1") return "Veo 3.1 - Fast";

  // Image Models
  if (s.includes("pro") && (s.includes("banana") || s.includes("imagen") || s.includes("image"))) return "Nano Banana Pro";
  if (s.includes("lite") && (s.includes("banana") || s.includes("imagen") || s.includes("image"))) return "Nano Banana 2 Lite";
  if (s.includes("banana") || s.includes("imagen") || s === "image-default") return "Nano Banana 2.1";

  // Fallback to verbatim
  return raw;
}

/**
 * Selects a generation model (Omni 1.1 Flash, Veo 3.1 - Fast/Lite/Quality, Nano Banana Pro/Lite/2.1)
 */
async function selectModel(page, modelName) {
  const target = normalizeModelName(modelName);
  if (!target) return null;

  const modelTrigger = await page.$(
    ".cdk-overlay-pane button[aria-label='Select model family'], " +
    ".cdk-overlay-pane button.mat-mdc-menu-trigger"
  );
  if (!modelTrigger) throw new Error("Model selector dropdown button not found in settings overlay.");

  await modelTrigger.click();
  await page.waitForTimeout(400);

  const option = await page.$(
    `.cdk-overlay-pane button[role='menuitem']:has-text('${target}'), ` +
    `.cdk-overlay-pane .mat-mdc-menu-item:has-text('${target}')`
  );

  if (!option) {
    await page.keyboard.press("Escape");
    throw new Error(`Model option '${target}' not found in model menu.`);
  }

  await option.click();
  await page.waitForTimeout(350);
  return target;
}

/**
 * Configures all Google Flow settings: media type, mode, model, aspect ratio, resolution, duration, batch.
 */
async function configureSettings(page, config = {}) {
  await dismissOverlays(page);

  const settingsBtn = await page.$(
    "button[aria-label='Settings trigger'], button.settings-trigger-button, button[aria-label*='Settings'], button[aria-label*='Setelan'], button[aria-label*='Pengaturan']"
  );
  if (!settingsBtn) throw new Error("Settings trigger button not found on page.");

  await settingsBtn.click();
  await page.waitForTimeout(500);

  const applied = [];

  // 1. Media Type: Video vs Image
  if (config.mediaType || config.media) {
    const media = (config.mediaType || config.media).toLowerCase();
    const targetLabel = media.includes("image") ? "Image" : "Video";
    const altLabel = media.includes("image") ? "Gambar" : "Video";
    const mediaToggle = await page.$(`.cdk-overlay-pane mat-button-toggle:has-text('${targetLabel}') button, .cdk-overlay-pane mat-button-toggle:has-text('${altLabel}') button`);
    if (mediaToggle) {
      await mediaToggle.click();
      applied.push(`media:${targetLabel}`);
      await page.waitForTimeout(400);
    }
  }

  // 2. Mode: Frames vs Ingredients
  if (config.mode) {
    const modeToggle = await page.$(`.cdk-overlay-pane mat-button-toggle:has-text('${config.mode}') button`);
    if (modeToggle) {
      await modeToggle.click();
      applied.push(`mode:${config.mode}`);
      await page.waitForTimeout(250);
    }
  }

  // 3. Aspect Ratio: 9:16, 16:9, 1:1, 4:3, 3:4
  if (config.aspect) {
    const aspectToggle = await page.$(`.cdk-overlay-pane mat-button-toggle:has-text('${config.aspect}') button`);
    if (aspectToggle) {
      await aspectToggle.click();
      applied.push(`aspect:${config.aspect}`);
      await page.waitForTimeout(250);
    }
  }

  // 4. Model Selection (Omni 1.1 Flash, Veo 3.1, Nano Banana)
  if (config.model) {
    const chosenModel = await selectModel(page, config.model);
    if (chosenModel) applied.push(`model:${chosenModel}`);
  }

  // 5. Resolution: 720p, 360p (video only)
  if (config.resolution) {
    const resToggle = await page.$(`.cdk-overlay-pane mat-button-toggle:has-text('${config.resolution}') button`);
    if (resToggle) {
      await resToggle.click();
      applied.push(`resolution:${config.resolution}`);
      await page.waitForTimeout(250);
    }
  }

  // 6. Duration: 4s, 6s, 8s, 10s (video only)
  if (config.duration) {
    const durToggle = await page.$(`.cdk-overlay-pane mat-button-toggle:has-text('${config.duration}') button`);
    if (durToggle) {
      await durToggle.click();
      applied.push(`duration:${config.duration}`);
      await page.waitForTimeout(250);
    }
  }

  // 7. Multiplier / Batches: x1, x2, x3, x4
  if (config.batches || config.batch) {
    const batchVal = config.batches || config.batch;
    const batchToggle = await page.$(`.cdk-overlay-pane mat-button-toggle:has-text('${batchVal}') button`);
    if (batchToggle) {
      await batchToggle.click();
      applied.push(`batch:${batchVal}`);
      await page.waitForTimeout(250);
    }
  }

  await dismissOverlays(page);
  return applied;
}

/**
 * Lists all user projects from Google Flow home dashboard.
 */
async function listProjects(page) {
  await dismissOverlays(page);
  const currentUrl = page.url();
  if (!currentUrl.startsWith("https://flow.google.com/") || currentUrl.includes("/project/")) {
    const homeBtn = await page.$("button[aria-label='Home'], button.back-button");
    if (homeBtn) {
      await homeBtn.click();
      await page.waitForURL("https://flow.google.com/", { timeout: 10000 });
    } else {
      await page.goto("https://flow.google.com/", { waitUntil: "domcontentloaded" });
    }
  }

  // Wait for projects grid to load (or fallback if user has no projects)
  try {
    await page.waitForSelector(".projects-grid-item", { timeout: 8000 });
  } catch (e) {
    await page.waitForSelector("button.new-project-button", { timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(500);

  const projects = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".projects-grid-item"));
    const seen = new Set();
    const result = [];

    for (const item of items) {
      const link = item.querySelector("a.project-thumbnail-container, a[href*='/project/']");
      const href = link ? link.getAttribute("href") : "";
      const match = href.match(/\/project\/([a-zA-Z0-9_\-]+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      seen.add(id);

      const titleEl = item.querySelector(".project-title-label");
      let title = "";
      if (titleEl) {
        const clone = titleEl.cloneNode(true);
        Array.from(clone.querySelectorAll("button, mat-icon")).forEach((b) => b.remove());
        title = clone.innerText.trim();
      }

      const img = item.querySelector("img.project-thumbnail");
      const thumbnail = img ? img.src : null;

      result.push({
        id,
        title: title || "Untitled Project",
        url: `https://flow.google.com/project/${id}`,
        thumbnail
      });
    }
    return result;
  });

  return projects;
}

/**
 * Creates a new project in Google Flow and waits for navigation to the project canvas.
 */
async function createProject(page, options = {}) {
  await dismissOverlays(page);
  const currentUrl = page.url();
  if (currentUrl.includes("/project/")) {
    const homeBtn = await page.$("button[aria-label='Home'], button.back-button");
    if (homeBtn) {
      await homeBtn.click();
      await page.waitForURL("https://flow.google.com/", { timeout: 10000 });
    } else {
      await page.goto("https://flow.google.com/", { waitUntil: "domcontentloaded" });
    }
  }

  const newBtnSelector = "button.new-project-button, button:has-text('New project'), button:has-text('Project baru'), button:has-text('Proyek baru')";
  await page.waitForSelector(newBtnSelector, { timeout: 15000 });
  const newBtn = await page.$(newBtnSelector);
  if (!newBtn) throw new Error("Could not find 'New project' button on Google Flow dashboard.");

  await newBtn.click();
  await page.waitForURL(/\/project\/[a-f0-9\-]+/, { timeout: 20000 });

  const newUrl = page.url();
  const match = newUrl.match(/\/project\/([a-f0-9\-]+)/);
  const newProjectId = match ? match[1] : null;

  // Wait for canvas / header UI to be ready
  await page.waitForSelector(".header-left-container, flow-navigation-header, .ProseMirror", { timeout: 15000 });
  await page.waitForTimeout(500);

  let finalTitle = null;
  const desiredTitle = typeof options === "string" ? options : options.title;

  if (desiredTitle) {
    try {
      const titleSpan = await page.$(".header-title");
      if (titleSpan) {
        await titleSpan.click();
        await page.waitForTimeout(300);
        await page.keyboard.press("Control+A");
        await page.keyboard.type(desiredTitle, { delay: 10 });
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
        finalTitle = desiredTitle;
      }
    } catch (e) {}
  }

  if (!finalTitle) {
    const titleSpan = await page.$(".header-title");
    finalTitle = titleSpan ? (await titleSpan.innerText()).trim() : "Untitled";
  }

  return {
    id: newProjectId,
    title: finalTitle,
    url: newUrl
  };
}

/**
 * Navigates to a specific Google Flow project by ID.
 */
async function openProject(page, projectId) {
  if (!projectId) throw new Error("Project ID is required to open a project.");
  const targetUrl = `https://flow.google.com/project/${projectId}`;

  if (page.url() !== targetUrl) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  }

  await page.waitForSelector(".header-left-container, flow-navigation-header, .ProseMirror", { timeout: 15000 });
  await dismissOverlays(page);

  const titleEl = await page.$(".header-title");
  const title = titleEl ? (await titleEl.innerText()).trim() : null;

  return {
    id: projectId,
    title,
    url: page.url()
  };
}

/**
 * Deletes a Google Flow project either by ID from the dashboard or the currently active project.
 */
async function deleteProject(page, projectId = null, options = {}) {
  await dismissOverlays(page);

  let targetId = projectId;
  if (!targetId) {
    const currentUrl = page.url();
    const match = currentUrl.match(/\/project\/([a-f0-9\-]+)/);
    if (match) {
      targetId = match[1];
    } else {
      throw new Error("No project ID specified and currently not on a project page.");
    }
  }

  // If currently inside the target project, delete via project header menu
  const currentUrl = page.url();
  if (currentUrl.includes(`/project/${targetId}`)) {
    const moreBtn = await page.$("button[aria-label='More options for the project']");
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(500);

      const menuItems = await page.$$(".mat-mdc-menu-content button, [role='menuitem']");
      let deleteItem = null;
      for (const item of menuItems) {
        const text = await item.innerText();
        if (text.includes("Delete") && !text.toLowerCase().includes("trash")) {
          deleteItem = item;
          break;
        }
      }

      if (deleteItem) {
        await deleteItem.click();
        await page.waitForSelector("mat-dialog-container button:has-text('Delete project')", { timeout: 10000 });
        const confirmBtn = await page.$("mat-dialog-container button:has-text('Delete project')");
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForURL((url) => !url.href.includes(targetId), { timeout: 15000 });
          await page.waitForTimeout(1000);
          return { success: true, id: targetId };
        }
      }
    }
  }

  // Otherwise, navigate to dashboard and delete from project card
  if (!currentUrl.startsWith("https://flow.google.com/") || currentUrl.includes("/project/")) {
    const homeBtn = await page.$("button[aria-label='Home'], button.back-button");
    if (homeBtn) {
      await homeBtn.click();
      await page.waitForURL("https://flow.google.com/", { timeout: 10000 });
    } else {
      await page.goto("https://flow.google.com/", { waitUntil: "domcontentloaded" });
    }
  }

  await page.waitForSelector(".projects-grid-item", { timeout: 15000 });
  const cardSelector = `.projects-grid-item:has(a[href*='${targetId}'])`;
  const card = await page.$(cardSelector);
  if (!card) {
    throw new Error(`Project with ID ${targetId} was not found on the dashboard.`);
  }

  const deleteBtn = await card.$("button[aria-label='Delete project']");
  if (!deleteBtn) {
    throw new Error(`Delete button for project ${targetId} was not found.`);
  }

  await deleteBtn.click();
  await page.waitForSelector("mat-dialog-container button:has-text('Delete project')", { timeout: 10000 });
  const confirmBtn = await page.$("mat-dialog-container button:has-text('Delete project')");
  if (!confirmBtn) {
    throw new Error("Confirmation button 'Delete project' not found in dialog.");
  }

  await confirmBtn.click();
  await page.waitForTimeout(1200);

  return { success: true, id: targetId };
}

module.exports = {
  getPlaywright,
  checkCdpPort,
  findChromeBinary,
  launchChrome,
  dismissOverlays,
  getFlowSession,
  setPrompt,
  setKeyframe,
  getVideos,
  downloadUrl,
  normalizeModelName,
  selectModel,
  configureSettings,
  listProjects,
  createProject,
  openProject,
  deleteProject
};
