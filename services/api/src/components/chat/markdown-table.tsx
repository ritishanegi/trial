"use client";

import { useState, useRef } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownTableProps {
  children: React.ReactNode;
}

/**
 * Wraps a markdown-rendered table with a "Copy as CSV" button.
 * Captures the rendered DOM and walks it to extract cell text.
 */
export function MarkdownTable({ children }: MarkdownTableProps) {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  function handleCopy() {
    const table = tableRef.current;
    if (!table) return;

    const rows = Array.from(table.querySelectorAll("tr"));
    const csv = rows
      .map((row) =>
        Array.from(row.querySelectorAll("th, td"))
          .map((cell) => {
            const text = cell.textContent?.trim() ?? "";
            // Quote if contains comma, quote, or newline
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(",")
      )
      .join("\n");

    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-3 rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>Table</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
          aria-label="Copy table as CSV"
        >
          {copied ? (
            <>
              <Check className="size-3" /> Copied as CSV
            </>
          ) : (
            <>
              <Copy className="size-3" /> Copy as CSV
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm border-collapse">
          {children}
        </table>
      </div>
    </div>
  );
}
