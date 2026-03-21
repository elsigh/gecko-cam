"use client";

import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  CodeToggle,
  InsertCodeBlock,
  DiffSourceToggleWrapper,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { forwardRef, useState, useEffect, useRef, useCallback } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const MarkdownEditor = forwardRef<MDXEditorMethods, MarkdownEditorProps>(
  function MarkdownEditor({ value, onChange, placeholder }, ref) {
    const [mounted, setMounted] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const initialValueRef = useRef(value);
    const isInitializedRef = useRef(false);

    useEffect(() => {
      setMounted(true);

      // Check for dark mode
      const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      setIsDark(darkModeQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
      };

      darkModeQuery.addEventListener("change", handleChange);
      return () => darkModeQuery.removeEventListener("change", handleChange);
    }, []);

    // Suppress the initial onChange call from MDXEditor
    const handleChange = useCallback((newValue: string) => {
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        if (newValue === initialValueRef.current) {
          return;
        }
      }
      onChange(newValue);
    }, [onChange]);

    // Show a placeholder during SSR and initial mount
    if (!mounted) {
      return (
        <div className="markdown-editor-wrapper markdown-editor-loading">
          <div className="min-h-[400px] p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
            <div className="h-10 rounded mb-4 bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-2">
              <div className="h-4 rounded w-3/4 bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 rounded w-1/2 bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 rounded w-5/6 bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </div>
        </div>
      );
    }

    // Determine dark mode class - use media query result
    const darkClass = isDark ? "dark-theme" : "";

    return (
      <div className={`markdown-editor-wrapper ${darkClass}`}>
        <MDXEditor
          ref={ref}
          className={isDark ? "dark-theme dark-editor" : ""}
          markdown={value}
          onChange={handleChange}
          placeholder={placeholder}
          contentEditableClassName="prose prose-zinc dark:prose-invert max-w-none min-h-[400px] focus:outline-none"
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            linkPlugin(),
            linkDialogPlugin(),
            imagePlugin(),
            tablePlugin(),
            codeBlockPlugin({ defaultCodeBlockLanguage: "typescript" }),
            codeMirrorPlugin({
              codeBlockLanguages: {
                js: "JavaScript",
                javascript: "JavaScript",
                ts: "TypeScript",
                typescript: "TypeScript",
                tsx: "TSX",
                jsx: "JSX",
                css: "CSS",
                html: "HTML",
                json: "JSON",
                bash: "Bash",
                shell: "Shell",
                python: "Python",
                go: "Go",
                rust: "Rust",
                sql: "SQL",
                yaml: "YAML",
                markdown: "Markdown",
                "": "Plain Text",
              },
            }),
            diffSourcePlugin({ viewMode: "rich-text" }),
            frontmatterPlugin(),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <DiffSourceToggleWrapper>
                    <UndoRedo />
                    <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <BoldItalicUnderlineToggles />
                    <CodeToggle />
                    <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <BlockTypeSelect />
                    <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <ListsToggle />
                    <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <CreateLink />
                    <InsertImage />
                    <InsertTable />
                    <InsertThematicBreak />
                    <InsertCodeBlock />
                  </DiffSourceToggleWrapper>
                </>
              ),
            }),
          ]}
        />
      </div>
    );
  }
);
