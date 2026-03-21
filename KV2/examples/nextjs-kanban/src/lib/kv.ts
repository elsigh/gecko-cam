import { createKV, consoleTracer, defineSchema, createSchemaKV } from "@vercel/kv2";
import type {
  Board,
  BoardMetadata,
  Column,
  ColumnMetadata,
  Task,
  TaskMetadata,
} from "./types.js";

// Re-export types for convenience
export type { Board, BoardMetadata, Column, ColumnMetadata, Task, TaskMetadata };

// =============================================================================
// Schema Definition
// =============================================================================

/**
 * Kanban KV Schema - Hierarchical Design
 *
 * All entities share the same prefix ("boards/") with hierarchical keys,
 * enabling single-query access to entire board hierarchies.
 *
 * Key structure:
 *   Board:  {boardId}
 *   Column: {boardId}/columns/{columnId}
 *   Task:   {boardId}/columns/{columnId}/tasks/{taskId}
 */
const kanbanSchema = defineSchema("", {
  boards: {
    pattern: "*",
    value: {} as Board,
    metadata: {} as BoardMetadata,
    children: {
      columns: {
        pattern: "columns/*",
        value: {} as Column,
        metadata: {} as ColumnMetadata,
        children: {
          tasks: {
            pattern: "tasks/*",
            value: {} as Task,
            metadata: {} as TaskMetadata,
          },
        },
      },
    },
  },
});

// =============================================================================
// KV Store Instance & Schema KV
// =============================================================================

/**
 * Single KV instance for all kanban data.
 * Uses CoW with upstream fallback to production/main.
 */
const kv = createKV({
  prefix: "kb/",
  upstream: { env: "production", branch: "main" },
  tracer: consoleTracer,
});

/**
 * Schema-aware KV with type-safe key builders and tree iteration.
 */
export const kanbanKV = createSchemaKV(kanbanSchema, kv.getStore("boards/"));

// =============================================================================
// Key Helpers (using schema key builders)
// =============================================================================

/** Build column key: {boardId}/columns/{columnId} */
export function columnKey(boardId: string, columnId: string): string {
  return kanbanKV.key.boards.columns(boardId, columnId);
}

/** Build task key: {boardId}/columns/{columnId}/tasks/{taskId} */
export function taskKey(boardId: string, columnId: string, taskId: string): string {
  return kanbanKV.key.boards.columns.tasks(boardId, columnId, taskId);
}

/** Generate a simple unique ID */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// Helper Functions (using tree API)
// =============================================================================

/** Get all columns for a board, sorted by order */
export async function getColumnsForBoard(boardId: string): Promise<Array<{ column: Column; metadata: ColumnMetadata }>> {
  const board = await kanbanKV.tree("boards", boardId);
  if (!board) return [];

  const columns: Array<{ column: Column; metadata: ColumnMetadata }> = [];
  for await (const col of board.columns) {
    columns.push({
      column: col.value,
      metadata: col.metadata,
    });
  }

  return columns.sort((a, b) => a.metadata.order - b.metadata.order);
}

/** Get all tasks for a column, sorted by order */
export async function getTasksForColumn(boardId: string, columnId: string): Promise<Array<{ task: Task; metadata: TaskMetadata }>> {
  // Use the tree API to get the board first, then navigate to the column
  const board = await kanbanKV.tree("boards", boardId);
  if (!board) return [];

  const tasks: Array<{ task: Task; metadata: TaskMetadata }> = [];

  // Find the column and get its tasks
  for await (const col of board.columns) {
    if (col.id === columnId) {
      for await (const task of col.tasks) {
        tasks.push({
          task: task.value,
          metadata: task.metadata,
        });
      }
      break;
    }
  }

  return tasks.sort((a, b) => a.metadata.order - b.metadata.order);
}

/**
 * Get the full board with all columns and tasks using lazy tree iteration.
 *
 * This uses the schema-based tree() which makes a SINGLE keys() call,
 * then lazily batch-fetches values on first iteration.
 */
export async function getFullBoard(boardId: string): Promise<{
  board: Board;
  columns: Array<{
    column: Column;
    metadata: ColumnMetadata;
    tasks: Array<{ task: Task; metadata: TaskMetadata }>;
  }>;
} | null> {
  // Single tree() call - makes ONE keys() query
  const boardTree = await kanbanKV.tree("boards", boardId);
  if (!boardTree) {
    return null;
  }

  // First iteration of columns triggers batch fetch of ALL column values
  const columns: Array<{
    column: Column;
    metadata: ColumnMetadata;
    tasks: Array<{ task: Task; metadata: TaskMetadata }>;
  }> = [];

  for await (const col of boardTree.columns) {
    // First iteration of tasks triggers batch fetch of ALL task values for this column
    const tasks: Array<{ task: Task; metadata: TaskMetadata }> = [];
    for await (const task of col.tasks) {
      tasks.push({
        task: task.value,
        metadata: task.metadata,
      });
    }

    columns.push({
      column: col.value,
      metadata: col.metadata,
      tasks: tasks.sort((a, b) => a.metadata.order - b.metadata.order),
    });
  }

  // Sort columns by order
  columns.sort((a, b) => a.metadata.order - b.metadata.order);

  return {
    board: boardTree.value,
    columns,
  };
}

/** Delete a board and all its columns and tasks */
export async function deleteBoard(boardId: string): Promise<void> {
  // Get all keys under this board using the raw KV
  const keysToDelete: string[] = [boardId];
  for await (const key of kanbanKV.raw.keys(`${boardId}/`)) {
    keysToDelete.push(key);
  }

  // Delete all in parallel
  await Promise.all(keysToDelete.map(key => kanbanKV.raw.delete(key)));
}

/** Move a task to a different column and/or position */
export async function moveTask(
  boardId: string,
  taskId: string,
  fromColumnId: string,
  toColumnId: string,
  newOrder: number
): Promise<void> {
  const oldKey = taskKey(boardId, fromColumnId, taskId);
  const result = await kanbanKV.raw.get<Task>(oldKey);

  if (!result.exists) {
    throw new Error(`Task ${taskId} not found`);
  }

  const task = await result.value;
  const metadata = result.metadata as TaskMetadata;

  // If moving to a different column
  if (fromColumnId !== toColumnId) {
    // Delete from old location
    await kanbanKV.raw.delete(oldKey);

    // Update task's columnId
    task.columnId = toColumnId;

    // Save to new location
    const newKey = taskKey(boardId, toColumnId, taskId);
    await kanbanKV.raw.set(newKey, task, { order: newOrder, priority: metadata.priority });
  } else {
    // Just update the order
    await kanbanKV.raw.set(oldKey, task, { order: newOrder, priority: metadata.priority });
  }
}
