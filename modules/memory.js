import { on, emit } from "../bus.js";
import fs from "fs";
import path from "path";
import { openai } from "./llm.js";

const DATA_DIR = path.resolve("data");
const STM_FILE = path.join(DATA_DIR, "stm.json");
const LTM_FILE = path.join(DATA_DIR, "ltm.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dot = (a, b) => a.reduce((sum, val, i) => sum + val * b[i], 0);
const norm = (v) => Math.sqrt(dot(v, v));
const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b) + 1e-9);

class Memory {
  constructor() {
    this.stm = this.loadSTM();
    this.ltm = this.loadLTM();
    this.embedCache = new Map(); // Cache embeddings to reduce API calls
  }

  // Short-term memory (conversation context)
  loadSTM() {
    try {
      return fs.existsSync(STM_FILE)
        ? JSON.parse(fs.readFileSync(STM_FILE, "utf8"))
        : [];
    } catch {
      return [];
    }
  }

  saveSTM() {
    const toSave = this.stm.slice(0, global.cfg.memory.stm_size);
    fs.writeFileSync(STM_FILE, JSON.stringify(toSave, null, 2));
  }

  addToSTM(role, content) {
    this.stm.unshift({ role, content, timestamp: Date.now() });
    if (this.stm.length > global.cfg.memory.stm_size) {
      this.stm.pop();
    }
    this.saveSTM();
  }

  // Long-term memory (semantic search)
  loadLTM() {
    try {
      return fs.existsSync(LTM_FILE)
        ? JSON.parse(fs.readFileSync(LTM_FILE, "utf8"))
        : [];
    } catch {
      return [];
    }
  }

  saveLTM() {
    fs.writeFileSync(LTM_FILE, JSON.stringify(this.ltm, null, 2));
  }

  async embed(text) {
    // Use cache to avoid re-embedding same text
    if (this.embedCache.has(text)) {
      return this.embedCache.get(text);
    }

    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: [text],
      });
      const embedding = response.data[0].embedding;
      this.embedCache.set(text, embedding);
      return embedding;
    } catch (error) {
      emit("log", `Embedding error: ${error.message}`);
      return null;
    }
  }

  async addToLTM(text, context = "") {
    const embedding = await this.embed(text);
    if (!embedding) return;

    this.ltm.push({
      text,
      context,
      embedding,
      timestamp: Date.now(),
      access_count: 0,
    });

    // Trim LTM if too large
    if (this.ltm.length > global.cfg.memory.ltm_max_items) {
      // Remove oldest, least accessed items
      this.ltm.sort(
        (a, b) =>
          b.access_count * 0.7 +
          b.timestamp * 0.3 -
          (a.access_count * 0.7 + a.timestamp * 0.3)
      );
      this.ltm = this.ltm.slice(0, global.cfg.memory.ltm_max_items);
    }

    this.saveLTM();
  }

  async recall(query) {
    if (!this.ltm.length) return "";

    const queryEmbedding = await this.embed(query);
    if (!queryEmbedding) return "";

    const scored = this.ltm
      .map((item, index) => ({
        index,
        similarity: cosine(queryEmbedding, item.embedding),
      }))
      .filter(
        ({ similarity }) =>
          similarity > global.cfg.memory.similarity_threshold
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, global.cfg.memory.ltm_topk);

    if (!scored.length) {
      return "";
    }

    scored.forEach(({ index }) => {
      this.ltm[index].access_count += 1;
    });
    this.saveLTM();

    const lines = scored.map(({ index }) => `- ${this.ltm[index].text}`);
    return `Relevant memories:\n${lines.join("\n")}`;
  }

  getSTM() {
    return [...this.stm]
      .reverse()
      .map(({ role, content }) => ({ role, content }));
  }

  getStats() {
    return {
      stm_count: this.stm.length,
      ltm_count: this.ltm.length,
      cache_size: this.embedCache.size,
    };
  }
}

const memory = new Memory();
global.memory = memory;

on("sense", ({ text }) => {
  memory.addToSTM("user", text);
  // Archive important user messages to LTM
  if (text.length > 20) {
    // Only archive substantial messages
    memory.addToLTM(`[user] ${text}`, "user_input");
  }
});

on("plan", ({ text }) => {
  memory.addToSTM("assistant", text);
  // Archive assistant responses to LTM
  memory.addToLTM(`[assistant] ${text}`, "assistant_response");
});

const stats = memory.getStats();
emit(
  "log",
  `Memory ready - STM: ${stats.stm_count}, LTM: ${stats.ltm_count}, Cache: ${stats.cache_size}`
);
