import { type NextRequest, NextResponse } from "next/server";
import {
  kanbanKV,
  generateId,
  getColumnsForBoard,
  type Column,
} from "@/lib/kv";

// GET /api/columns?boardId=xxx - List columns for a board
export async function GET(request: NextRequest) {
  const boardId = request.nextUrl.searchParams.get("boardId");

  if (!boardId) {
    return NextResponse.json(
      { error: "Board ID is required" },
      { status: 400 }
    );
  }

  const columns = await getColumnsForBoard(boardId);
  return NextResponse.json({ columns });
}

// POST /api/columns - Create a new column
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { boardId, name } = body;

  if (!boardId || !name) {
    return NextResponse.json(
      { error: "Board ID and name are required" },
      { status: 400 }
    );
  }

  // Get existing columns to determine order
  const existingColumns = await getColumnsForBoard(boardId);
  const order = existingColumns.length;

  const id = generateId();
  const column: Column = {
    id,
    boardId,
    name,
  };

  // Use schema key builder for type-safe key generation
  const key = kanbanKV.key.boards.columns(boardId, id);
  await kanbanKV.raw.set(key, column, { order });

  return NextResponse.json({ column, metadata: { order } }, { status: 201 });
}

// PATCH /api/columns - Update a column (name or order)
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { boardId, columnId, name, order } = body;

  if (!boardId || !columnId) {
    return NextResponse.json(
      { error: "Board ID and column ID are required" },
      { status: 400 }
    );
  }

  const key = kanbanKV.key.boards.columns(boardId, columnId);
  const result = await kanbanKV.raw.get<Column>(key);

  if (!result.exists) {
    return NextResponse.json({ error: "Column not found" }, { status: 404 });
  }

  const column = await result.value;
  const metadata = result.metadata as { order: number };

  if (name !== undefined) {
    column.name = name;
  }

  const newOrder = order !== undefined ? order : metadata.order;

  await kanbanKV.raw.set(key, column, { order: newOrder });

  return NextResponse.json({ column, metadata: { order: newOrder } });
}

// DELETE /api/columns?boardId=xxx&columnId=xxx - Delete a column and its tasks
export async function DELETE(request: NextRequest) {
  const boardId = request.nextUrl.searchParams.get("boardId");
  const columnId = request.nextUrl.searchParams.get("columnId");

  if (!boardId || !columnId) {
    return NextResponse.json(
      { error: "Board ID and column ID are required" },
      { status: 400 }
    );
  }

  // Collect all keys under this column (column + tasks) then delete in parallel
  const columnKeyPath = kanbanKV.key.boards.columns(boardId, columnId);
  const keysToDelete: string[] = [columnKeyPath];

  // Get all task keys under this column
  const taskPrefix = `${columnKeyPath}/tasks/`;
  for await (const key of kanbanKV.raw.keys(taskPrefix)) {
    keysToDelete.push(key);
  }

  await Promise.all(keysToDelete.map((key) => kanbanKV.raw.delete(key)));

  return NextResponse.json({ success: true });
}
