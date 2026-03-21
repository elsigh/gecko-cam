"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useDocumentHistory,
  useRestoreVersion,
} from "@/lib/hooks/use-documents";
import { History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface DocumentHistoryProps {
  type: string;
  id: string;
  currentVersion: number;
}

export function DocumentHistory({
  type,
  id,
  currentVersion,
}: DocumentHistoryProps) {
  const router = useRouter();
  const { history, isLoading, error, mutate } = useDocumentHistory(type, id);
  const { restoreVersion, isRestoring } = useRestoreVersion(type, id);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const handleRestore = async (version: number) => {
    setRestoringVersion(version);
    try {
      await restoreVersion({ version });
      mutate();
      router.refresh();
    } finally {
      setRestoringVersion(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-zinc-500">
          Loading history...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-red-500">
          Error loading history
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-500">
          No previous versions yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Version History
        </CardTitle>
        <CardDescription>
          Current version: {currentVersion}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.map((entry) => (
          <div
            key={entry.metadata.version}
            className="flex items-center justify-between rounded-md border border-zinc-100 p-3 text-sm dark:border-zinc-800"
          >
            <div>
              <div className="font-medium">
                Version {entry.metadata.version}
              </div>
              <div className="text-xs text-zinc-500">
                {new Date(entry.archivedAt).toLocaleString()}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRestore(entry.metadata.version)}
              disabled={isRestoring}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              {restoringVersion === entry.metadata.version
                ? "Restoring..."
                : "Restore"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
