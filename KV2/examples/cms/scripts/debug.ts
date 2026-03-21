import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { listDocuments } from "../lib/documents";
import { listUsers } from "../lib/users";

async function debug() {
  console.log("Environment:");
  console.log("  VERCEL_ENV:", process.env.VERCEL_ENV ?? "(not set, using development)");
  console.log("  VERCEL_GIT_COMMIT_REF:", process.env.VERCEL_GIT_COMMIT_REF ?? "(not set, using local)");
  console.log("");

  console.log("Fetching documents...");
  const docs = await listDocuments();
  console.log("Documents found:", docs.documents.length);
  for (const d of docs.documents) {
    console.log(`  - ${d.document.slug} (${d.document.type}) - ${d.document.title}`);
  }

  console.log("");
  console.log("Fetching users...");
  const users = await listUsers();
  console.log("Users found:", users.users.length);
  for (const u of users.users) {
    console.log(`  - ${u.username} (${u.role})`);
  }
}

debug().catch(console.error);
