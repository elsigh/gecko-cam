"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Search, Database, List, FolderTree, Trash2 } from "lucide-react";
import { ListView } from "./list-view";
import { TreeView, buildTree } from "./tree-view";
import { EntryForm } from "./entry-form";

interface KVEntry {
  key: string;
  value: unknown;
  metadata?: unknown;
}

export function KVBrowser() {
  const [keys, setKeys] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [selectedEntry, setSelectedEntry] = useState<KVEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kv");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      console.error("Failed to fetch keys:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntry = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEntry(data);
      }
    } catch (err) {
      console.error("Failed to fetch entry:", err);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  useEffect(() => {
    if (selectedKey) {
      fetchEntry(selectedKey);
    } else {
      setSelectedEntry(null);
    }
  }, [selectedKey, fetchEntry]);

  const handleSave = async (key: string, value: unknown, metadata?: unknown) => {
    const res = await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, metadata }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to save");
    }

    await fetchKeys();
    if (key === selectedKey) {
      await fetchEntry(key);
    }
  };

  const handleDelete = async (key: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      if (selectedKey === key) {
        setSelectedKey(undefined);
        setSelectedEntry(null);
      }
      await fetchKeys();
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
      setDeleteDialog(null);
    }
  };

  const handleClear = () => {
    setSelectedKey(undefined);
    setSelectedEntry(null);
  };

  // Filter keys based on search
  const filteredKeys = searchQuery
    ? keys.filter((k) => k.toLowerCase().includes(searchQuery.toLowerCase()))
    : keys;

  const treeData = buildTree(filteredKeys);

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Database className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">KV2 Browser</h1>
        </div>
        <p className="text-muted-foreground">
          Manage your key-value store with an intuitive CRUD interface
        </p>
      </div>

      <div className="grid lg:grid-cols-[400px_1fr] gap-6">
        {/* Left Panel - Keys Browser */}
        <Card className="lg:h-[calc(100vh-200px)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Keys
                <Badge variant="secondary">{filteredKeys.length}</Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchKeys}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search keys..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <Tabs defaultValue="list" className="w-full">
              <div className="px-4 pt-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="list" className="gap-2">
                    <List className="h-4 w-4" />
                    List
                  </TabsTrigger>
                  <TabsTrigger value="tree" className="gap-2">
                    <FolderTree className="h-4 w-4" />
                    Tree
                  </TabsTrigger>
                </TabsList>
              </div>
              <ScrollArea className="h-[calc(100vh-420px)]">
                <TabsContent value="list" className="m-0">
                  <ListView
                    keys={filteredKeys}
                    onSelect={setSelectedKey}
                    onDelete={(key) => setDeleteDialog(key)}
                    selectedKey={selectedKey}
                  />
                </TabsContent>
                <TabsContent value="tree" className="m-0 px-2">
                  <TreeView
                    data={treeData}
                    onSelect={setSelectedKey}
                    selectedPath={selectedKey}
                  />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right Panel - Entry Form & Details */}
        <div className="space-y-6">
          <EntryForm
            selectedKey={selectedKey}
            selectedValue={selectedEntry?.value}
            selectedMetadata={selectedEntry?.metadata}
            onSave={handleSave}
            onClear={handleClear}
            isLoading={loading}
          />

          {selectedEntry && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Entry Preview</CardTitle>
                <CardDescription>
                  Raw JSON representation of the stored value
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <ScrollArea className="h-[200px]">
                  <pre className="text-sm font-mono bg-muted p-4 rounded-lg overflow-auto">
                    {JSON.stringify(
                      {
                        key: selectedEntry.key,
                        value: selectedEntry.value,
                        metadata: selectedEntry.metadata,
                      },
                      null,
                      2
                    )}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Entry
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <code className="bg-muted px-1 py-0.5 rounded">{deleteDialog}</code>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && handleDelete(deleteDialog)}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
