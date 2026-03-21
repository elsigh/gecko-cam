import { codeToHtml } from "shiki";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownProps {
  content: string;
}

// Map common language aliases
function normalizeLanguage(lang: string | undefined): string {
  if (!lang) return "text";

  const aliases: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    py: "python",
    rb: "ruby",
    rs: "rust",
    md: "markdown",
  };

  return aliases[lang.toLowerCase()] || lang.toLowerCase();
}

// Pre-process markdown to extract and highlight code blocks
async function highlightCodeBlocks(content: string): Promise<Map<string, string>> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const highlights = new Map<string, string>();

  const matches = [...content.matchAll(codeBlockRegex)];

  await Promise.all(
    matches.map(async (match) => {
      const [fullMatch, lang, code] = match;
      const language = normalizeLanguage(lang);
      const trimmedCode = code.trim();

      try {
        const html = await codeToHtml(trimmedCode, {
          lang: language,
          theme: "github-dark-default",
        });
        highlights.set(fullMatch, html);
      } catch {
        // Fallback for unsupported languages
        const html = await codeToHtml(trimmedCode, {
          lang: "text",
          theme: "github-dark-default",
        });
        highlights.set(fullMatch, html);
      }
    })
  );

  return highlights;
}

export async function Markdown({ content }: MarkdownProps) {
  // Pre-highlight all code blocks
  const highlights = await highlightCodeBlocks(content);

  // Create components with access to pre-highlighted code
  const components: Components = {
    pre: ({ children, ...props }) => {
      // The pre element wraps code, we handle it in the code component
      return <>{children}</>;
    },
    code: ({ className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || "");
      const isInline = !match && !className;

      if (isInline) {
        // Inline code
        return (
          <code className="inline-code" {...props}>
            {children}
          </code>
        );
      }

      // Find the pre-highlighted HTML for this code block
      const codeContent = String(children).trim();
      const lang = match?.[1] || "";

      // Search for matching highlight
      for (const [key, html] of highlights) {
        if (key.includes(codeContent.slice(0, 50))) {
          return (
            <div
              className="shiki-wrapper"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
      }

      // Fallback if no match found
      return (
        <pre className="fallback-pre">
          <code {...props}>{children}</code>
        </pre>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
