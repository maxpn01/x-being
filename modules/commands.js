import { on, emit } from "../bus.js";
import { promptUser } from "../helpers.js";

// Command processor - handles input before it goes to cortex
on("input", ({ text }) => {
  if (text.startsWith("/")) {
    const [command, ...args] = text.slice(1).split(" ");

    switch (command.toLowerCase()) {
      case "stats": {
        const stats = global.memory.getStats();
        console.log(`\n📊 Memory Stats:`);
        console.log(`- STM: ${stats.stm_count}/${global.cfg.memory.stm_size}`);
        console.log(
          `- LTM: ${stats.ltm_count}/${global.cfg.memory.ltm_max_items}`
        );
        console.log(`- Embedding Cache: ${stats.cache_size}`);
        console.log();
        promptUser();
        return; // Don't pass to cortex
      }

      case "clear": {
        global.memory.stm = [];
        global.memory.saveSTM();
        console.log("\n🧹 Short-term memory cleared\n");
        promptUser();
        return; // Don't pass to cortex
      }

      case "help": {
        console.log(`\n🔧 Available Commands:`);
        console.log(`- /stats    - Show memory statistics`);
        console.log(`- /clear    - Clear short-term memory`);
        console.log(`- /help     - Show this help`);
        console.log(`- exit/quit - Shutdown gracefully`);
        console.log();
        promptUser();
        return;
      }

      default: {
        console.log(`\n❓ Unknown command: /${command}`);
        console.log(`Type /help for available commands\n`);
        promptUser();
        return;
      }
    }
  }

  // Not a command, pass to normal processing
  emit("sense", { text });
});

emit("log", "Commands ready");
