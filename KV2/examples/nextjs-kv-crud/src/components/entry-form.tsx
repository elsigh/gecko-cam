"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Plus, X } from "lucide-react";

interface EntryFormProps {
  selectedKey?: string;
  selectedValue?: unknown;
  selectedMetadata?: unknown;
  onSave: (key: string, value: unknown, metadata?: unknown) => Promise<void>;
  onClear: () => void;
  isLoading?: boolean;
}

export function EntryForm({
  selectedKey,
  selectedValue,
  selectedMetadata,
  onSave,
  onClear,
  isLoading,
}: EntryFormProps) {
  const [key, setKey] = useState("");
  const [valueStr, setValueStr] = useState("");
  const [metadataStr, setMetadataStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = !!selectedKey;

  useEffect(() => {
    if (selectedKey) {
      setKey(selectedKey);
      setValueStr(
        typeof selectedValue === "string"
          ? selectedValue
          : JSON.stringify(selectedValue, null, 2)
      );
      setMetadataStr(
        selectedMetadata ? JSON.stringify(selectedMetadata, null, 2) : ""
      );
    } else {
      setKey("");
      setValueStr("");
      setMetadataStr("");
    }
    setError(null);
  }, [selectedKey, selectedValue, selectedMetadata]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!key.trim()) {
      setError("Key is required");
      return;
    }

    // Parse value - try JSON first, fall back to string
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(valueStr);
    } catch {
      // If not valid JSON, treat as plain string
      parsedValue = valueStr;
    }

    // Parse metadata if provided
    let parsedMetadata: unknown;
    if (metadataStr.trim()) {
      try {
        parsedMetadata = JSON.parse(metadataStr);
      } catch {
        setError("Metadata must be valid JSON");
        return;
      }
    }

    setSaving(true);
    try {
      await onSave(key.trim(), parsedValue, parsedMetadata);
      if (!isEditing) {
        setKey("");
        setValueStr("");
        setMetadataStr("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setKey("");
    setValueStr("");
    setMetadataStr("");
    setError(null);
    onClear();
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {isEditing ? (
                <>
                  Edit Entry
                  <Badge variant="secondary">{selectedKey}</Badge>
                </>
              ) : (
                "Create Entry"
              )}
            </CardTitle>
            <CardDescription>
              {isEditing
                ? "Modify the value and metadata for this key"
                : "Add a new key-value pair to the store"}
            </CardDescription>
          </div>
          {isEditing && (
            <Button variant="ghost" size="icon" onClick={handleClear}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              placeholder="e.g., users/123 or config/settings"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isEditing || isLoading}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Use forward slashes (/) for hierarchical organization
            </p>
          </div>

          <Tabs defaultValue="value" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="value">Value</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>
            <TabsContent value="value" className="space-y-2">
              <Label htmlFor="value">Value (JSON or plain text)</Label>
              <Textarea
                id="value"
                placeholder='{"name": "John", "age": 30}'
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                disabled={isLoading}
                className="font-mono min-h-[150px]"
              />
            </TabsContent>
            <TabsContent value="metadata" className="space-y-2">
              <Label htmlFor="metadata">Metadata (optional JSON)</Label>
              <Textarea
                id="metadata"
                placeholder='{"version": 1, "createdAt": "2024-01-01"}'
                value={metadataStr}
                onChange={(e) => setMetadataStr(e.target.value)}
                disabled={isLoading}
                className="font-mono min-h-[150px]"
              />
            </TabsContent>
          </Tabs>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving || isLoading}>
              {saving ? (
                "Saving..."
              ) : isEditing ? (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Update
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </>
              )}
            </Button>
            {(key || valueStr || metadataStr) && (
              <Button type="button" variant="outline" onClick={handleClear}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
