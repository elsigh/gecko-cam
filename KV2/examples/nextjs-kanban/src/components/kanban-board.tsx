"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
import type { Board, Column, Task, ColumnMetadata, TaskMetadata } from "@/lib/kv";

type ColumnWithTasks = {
  column: Column;
  metadata: ColumnMetadata;
  tasks: Array<{ task: Task; metadata: TaskMetadata }>;
};

type FullBoard = {
  board: Board;
  columns: ColumnWithTasks[];
};

export function KanbanBoard({ boardId }: { boardId: string }) {
  const [data, setData] = useState<FullBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [newColumnName, setNewColumnName] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);

  const fetchBoard = useCallback(async () => {
    const res = await fetch(`/api/boards?id=${boardId}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const addTask = async (columnId: string) => {
    const title = newTaskTitle[columnId]?.trim();
    if (!title) return;

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, columnId, title }),
    });

    setNewTaskTitle((prev) => ({ ...prev, [columnId]: "" }));
    fetchBoard();
  };

  const deleteTask = async (columnId: string, taskId: string) => {
    await fetch(`/api/tasks?boardId=${boardId}&columnId=${columnId}&taskId=${taskId}`, {
      method: "DELETE",
    });
    fetchBoard();
  };

  const moveTask = async (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    order: number
  ) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId,
        columnId: fromColumnId,
        taskId,
        toColumnId,
        order,
      }),
    });
    fetchBoard();
  };

  const addColumn = async () => {
    if (!newColumnName.trim()) return;

    await fetch("/api/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, name: newColumnName }),
    });

    setNewColumnName("");
    setShowAddColumn(false);
    fetchBoard();
  };

  const deleteColumn = async (columnId: string) => {
    if (!confirm("Delete this column and all its tasks?")) return;

    await fetch(`/api/columns?boardId=${boardId}&columnId=${columnId}`, {
      method: "DELETE",
    });
    fetchBoard();
  };

  const updateTaskPriority = async (
    columnId: string,
    taskId: string,
    priority: "low" | "medium" | "high"
  ) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, columnId, taskId, priority }),
    });
    fetchBoard();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading board...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Board not found</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{data.board.name}</h1>
        {data.board.description && (
          <p className="text-zinc-500 mt-1">{data.board.description}</p>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {data.columns.map((col, colIndex) => (
          <div
            key={col.column.id}
            className="flex-shrink-0 w-72 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                {col.column.name}
                <span className="ml-2 text-zinc-400">({col.tasks.length})</span>
              </h2>
              <button
                onClick={() => deleteColumn(col.column.id)}
                className="p-1 text-zinc-400 hover:text-red-500 rounded"
                title="Delete column"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Tasks */}
            <div className="space-y-2 min-h-[100px]">
              {col.tasks.map((t, taskIndex) => (
                <TaskCard
                  key={t.task.id}
                  task={t.task}
                  metadata={t.metadata}
                  onDelete={() => deleteTask(col.column.id, t.task.id)}
                  onMoveLeft={
                    colIndex > 0
                      ? () =>
                          moveTask(
                            t.task.id,
                            col.column.id,
                            data.columns[colIndex - 1].column.id,
                            data.columns[colIndex - 1].tasks.length
                          )
                      : undefined
                  }
                  onMoveRight={
                    colIndex < data.columns.length - 1
                      ? () =>
                          moveTask(
                            t.task.id,
                            col.column.id,
                            data.columns[colIndex + 1].column.id,
                            data.columns[colIndex + 1].tasks.length
                          )
                      : undefined
                  }
                  onMoveUp={
                    taskIndex > 0
                      ? () =>
                          moveTask(
                            t.task.id,
                            col.column.id,
                            col.column.id,
                            taskIndex - 1
                          )
                      : undefined
                  }
                  onMoveDown={
                    taskIndex < col.tasks.length - 1
                      ? () =>
                          moveTask(
                            t.task.id,
                            col.column.id,
                            col.column.id,
                            taskIndex + 1
                          )
                      : undefined
                  }
                  onPriorityChange={(p) =>
                    updateTaskPriority(col.column.id, t.task.id, p)
                  }
                />
              ))}
            </div>

            {/* Add Task Form */}
            <div className="mt-3">
              <input
                type="text"
                placeholder="Add a task..."
                value={newTaskTitle[col.column.id] || ""}
                onChange={(e) =>
                  setNewTaskTitle((prev) => ({
                    ...prev,
                    [col.column.id]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTask(col.column.id);
                }}
                className="w-full px-3 py-2 text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        ))}

        {/* Add Column */}
        <div className="flex-shrink-0 w-72">
          {showAddColumn ? (
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3">
              <input
                type="text"
                placeholder="Column name..."
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addColumn();
                  if (e.key === "Escape") setShowAddColumn(false);
                }}
                autoFocus
                className="w-full px-3 py-2 text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={addColumn}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddColumn(false)}
                  className="px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddColumn(true)}
              className="w-full p-3 flex items-center justify-center gap-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600"
            >
              <Plus size={18} />
              Add Column
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  metadata,
  onDelete,
  onMoveLeft,
  onMoveRight,
  onMoveUp,
  onMoveDown,
  onPriorityChange,
}: {
  task: Task;
  metadata: TaskMetadata;
  onDelete: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onPriorityChange: (p: "low" | "medium" | "high") => void;
}) {
  const priorityColors = {
    low: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    high: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 shadow-sm border border-zinc-200 dark:border-zinc-700 group">
      <div className="flex items-start gap-2">
        <div className="text-zinc-300 dark:text-zinc-600 cursor-grab">
          <GripVertical size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && (
            <p className="text-xs text-zinc-500 mt-1 truncate">{task.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <select
              value={metadata.priority || "medium"}
              onChange={(e) =>
                onPriorityChange(e.target.value as "low" | "medium" | "high")
              }
              className={`text-xs px-2 py-0.5 rounded ${priorityColors[metadata.priority || "medium"]} border-0 cursor-pointer`}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            {task.assignee && (
              <span className="text-xs text-zinc-500">@{task.assignee}</span>
            )}
          </div>
        </div>
      </div>

      {/* Move/Delete Controls */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-1">
          <button
            onClick={onMoveLeft}
            disabled={!onMoveLeft}
            className="p-1 text-zinc-400 hover:text-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move left"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={onMoveRight}
            disabled={!onMoveRight}
            className="p-1 text-zinc-400 hover:text-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move right"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <button
          onClick={onDelete}
          className="p-1 text-zinc-400 hover:text-red-500"
          title="Delete task"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
