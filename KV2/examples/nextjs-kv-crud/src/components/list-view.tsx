"use client";

import { File, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ListViewProps {
  keys: string[];
  onSelect: (key: string) => void;
  onDelete: (key: string) => void;
  selectedKey?: string;
}

export function ListView({ keys, onSelect, onDelete, selectedKey }: ListViewProps) {
  if (keys.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-8 text-center">
        No entries yet. Create your first entry using the form below.
      </div>
    );
  }

  // Sort keys alphabetically
  const sortedKeys = [...keys].sort();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-full">Key</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedKeys.map((key) => {
          const parts = key.split("/");
          const fileName = parts[parts.length - 1];
          const directory = parts.length > 1 ? parts.slice(0, -1).join("/") : null;

          return (
            <TableRow
              key={key}
              className={cn(
                "cursor-pointer",
                selectedKey === key && "bg-accent"
              )}
              onClick={() => onSelect(key)}
            >
              <TableCell className="font-mono">
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex items-center gap-2 min-w-0">
                    {directory && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {directory}
                      </Badge>
                    )}
                    <span className="truncate">{fileName}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(key);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
