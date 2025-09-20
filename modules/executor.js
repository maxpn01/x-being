import { on, emit } from "../bus.js";
import { promptUser } from "../helpers.js";

on("plan", async ({ text }) => {
  console.log(`\n🤖 ${text}\n`);
  promptUser();
  emit("act", { result: text });
});

emit("log", "Executor ready");
