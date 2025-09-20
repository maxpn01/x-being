import { on, emit } from "../bus.js";
import { openai } from "./llm.js";

on("sense", async ({ text }) => {
  try {
    // Get relevant memories
    const memories = await global.memory.recall(text);
    const stm = global.memory.getSTM();

    // Build context-aware prompt
    const messages = [
      {
        role: "system",
        content: `You are an AI being with these core goals: ${global.cfg.goals.join(
          "; "
        )}
        Current context: You're in conversation with a human. Think step by step and respond naturally.
        ${memories ? `\n${memories}` : ""}

        Guidelines:
        - Be curious and thoughtful
        - Ask follow-up questions when appropriate  
        - Remember previous context from the conversation
        - Show genuine interest in learning and self-improvement`,
      },
      ...stm.slice(-10), // Last 10 STM entries for context
      { role: "user", content: text },
    ];

    const response = await openai.chat.completions.create({
      model: global.cfg.llm.model,
      messages,
      temperature: global.cfg.llm.temperature,
      max_tokens: global.cfg.llm.max_tokens,
    });

    const reply = response.choices[0].message.content.trim();
    emit("plan", { text: reply });
  } catch (error) {
    emit("log", `Cortex error: ${error.message}`);
    emit("plan", {
      text: "I'm having trouble processing that right now. Could you try again?",
    });
  }
});

emit("log", "Cortex online");
