// Document types are user-definable (stored as strings, not enum)
// Common types: "page", "post", "article" - but admin can create any

export interface Document {
  id: string;
  type: string; // user-definable: "page", "post", "article", etc.
  title: string;
  slug: string; // unique, URL-friendly
  body: string; // markdown content
  author: string; // user ID
  status: "draft" | "published" | "archived";
  urls: string[]; // additional URLs (serve same content, no redirect)
  createdAt: number;
}

export interface DocumentMetadata {
  updatedAt: number;
  updatedBy: string; // user ID who last modified
  publishedAt?: number;
  version: number; // increments on every save, used for optimistic locking
}

// Version history entry (stored separately)
export interface VersionHistoryEntry {
  document: Document;
  metadata: DocumentMetadata;
  archivedAt: number;
  archivedBy: string; // user who triggered the new version
}

// User
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string; // bcrypt
  role: "admin" | "editor";
  createdAt: number;
}

// Session
export interface Session {
  userId: string;
  username: string;
  role: "admin" | "editor";
  createdAt: number;
  expiresAt: number;
}

// API request/response types
export interface CreateDocumentRequest {
  type: string;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published" | "archived";
  urls?: string[];
}

export interface UpdateDocumentRequest {
  title?: string;
  slug?: string;
  body?: string;
  status?: "draft" | "published" | "archived";
  urls?: string[];
  expectedVersion: number;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  role: "admin" | "editor";
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  role?: "admin" | "editor";
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface DocumentWithMetadata {
  document: Document;
  metadata: DocumentMetadata;
}

export class ConflictError extends Error {
  currentVersion: number;
  expectedVersion: number;

  constructor(opts: {
    message: string;
    currentVersion: number;
    expectedVersion: number;
  }) {
    super(opts.message);
    this.name = "ConflictError";
    this.currentVersion = opts.currentVersion;
    this.expectedVersion = opts.expectedVersion;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
