"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
  isLeaf?: boolean;
}

interface TreeViewProps {
  data: TreeNode[];
  onSelect: (path: string) => void;
  selectedPath?: string;
}

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  onSelect: (path: string) => void;
  selectedPath?: string;
}

function TreeNodeItem({ node, level, onSelect, selectedPath }: TreeNodeItemProps) {
  const [isOpen, setIsOpen] = useState(level === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <Button
        variant="ghost"
        className={cn(
          "w-full justify-start h-8 px-2 font-normal",
          isSelected && "bg-accent text-accent-foreground"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (hasChildren) {
            setIsOpen(!isOpen);
          }
          if (node.isLeaf) {
            onSelect(node.path);
          }
        }}
      >
        {hasChildren ? (
          isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 mr-1" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 mr-1" />
          )
        ) : (
          <span className="w-4 mr-1" />
        )}
        {node.isLeaf ? (
          <File className="h-4 w-4 shrink-0 mr-2 text-muted-foreground" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 mr-2 text-blue-500" />
        )}
        <span className="truncate">{node.name}</span>
      </Button>
      {hasChildren && isOpen && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({ data, onSelect, selectedPath }: TreeViewProps) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        No entries yet
      </div>
    );
  }

  return (
    <div className="py-2">
      {data.map((node) => (
        <TreeNodeItem
          key={node.path}
          node={node}
          level={0}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

// Helper function to build tree from flat list of keys
export function buildTree(keys: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  // Sort keys for consistent ordering
  const sortedKeys = [...keys].sort();

  for (const key of sortedKeys) {
    const parts = key.split("/");
    let currentPath = "";
    let currentChildren = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let node = map.get(currentPath);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          isLeaf: isLast,
          children: isLast ? undefined : [],
        };
        map.set(currentPath, node);
        currentChildren.push(node);
      }

      if (!isLast) {
        currentChildren = node.children!;
      }
    }
  }

  return root;
}
