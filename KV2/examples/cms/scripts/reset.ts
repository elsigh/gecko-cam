import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { documentsKV, historyKV } from "../lib/kv";

async function reset() {
  console.log("Resetting CMS data...\n");

  // Delete all documents (indexes auto-cleaned)
  console.log("Deleting documents...");
  let docCount = 0;
  for await (const key of documentsKV.keys()) {
    await documentsKV.delete(key);
    docCount++;
  }
  console.log(`  Deleted ${docCount} documents (indexes auto-cleaned)`);

  // Delete all history
  console.log("Deleting history...");
  let historyCount = 0;
  for await (const key of historyKV.keys()) {
    await historyKV.delete(key);
    historyCount++;
  }
  console.log(`  Deleted ${historyCount} history entries`);

  console.log("\nReset complete!");
}

reset().catch((error) => {
  console.error("Reset failed:", error);
  process.exit(1);
});
