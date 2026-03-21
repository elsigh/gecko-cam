"use client";

import { useState } from "react";
import { BoardList } from "@/components/board-list";
import { KanbanBoard } from "@/components/kanban-board";

export default function Home() {
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  return (
    <div className="flex h-screen">
      <BoardList
        onSelectBoard={setSelectedBoardId}
        selectedBoardId={selectedBoardId}
      />

      <div className="flex-1 overflow-auto">
        {selectedBoardId ? (
          <KanbanBoard boardId={selectedBoardId} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Welcome to Kanban</h2>
              <p>Select a board from the sidebar or create a new one.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
