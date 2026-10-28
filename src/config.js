/**
 * config.js - Declarative flow.json configuration finder, loader, and scaffolder
 */

const fs = require("fs");
const path = require("path");

const CONFIG_FILENAME = "flow.json";

/**
 * Searches upward from startDir to locate flow.json (similar to git / npm resolution).
 */
function findConfig(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  const root = path.parse(curr).root;

  while (curr !== root) {
    const candidate = path.join(curr, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    curr = path.dirname(curr);
  }

  const rootCandidate = path.join(root, CONFIG_FILENAME);
  if (fs.existsSync(rootCandidate)) return rootCandidate;

  return null;
}

/**
 * Loads and parses a flow.json file.
 */
function loadConfig(configPath = null) {
  const target = configPath ? path.resolve(configPath) : findConfig();
  if (!target || !fs.existsSync(target)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(target, "utf-8");
    const parsed = JSON.parse(raw);
    parsed._configPath = target;
    parsed._configDir = path.dirname(target);
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse ${target}: ${err.message}`);
  }
}

/**
 * Scaffolds a new flow.json in targetDir using predefined or custom templates.
 */
function scaffoldConfig(targetDir = process.cwd(), options = {}) {
  const absDir = path.resolve(targetDir);
  if (!fs.existsSync(absDir)) {
    fs.mkdirSync(absDir, { recursive: true });
  }

  const targetFile = path.join(absDir, CONFIG_FILENAME);
  if (fs.existsSync(targetFile) && !options.force) {
    throw new Error(`${CONFIG_FILENAME} already exists at ${targetFile}. Use --force to overwrite.`);
  }

  const templateType = options.template || "basic";
  const templatePath = path.join(__dirname, `../templates/${templateType === "narrative" ? "narrative-pipeline.json" : "flow.json"}`);

  let configData;
  if (fs.existsSync(templatePath)) {
    configData = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
  } else {
    configData = {
      "$schema": "https://flow.google/schema/v1.json",
      "version": "1.0.0",
      "name": options.name || path.basename(absDir),
      "project": {
        "id": options.projectId || "",
        "url": options.projectUrl || "",
        "title": options.title || "Google Flow Project"
      },
      "defaults": {
        "resolution": options.resolution || "720p",
        "duration": options.duration || "8s",
        "aspect": options.aspect || "9:16",
        "mode": options.mode || "Frames",
        "timeout": options.timeout || 300
      },
      "scenes": [
        {
          "name": "scene_01",
          "start": "assets/frames/scene_01_start.png",
          "end": "assets/frames/scene_01_end.png",
          "prompt": "Minimalist Swiss motion graphic: cinematic smooth camera tracking.",
          "output": "assets/videos/scene_01.mp4"
        }
      ]
    };
  }

  if (options.name) configData.name = options.name;
  if (options.projectId) configData.project.id = options.projectId;
  if (options.projectUrl) configData.project.url = options.projectUrl;
  if (options.title) configData.project.title = options.title;

  fs.writeFileSync(targetFile, JSON.stringify(configData, null, 2), "utf-8");
  return { path: targetFile, config: configData };
}

/**
 * Updates an existing flow.json file with new project metadata.
 */
function updateProjectConfig(projectId, projectUrl = null, projectTitle = null, configPath = null) {
  const target = configPath ? path.resolve(configPath) : findConfig();
  if (!target || !fs.existsSync(target)) return null;

  try {
    const raw = fs.readFileSync(target, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.project) parsed.project = {};
    if (projectId) parsed.project.id = projectId;
    if (projectUrl) {
      parsed.project.url = projectUrl;
    } else if (projectId) {
      parsed.project.url = `https://flow.google.com/project/${projectId}`;
    }
    if (projectTitle) parsed.project.title = projectTitle;

    fs.writeFileSync(target, JSON.stringify(parsed, null, 2), "utf-8");
    return { path: target, config: parsed };
  } catch (err) {
    return null;
  }
}

/**
 * Merges global defaults with scene-level parameters.
 */
function mergeSceneDefaults(scene, defaults = {}) {
  const mediaType = scene.mediaType || scene.media || defaults.mediaType || defaults.media || "video";
  const defaultExt = mediaType === "image" ? "png" : "mp4";
  const defaultDir = mediaType === "image" ? "assets/images" : "assets/videos";

  return {
    name: scene.name || "unnamed_scene",
    mediaType,
    model: scene.model || defaults.model || null,
    start: scene.start || null,
    end: scene.end || null,
    prompt: scene.prompt || "",
    output: scene.output || `./${defaultDir}/${scene.name || "output"}.${defaultExt}`,
    resolution: scene.resolution || defaults.resolution || "720p",
    duration: scene.duration || defaults.duration || "8s",
    aspect: scene.aspect || defaults.aspect || "9:16",
    mode: scene.mode || defaults.mode || "Frames",
    batches: scene.batches || scene.batch || defaults.batches || defaults.batch || "x1",
    timeout: scene.timeout || defaults.timeout || 300
  };
}

module.exports = {
  CONFIG_FILENAME,
  findConfig,
  loadConfig,
  scaffoldConfig,
  updateProjectConfig,
  mergeSceneDefaults
};
