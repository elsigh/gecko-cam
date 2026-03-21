import { type NextRequest, NextResponse } from "next/server";
import {
  kanbanKV,
  generateId,
  getFullBoard,
  deleteBoard,
  type Board,
} from "@/lib/kv";

// GET /api/boards - List all boards
// GET /api/boards?id=xxx - Get a specific board with columns and tasks
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const fullBoard = await getFullBoard(id);
    if (!fullBoard) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    return NextResponse.json(fullBoard);
  }

  // List all boards using entries() for concurrent fetching
  // Boards are at root level (no "/"), columns/tasks have hierarchical keys
  const boards: Board[] = [];
  for await (const [key, entry] of kanbanKV.raw.entries<Board>()) {
    // Skip hierarchical keys (columns/tasks) - boards are at root level
    if (key.includes("/")) continue;
    boards.push(await entry.value);
  }

  return NextResponse.json({ boards });
}

// POST /api/boards - Create a new board with default columns
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = generateId();
  const now = Date.now();

  const board: Board = {
    id,
    name,
    description,
    createdAt: now,
  };

  // Create board using schema API
  await kanbanKV.set("boards", board, { updatedAt: now }, id);

  // Create default columns using schema key builders
  const defaultColumns = ["To Do", "In Progress", "Done"];
  await Promise.all(
    defaultColumns.map((colName, i) => {
      const colId = generateId();
      const columnKey = kanbanKV.key.boards.columns(id, colId);
      return kanbanKV.raw.set(
        columnKey,
        {
          id: colId,
          boardId: id,
          name: colName,
        },
        { order: i }
      );
    })
  );

  return NextResponse.json({ board }, { status: 201 });
}

// DELETE /api/boards?id=xxx - Delete a board and all its data
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Board ID is required" },
      { status: 400 }
    );
  }

  await deleteBoard(id);

  return NextResponse.json({ success: true });
}
