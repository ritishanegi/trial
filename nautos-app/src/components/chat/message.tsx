"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
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
  imageUrl?: string | null;
}

export function Message({ role, content, sources, streaming, imageUrl }: MessageProps) {
  const [copied, setCopied] = useState(false);

  function handleCopyMessage() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-[#f5a623] text-[#0a1628] px-3.5 py-2.5 text-sm font-medium whitespace-pre-wrap flex flex-col gap-2">
          {imageUrl && (
            <img src={imageUrl} alt="User upload" className="rounded-md max-h-64 object-contain self-end border border-black/10" />
          )}
          {content && <span>{content}</span>}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="group max-w-[90%] relative">
      {/* Copy button */}
      {content && !streaming && (
        <button
          onClick={handleCopyMessage}
          className="absolute -right-1 top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-white/[0.07] text-white/30 hover:text-white/60"
          aria-label="Copy message"
          title="Copy message"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      )}

      <div
        className="
          text-sm leading-relaxed text-[#c8deff] prose prose-invert prose-sm max-w-none
          prose-headings:font-semibold prose-headings:text-[#e8f0ff]
          prose-p:my-2 prose-p:text-[#c8deff]
          prose-li:my-0.5 prose-li:text-[#c8deff]
          prose-strong:text-[#e8f0ff] prose-strong:font-semibold
          prose-em:text-[#a8c4f0]
          prose-code:text-[#7dd3fc] prose-code:bg-white/[0.07]
          prose-code:px-1 prose-code:py-0.5 prose-code:rounded
          prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none
          prose-a:text-[#f5a623] prose-a:no-underline hover:prose-a:underline
          prose-blockquote:border-l-[#f5a623]/40 prose-blockquote:text-white/50
          prose-hr:border-white/[0.08]
          prose-ol:text-[#c8deff] prose-ul:text-[#c8deff]
        "
      >
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
            thead({ children }) {
              return <thead className="bg-white/[0.05]">{children}</thead>;
            },
            tbody({ children }) {
              return <tbody>{children}</tbody>;
            },
            tr({ children }) {
              return (
                <tr className="border-b border-white/[0.07] last:border-0">
                  {children}
                </tr>
              );
            },
            th({ children }) {
              return (
                <th className="text-left font-medium px-3 py-2 text-xs text-[#e8f0ff]">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="px-3 py-2 text-xs align-top text-[#c8deff]">
                  {children}
                </td>
              );
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
            <span
              key={si}
              className="inline-flex items-center gap-1 text-[11px] font-normal px-2.5 py-1 rounded-full border border-white/[0.1] bg-white/[0.04] text-white/50 tracking-wide"
            >
              {src.title}
              {src.page_number ? `, p.${src.page_number}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}