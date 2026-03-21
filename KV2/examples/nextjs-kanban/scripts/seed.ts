/**
 * Seed script for Kanban example.
 *
 * Seeds data directly to production/main so it's available as upstream
 * for all preview branches and local development.
 *
 * Uses hierarchical keys where all entities share the same prefix:
 *   Board:  {boardId}
 *   Column: {boardId}/columns/{columnId}
 *   Task:   {boardId}/columns/{columnId}/tasks/{taskId}
 *
 * Usage:
 *   pnpm seed
 *   # or
 *   npx tsx scripts/seed.ts
 *
 * Requires BLOB_READ_WRITE_TOKEN in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createKV } from "../../../dist/index.js";
import type {
  Board,
  BoardMetadata,
  Column,
  ColumnMetadata,
  Task,
  TaskMetadata,
} from "../src/lib/types.js";

// Connect directly to production/main (the upstream)
const kv = createKV({
  prefix: "kb/",
  env: "production",
  branch: "main",
  upstream: null, // No upstream for production/main
});

// Single store for hierarchical data (matches schema)
const store = kv.getStore<Board | Column | Task, BoardMetadata | ColumnMetadata | TaskMetadata>("boards/");

// Key helpers
function columnKey(boardId: string, columnId: string): string {
  return `${boardId}/columns/${columnId}`;
}

function taskKey(boardId: string, columnId: string, taskId: string): string {
  return `${boardId}/columns/${columnId}/tasks/${taskId}`;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seed() {
  console.log("Seeding kanban data to production/main...\n");

  // Create a sample board
  const boardId = generateId();
  const now = Date.now();

  const board: Board = {
    id: boardId,
    name: "Product Launch",
    description: "Tasks for the Q1 product launch",
    createdAt: now,
  };

  await store.set(boardId, board, { updatedAt: now });
  console.log(`Created board: ${board.name} (${boardId})`);

  // Create columns
  const columnDefs = [
    { name: "Backlog", tasks: ["Research competitors", "Define MVP scope", "Create wireframes"] },
    { name: "To Do", tasks: ["Set up CI/CD", "Design database schema"] },
    { name: "In Progress", tasks: ["Implement auth flow", "Build API endpoints"] },
    { name: "Review", tasks: ["Code review: user profile"] },
    { name: "Done", tasks: ["Project setup", "Team kickoff meeting"] },
  ];

  for (let colIndex = 0; colIndex < columnDefs.length; colIndex++) {
    const colDef = columnDefs[colIndex];
    const colId = generateId();

    const column: Column = {
      id: colId,
      boardId,
      name: colDef.name,
    };

    await store.set(columnKey(boardId, colId), column, { order: colIndex });
    console.log(`  Created column: ${column.name} (${colId})`);

    // Create tasks in this column
    for (let taskIndex = 0; taskIndex < colDef.tasks.length; taskIndex++) {
      const taskTitle = colDef.tasks[taskIndex];
      const taskId = generateId();

      const task: Task = {
        id: taskId,
        columnId: colId,
        title: taskTitle,
        createdAt: now - (colDef.tasks.length - taskIndex) * 1000, // Stagger creation times
      };

      const priorities: Array<"low" | "medium" | "high"> = ["low", "medium", "high"];
      const priority = priorities[taskIndex % 3];

      await store.set(taskKey(boardId, colId, taskId), task, { order: taskIndex, priority });
      console.log(`    Created task: ${taskTitle} (${priority})`);
    }
  }

  // Create a second board
  const board2Id = generateId();
  const board2: Board = {
    id: board2Id,
    name: "Bug Tracker",
    description: "Track and fix reported bugs",
    createdAt: now,
  };

  await store.set(board2Id, board2, { updatedAt: now });
  console.log(`\nCreated board: ${board2.name} (${board2Id})`);

  const bugColumns = [
    { name: "Reported", tasks: ["Login fails on Safari", "Slow page load on mobile"] },
    { name: "Triaged", tasks: ["Memory leak in dashboard"] },
    { name: "Fixing", tasks: ["404 on user profile"] },
    { name: "Fixed", tasks: ["Typo in error message", "Broken link in footer"] },
  ];

  for (let colIndex = 0; colIndex < bugColumns.length; colIndex++) {
    const colDef = bugColumns[colIndex];
    const colId = generateId();

    const column: Column = {
      id: colId,
      boardId: board2Id,
      name: colDef.name,
    };

    await store.set(columnKey(board2Id, colId), column, { order: colIndex });
    console.log(`  Created column: ${column.name}`);

    for (let taskIndex = 0; taskIndex < colDef.tasks.length; taskIndex++) {
      const taskTitle = colDef.tasks[taskIndex];
      const taskId = generateId();

      const task: Task = {
        id: taskId,
        columnId: colId,
        title: taskTitle,
        createdAt: now,
      };

      await store.set(taskKey(board2Id, colId, taskId), task, {
        order: taskIndex,
        priority: "high", // Bugs are high priority
      });
      console.log(`    Created task: ${taskTitle}`);
    }
  }

  console.log("\nSeed complete!");
  console.log("\nKey structure (hierarchical, prefix: kb/boards/):");
  console.log("  Board:  {boardId}");
  console.log("  Column: {boardId}/columns/{columnId}");
  console.log("  Task:   {boardId}/columns/{columnId}/tasks/{taskId}");
  console.log("\nQuery entire board with: store.keys('{boardId}/')");
}

seed().catch(console.error);
