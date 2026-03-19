import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { MemoryState } from "@chat-adapter/state-memory";

// Lazy singleton — avoids crashing at import if env vars aren't set yet
let botInstance: Chat | null = null;

export function getBot(): Chat {
  if (!botInstance) {
    botInstance = new Chat({
      userName: "gecko-cam",
      adapters: {
        slack: createSlackAdapter(),
      },
      state: new MemoryState(),
    });
  }
  return botInstance;
}
