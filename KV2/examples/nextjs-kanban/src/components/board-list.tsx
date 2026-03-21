"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, LayoutDashboard } from "lucide-react";
import type { Board } from "@/lib/kv";

export function BoardList({
  onSelectBoard,
  selectedBoardId,
}: {
  onSelectBoard: (id: string) => void;
  selectedBoardId: string | null;
}) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardDescription, setNewBoardDescription] = useState("");

  const fetchBoards = useCallback(async () => {
    const res = await fetch("/api/boards");
    if (res.ok) {
      const json = await res.json();
      setBoards(json.boards);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const createBoard = async () => {
    if (!newBoardName.trim()) return;

    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newBoardName,
        description: newBoardDescription || undefined,
      }),
    });

    if (res.ok) {
      const { board } = await res.json();
      setNewBoardName("");
      setNewBoardDescription("");
      setShowCreate(false);
      fetchBoards();
      onSelectBoard(board.id);
    }
  };

  const deleteBoard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this board and all its data?")) return;

    await fetch(`/api/boards?id=${id}`, { method: "DELETE" });
    fetchBoards();
    if (selectedBoardId === id) {
      onSelectBoard("");
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-zinc-500 text-sm">Loading boards...</div>
    );
  }

  return (
    <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 h-full flex flex-col">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <LayoutDashboard size={20} />
          Boards
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {boards.length === 0 && !showCreate && (
          <p className="text-sm text-zinc-500 p-2">No boards yet. Create one!</p>
        )}

        {boards.map((board) => (
          <div
            key={board.id}
            onClick={() => onSelectBoard(board.id)}
            className={`
              group flex items-center justify-between p-3 rounded-lg cursor-pointer mb-1
              ${
                selectedBoardId === board.id
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }
            `}
          >
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{board.name}</p>
              {board.description && (
                <p className="text-xs text-zinc-500 truncate">{board.description}</p>
              )}
            </div>
            <button
              onClick={(e) => deleteBoard(board.id, e)}
              className="p-1 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete board"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {showCreate && (
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
            <input
              type="text"
              placeholder="Board name..."
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createBoard();
                if (e.key === "Escape") setShowCreate(false);
              }}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <input
              type="text"
              placeholder="Description (optional)..."
              value={newBoardDescription}
              onChange={(e) => setNewBoardDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createBoard();
                if (e.key === "Escape") setShowCreate(false);
              }}
              className="w-full px-3 py-2 text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={createBoard}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!showCreate && (
        <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full p-2 flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
          >
            <Plus size={16} />
            New Board
          </button>
        </div>
      )}
    </div>
  );
}
