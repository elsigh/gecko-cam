import { type NextRequest, NextResponse } from "next/server";
import {
  kanbanKV,
  generateId,
  getTasksForColumn,
  moveTask,
  type Task,
  type TaskMetadata,
} from "@/lib/kv";

// GET /api/tasks?boardId=xxx&columnId=xxx - List tasks for a column
export async function GET(request: NextRequest) {
  const boardId = request.nextUrl.searchParams.get("boardId");
  const columnId = request.nextUrl.searchParams.get("columnId");

  if (!boardId || !columnId) {
    return NextResponse.json(
      { error: "Board ID and Column ID are required" },
      { status: 400 }
    );
  }

  const tasks = await getTasksForColumn(boardId, columnId);
  return NextResponse.json({ tasks });
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    boardId,
    columnId,
    title,
    description,
    assignee,
    labels,
    priority,
  } = body;

  if (!boardId || !columnId || !title) {
    return NextResponse.json(
      { error: "Board ID, Column ID, and title are required" },
      { status: 400 }
    );
  }

  // Get existing tasks to determine order
  const existingTasks = await getTasksForColumn(boardId, columnId);
  const order = existingTasks.length;

  const id = generateId();
  const now = Date.now();

  const task: Task = {
    id,
    columnId,
    title,
    description,
    assignee,
    labels,
    createdAt: now,
  };

  const metadata: TaskMetadata = {
    order,
    priority: priority || "medium",
  };

  // Use schema key builder for type-safe key generation
  const key = kanbanKV.key.boards.columns.tasks(boardId, columnId, id);
  await kanbanKV.raw.set(key, task, metadata);

  return NextResponse.json({ task, metadata }, { status: 201 });
}

// PATCH /api/tasks - Update a task
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const {
    boardId,
    columnId,
    taskId,
    title,
    description,
    assignee,
    labels,
    priority,
    // For moving tasks
    toColumnId,
    order,
  } = body;

  if (!boardId || !columnId || !taskId) {
    return NextResponse.json(
      { error: "Board ID, Column ID, and task ID are required" },
      { status: 400 }
    );
  }

  // Handle move operation
  if (toColumnId !== undefined || order !== undefined) {
    const targetColumn = toColumnId || columnId;
    const targetOrder = order ?? 0;

    await moveTask(boardId, taskId, columnId, targetColumn, targetOrder);

    // Fetch updated task
    const key = kanbanKV.key.boards.columns.tasks(boardId, targetColumn, taskId);
    const result = await kanbanKV.raw.get<Task>(key);
    if (result.exists) {
      return NextResponse.json({
        task: await result.value,
        metadata: result.metadata,
      });
    }
  }

  // Handle update operation
  const key = kanbanKV.key.boards.columns.tasks(boardId, columnId, taskId);
  const result = await kanbanKV.raw.get<Task>(key);

  if (!result.exists) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const task = await result.value;
  const existingMetadata = result.metadata as TaskMetadata;

  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (assignee !== undefined) task.assignee = assignee;
  if (labels !== undefined) task.labels = labels;

  const newMetadata: TaskMetadata = {
    order: existingMetadata.order,
    priority: priority !== undefined ? priority : existingMetadata.priority,
  };

  await kanbanKV.raw.set(key, task, newMetadata);

  return NextResponse.json({ task, metadata: newMetadata });
}

// DELETE /api/tasks?boardId=xxx&columnId=xxx&taskId=xxx - Delete a task
export async function DELETE(request: NextRequest) {
  const boardId = request.nextUrl.searchParams.get("boardId");
  const columnId = request.nextUrl.searchParams.get("columnId");
  const taskId = request.nextUrl.searchParams.get("taskId");

  if (!boardId || !columnId || !taskId) {
    return NextResponse.json(
      { error: "Board ID, Column ID, and task ID are required" },
      { status: 400 }
    );
  }

  const key = kanbanKV.key.boards.columns.tasks(boardId, columnId, taskId);
  await kanbanKV.raw.delete(key);

  return NextResponse.json({ success: true });
}
