/**
 * client.js - Programmatic Node.js FlowClient for Google Flow automation
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const dom = require("./dom");
const configHelper = require("./config");

class FlowClient {
  constructor(options = {}) {
    this.cdpUrl = options.cdpUrl || `http://127.0.0.1:${options.port || 9222}`;
    this.autoLaunch = options.autoLaunch !== false;
    this.profileDir = options.profileDir || null;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Connects to Google Chrome over CDP and attaches to Google Flow tab.
   */
  async connect() {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    const session = await dom.getFlowSession(this.cdpUrl, this.autoLaunch);
    this.browser = session.browser;
    this.context = session.context;
    this.page = session.page;
    return this.page;
  }

  /**
   * Closes the CDP connection (does not kill user's Chrome process).
   */
  async disconnect() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * Performs complete environment and connectivity diagnostics.
   */
  async doctor() {
    const report = {
      nodeVersion: process.version,
      platform: process.platform,
      playwright: false,
      playwrightPath: null,
      chromeBinary: null,
      cdpOpen: false,
      googleAuthenticated: false,
      activeUrl: null,
      projectId: null,
      errors: []
    };

    // 1. Check Playwright
    try {
      const pw = dom.getPlaywright();
      report.playwright = !!pw;
      report.playwrightPath = "Resolved dynamically";
    } catch (e) {
      report.errors.push(e.message);
    }

    // 2. Check Chrome Binary
    try {
      report.chromeBinary = dom.findChromeBinary();
    } catch (e) {
      report.errors.push(`Chrome binary detection failed: ${e.message}`);
    }

    // 3. Check CDP Port
    const port = parseInt(new URL(this.cdpUrl).port || "9222", 10);
    report.cdpOpen = await dom.checkCdpPort(port);

    // 4. Session & Authentication Check
    if (report.cdpOpen) {
      try {
        const page = await this.connect();
        report.activeUrl = page.url();
        const projectMatch = report.activeUrl.match(/\/project\/([a-f0-9\-]+)/);
        report.projectId = projectMatch ? projectMatch[1] : null;

        const authState = await page.evaluate(() => {
          const hasSignInPrompt = !!document.querySelector("a[href*='ServiceLogin'], a[href*='signin']") ||
            Array.from(document.querySelectorAll("button, a")).some((el) => el.innerText && el.innerText.trim() === "Sign in");
          const hasProjectUI = !!document.querySelector("button[aria-label='Settings trigger'], .prompt-box-content, flow-video-tile");
          const hasDashboardUI = !!document.querySelector(".projects-grid-item, button.new-project-button, .header-user-button, a[href*='SignOutOptions']");
          const isAuthenticated = (hasProjectUI || hasDashboardUI) && !hasSignInPrompt;
          return {
            isAuthenticated,
            hasProjectUI,
            hasDashboardUI
          };
        });

        report.googleAuthenticated = authState.isAuthenticated;
      } catch (e) {
        report.errors.push(`CDP connection error: ${e.message}`);
      }
    }

    return report;
  }

  /**
   * Inspects current project state, settings, frame chips, and prompt.
   */
  async status() {
    const page = await this.connect();
    await dom.dismissOverlays(page);

    return await page.evaluate(() => {
      const url = window.location.href;
      const projectMatch = url.match(/\/project\/([a-f0-9\-]+)/);
      const projectId = projectMatch ? projectMatch[1] : null;

      const titleEl = document.querySelector(".header-title");
      const projectTitle = titleEl ? titleEl.innerText.trim() : null;

      const settingsBtn = document.querySelector(
        "button[aria-label='Settings trigger'], button.settings-trigger-button"
      );
      const settingsText = settingsBtn ? settingsBtn.innerText.replace(/\n+/g, " | ") : null;

      const buttons = Array.from(document.querySelectorAll(".prompt-box-content button, button"));

      // Check Start chip
      const startEmpty = buttons.find((b) => b.innerText.trim() === "Start" && b.classList.contains("empty-chip"));
      const startChip = document.querySelector(".chip-container[aria-label*='ingredient'], .chip-container");

      // Check End chip
      const endEmpty = buttons.find((b) => b.innerText.trim() === "End" && b.classList.contains("empty-chip"));

      const promptEl = document.querySelector(".ProseMirror");
      const promptText = promptEl ? promptEl.innerText.trim() : "";

      const generateBtn = document.querySelector(
        "button.generate-icon-button, button[aria-label='Start generation'], button[aria-label*='generation'], button[aria-label*='buat'], button[aria-label*='Generate']"
      );
      const canGenerate = generateBtn && !generateBtn.classList.contains("mat-mdc-button-disabled") && !generateBtn.hasAttribute("disabled");

      // Active progress spinners
      const spinner = document.querySelector("mat-progress-spinner, mat-spinner");

      // Count videos
      const videoElements = document.querySelectorAll("video, flow-video-tile");

      // Dashboard items
      const isDashboard = !projectId;
      const dashboardProjects = document.querySelectorAll(".projects-grid-item");

      const isImage = settingsText ? settingsText.toLowerCase().includes("image") : false;

      return {
        url,
        projectId,
        projectTitle,
        isDashboard,
        dashboardProjectsCount: dashboardProjects.length,
        mediaType: isImage ? "image" : "video",
        settingsSummary: settingsText,
        startFrame: {
          empty: !!startEmpty,
          set: !startEmpty,
          hasChip: !!startChip
        },
        endFrame: {
          empty: !!endEmpty,
          set: !endEmpty
        },
        promptText,
        canGenerate: !!canGenerate,
        hasSpinner: !!spinner,
        videoCount: videoElements.length
      };
    });
  }

  /**
   * Configures generation settings (media type, model, resolution, duration, aspect ratio, mode, batches).
   */
  async configure(config = {}) {
    const page = await this.connect();
    return await dom.configureSettings(page, config);
  }

  /**
   * Uploads or assigns Start or End keyframe.
   */
  async setKeyframe(type, { filePath, index }) {
    const page = await this.connect();
    return await dom.setKeyframe(page, type.toLowerCase(), { filePath, index });
  }

  /**
   * Swaps Start and End frames.
   */
  async swapFrames() {
    const page = await this.connect();
    await dom.dismissOverlays(page);

    const swapBtn = await page.$(
      "button[aria-label*='Swap'], button:has-text('Swap'), button:has(.material-symbols-outlined:has-text('swap_horiz'))"
    );
    if (!swapBtn) throw new Error("Swap frames button not found.");

    await swapBtn.click();
    await page.waitForTimeout(400);
    return true;
  }

  /**
   * Clears keyframe chips.
   */
  async clearFrames(target = "all") {
    const page = await this.connect();
    await dom.dismissOverlays(page);

    const closeBtns = await page.$$(
      ".chip-container button[aria-label*='Remove'], .chip-container button[aria-label*='Clear'], button.chip-remove"
    );
    for (const btn of closeBtns) {
      try {
        await btn.click();
        await page.waitForTimeout(200);
      } catch (e) {}
    }
    return true;
  }

  /**
   * Sets prompt in ProseMirror editor.
   */
  async setPrompt(promptText) {
    const page = await this.connect();
    return await dom.setPrompt(page, promptText);
  }

  /**
   * Clears prompt.
   */
  async clearPrompt() {
    const page = await this.connect();
    return await dom.setPrompt(page, "");
  }

  /**
   * Lists videos in project and extracts signed CDN URLs.
   */
  async getVideos() {
    const page = await this.connect();
    return await dom.getVideos(page);
  }

  /**
   * Triggers video generation and optionally polls for completion.
   */
  async triggerGeneration({ wait = false, timeout = 300, download = null } = {}) {
    const page = await this.connect();
    await dom.dismissOverlays(page);

    const generateBtn = await page.$(
      "button.generate-icon-button, button[aria-label='Start generation'], button[aria-label*='generation'], button[aria-label*='buat'], button[aria-label*='Generate']"
    );
    if (!generateBtn) throw new Error("Generate button not found in DOM.");

    const isDisabled = await generateBtn.evaluate(
      (b) => b.classList.contains("mat-mdc-button-disabled") || b.hasAttribute("disabled")
    );
    if (isDisabled) {
      const st = await this.status();
      throw new Error(
        `Cannot generate: button is disabled. Start set: ${st.startFrame.set}, End set: ${st.endFrame.set}, Prompt empty: ${!st.promptText}`
      );
    }

    const baselineVideos = await this.getVideos();
    await generateBtn.click();
    await page.waitForTimeout(1500);

    if (!wait) {
      return { status: "started" };
    }

    const startTime = Date.now();
    while ((Date.now() - startTime) / 1000 < timeout) {
      await page.waitForTimeout(5000);

      // Hover first tile to trigger lazy mounting
      const firstTile = await page.$("flow-video-tile");
      if (firstTile) {
        try { await firstTile.hover(); } catch (e) {}
      }

      const currentStatus = await this.status();
      const currentVideos = await this.getVideos();

      // Check for freshly completed video
      const newVideo = currentVideos.find((v) => !baselineVideos.some((b) => b.url === v.url));

      if (newVideo && !currentStatus.hasSpinner) {
        let downloadedFile = null;
        if (download) {
          downloadedFile = await dom.downloadUrl(page, newVideo.url, download);
        }
        return {
          status: "completed",
          video: newVideo,
          download: downloadedFile
        };
      }
    }

    throw new Error(`Timed out after ${timeout}s waiting for generation to complete.`);
  }

  /**
   * Downloads the latest generated video in the project.
   */
  async downloadLatest(outputPath) {
    const page = await this.connect();
    const videos = await this.getVideos();
    if (videos.length === 0) {
      throw new Error("No videos found in current Google Flow project.");
    }
    const latest = videos[0];
    return await dom.downloadUrl(page, latest.url, outputPath);
  }

  /**
   * Executes a complete single scene pipeline.
   */
  async runScene(options = {}) {
    const page = await this.connect();

    // 1. Configure settings (media, model, aspect, resolution, duration, mode)
    if (options.mediaType || options.media || options.model || options.resolution || options.duration || options.aspect || options.mode || options.batches || options.batch) {
      await this.configure({
        mediaType: options.mediaType || options.media,
        model: options.model,
        resolution: options.resolution,
        duration: options.duration,
        aspect: options.aspect,
        mode: options.mode,
        batches: options.batches || options.batch
      });
    }

    // 2. Set Start Frame
    if (options.start) {
      await this.setKeyframe("Start", { filePath: options.start });
    }

    // 3. Set End Frame
    if (options.end) {
      await this.setKeyframe("End", { filePath: options.end });
    }

    // 4. Set Prompt
    if (options.prompt) {
      await this.setPrompt(options.prompt);
    }

    // 5. Trigger generation if requested
    if (options.generate) {
      return await this.triggerGeneration({
        wait: options.wait !== false,
        timeout: options.timeout || 300,
        download: options.output || null
      });
    }

    return { status: "configured" };
  }

  /**
   * Executes declarative pipeline from flow.json.
   */
  async runProject(options = {}) {
    const config = configHelper.loadConfig(options.configPath);
    if (!config) {
      throw new Error("No flow.json found. Run 'flow init' first or pass --config path/to/flow.json");
    }

    const defaults = config.defaults || {};
    let scenes = config.scenes || [];

    if (options.scene) {
      scenes = scenes.filter((s) => s.name === options.scene);
      if (scenes.length === 0) {
        throw new Error(`Scene '${options.scene}' not found in ${config._configPath}`);
      }
    }

    if (options.dryRun) {
      return {
        dryRun: true,
        project: config.name,
        defaults,
        scenesToExecute: scenes.map((s) => configHelper.mergeSceneDefaults(s, defaults))
      };
    }

    const executed = [];
    for (const rawScene of scenes) {
      const scene = configHelper.mergeSceneDefaults(rawScene, defaults);
      const res = await this.runScene({
        ...scene,
        generate: true,
        wait: true,
        timeout: scene.timeout || defaults.timeout || 300
      });
      executed.push({ scene: scene.name, result: res });
    }

    return { status: "completed", executed };
  }

  /**
   * Lists all Google Flow projects associated with the account.
   */
  async listProjects() {
    const page = await this.connect();
    return await dom.listProjects(page);
  }

  /**
   * Creates a new Google Flow project and optionally sets its title.
   */
  async createProject(options = {}) {
    const page = await this.connect();
    return await dom.createProject(page, options);
  }

  /**
   * Navigates / switches to a specific project by ID.
   */
  async switchProject(projectId) {
    const page = await this.connect();
    return await dom.openProject(page, projectId);
  }

  /**
   * Deletes a project by ID or deletes the currently open project.
   */
  async deleteProject(projectId = null, options = {}) {
    const page = await this.connect();
    return await dom.deleteProject(page, projectId, options);
  }
}

module.exports = FlowClient;
