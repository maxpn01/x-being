import "dotenv/config";
import fs from "node:fs";
import YAML from "yaml";
import { bus, emit } from "./bus.js";
import { promptUser } from "./helpers.js";

bus.on("log", (m) => console.log("[log]", m));

try {
  global.cfg = YAML.parse(fs.readFileSync("brain.yml", "utf8"));
  emit("log", "✓ config loaded");
} catch (error) {
  console.error("Failed to load config:", error.message);
  process.exit(1);
}

const modules = [
  "./modules/memory.js",
  "./modules/commands.js",
  "./modules/cortex.js",
  "./modules/executor.js",
];

for (const module of modules) {
  try {
    await import(module);
  } catch (error) {
    console.error(`Failed to load ${module}:`, error.message);
    process.exit(1);
  }
}

emit("log", "🧠 being-x is online");

promptUser();

process.stdin.setEncoding("utf8");

process.stdin.on("data", (data) => {
  const input = data.trim();

  if (!input) {
    promptUser();
    return;
  }

  emit("input", { text: input });
});

process.on("SIGINT", () => {
  emit("log", "👋 shutting down gracefully");
  process.exit(0);
});
