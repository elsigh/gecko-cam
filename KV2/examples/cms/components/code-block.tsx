import { codeToHtml } from "shiki";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export async function CodeBlock({ code, language = "text" }: CodeBlockProps) {
  const html = await codeToHtml(code, {
    lang: language,
    theme: "github-dark-default",
  });

  return (
    <div
      className="shiki-wrapper"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
