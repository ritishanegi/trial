"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "./code-block";
import { MarkdownTable } from "./markdown-table";

interface Source {
  document_id: string;
  title: string;
  page_number: number | null;
  scope: string;
}

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
}

/**
 * Renders a single chat message. Assistant messages get full markdown
 * support (tables, code blocks, lists) plus a copy-to-clipboard button.
 * User messages stay simple — just the text in a bubble.
 */
export function Message({ role, content, sources, streaming }: MessageProps) {
  const [copied, setCopied] = useState(false);

  function handleCopyMessage() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-primary text-primary-foreground px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="group max-w-[90%] relative">
      {/* Copy button — visible on hover */}
      {content && !streaming && (
        <button
          onClick={handleCopyMessage}
          className="absolute -right-1 top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
          aria-label="Copy message"
          title="Copy message"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      )}

      <div className="text-sm leading-relaxed text-foreground prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-p:my-2 prose-li:my-0.5 prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code(props) {
              const { className, children, ...rest } = props;
              const match = /language-(\w+)/.exec(className || "");
              const isInline = !className;
              if (isInline) {
                return (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                );
              }
              return (
                <CodeBlock
                  language={match?.[1] || ""}
                  value={String(children).replace(/\n$/, "")}
                />
              );
            },
            table({ children }) {
              return <MarkdownTable>{children}</MarkdownTable>;
            },
            // Disable default table wrappers since MarkdownTable provides its own
            thead({ children }) {
              return <thead className="bg-muted/30">{children}</thead>;
            },
            tbody({ children }) {
              return <tbody>{children}</tbody>;
            },
            tr({ children }) {
              return <tr className="border-b border-border last:border-0">{children}</tr>;
            },
            th({ children }) {
              return <th className="text-left font-medium px-3 py-2 text-xs">{children}</th>;
            },
            td({ children }) {
              return <td className="px-3 py-2 text-xs align-top">{children}</td>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sources.map((src, si) => (
            <Badge key={si} variant="secondary" className="text-[11px] font-normal">
              {src.title}
              {src.page_number ? `, p.${src.page_number}` : ""}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
