/**
 * Kanban entity types.
 * Shared between the app and seed script.
 */

export interface Board {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface BoardMetadata {
  updatedAt: number;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
}

export interface ColumnMetadata {
  order: number;
}

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  assignee?: string;
  labels?: string[];
  createdAt: number;
}

export interface TaskMetadata {
  order: number;
  priority?: "low" | "medium" | "high";
}
