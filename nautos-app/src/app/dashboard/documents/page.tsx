"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, Loader2 } from "lucide-react";
import { OCR_STATUS_STYLE, DOC_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  title: string;
  docType: string;
  scope: string;
  ocrStatus: string;
  pageCount: number | null;
  createdAt: string;
}

interface VesselOption {
  id: string;
  name: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [vessels, setVessels] = useState<VesselOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const fetchDocuments = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetch("/api/vessels")
      .then((res) => res.json())
      .then((data) => setVessels(data.vessels || []))
      .catch(() => { });
  }, [fetchDocuments]);

  async function handleUpload(file: File, title: string, docType: string, vesselId: string | null) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("docType", docType);
    formData.append("scope", vesselId ? "vessel" : "fleet");
    if (vesselId) formData.append("vesselId", vesselId);

    const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
    if (res.ok) { setShowUpload(false); fetchDocuments(); }
    setUploading(false);
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      {/* Background texture */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 80% 100%, rgba(245,166,35,0.04) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 p-6 lg:p-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="h-px w-5 bg-[#f5a623]" />
              <span className="text-[#f5a623] text-[10px] tracking-[0.12em] uppercase">
                Document Library
              </span>
            </div>
            <h1 className="text-[#f0f4ff] text-xl font-semibold">Documents</h1>
            <p className="text-sm text-white/40 mt-0.5">Manage your document library</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-[#f5a623] hover:bg-[#e8971a] text-[#0a1628] text-[13px] font-bold tracking-widest uppercase px-4 py-2 rounded-md transition-colors"
          >
            <Plus className="size-4" />
            Upload
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-5 animate-spin text-white/30" />
          </div>
        ) : documents.length === 0 ? (
          <div className="border border-dashed border-white/[0.1] rounded-lg py-16 text-center bg-white/[0.02]">
            <p className="text-sm text-white/40 mb-4">No documents uploaded yet</p>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-1.5 border border-white/[0.15] hover:border-white/30 text-white/50 hover:text-white/80 text-sm px-4 py-2 rounded-md transition-all"
            >
              <Upload className="size-4" />
              Upload your first document
            </button>
          </div>
        ) : (
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_80px_120px] gap-4 px-5 py-3 border-b border-white/[0.08] bg-white/[0.03]">
              {["Title", "Type", "Status", "Pages", "Uploaded"].map((h, i) => (
                <span
                  key={h}
                  className={cn(
                    "text-[11px] uppercase tracking-[0.08em] text-white/35 font-medium",
                    i === 3 && "text-right"
                  )}
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {documents.map((doc, idx) => (
              <div
                key={doc.id}
                className={cn(
                  "grid grid-cols-[2fr_1fr_1fr_80px_120px] gap-4 px-5 py-3.5 items-center transition-colors hover:bg-white/[0.03]",
                  idx !== documents.length - 1 && "border-b border-white/[0.06]"
                )}
              >
                <Link
                  href={`/dashboard/documents/${doc.id}`}
                  className="text-sm font-medium text-[#c8deff] hover:text-white transition-colors truncate"
                >
                  {doc.title}
                </Link>
                <span className="text-sm text-white/40 capitalize">
                  {doc.docType.replace(/_/g, " ")}
                </span>
                <span>
                  <span
                    className={cn(
                      "inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full border capitalize",
                      doc.ocrStatus === "complete"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : doc.ocrStatus === "processing"
                          ? "border-[#f5a623]/30 bg-[#f5a623]/10 text-[#f5a623]"
                          : "border-white/[0.1] bg-white/[0.04] text-white/40",
                      OCR_STATUS_STYLE[doc.ocrStatus] || ""
                    )}
                  >
                    {doc.ocrStatus}
                  </span>
                </span>
                <span className="text-sm text-white/40 tabular-nums text-right">
                  {doc.pageCount ?? "—"}
                </span>
                <span className="text-sm text-white/40">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <UploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        onUpload={handleUpload}
        uploading={uploading}
        vessels={vessels}
      />
    </div>
  );
}

function UploadDialog({ open, onOpenChange, onUpload, uploading, vessels }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpload: (file: File, title: string, docType: string, vesselId: string | null) => void;
  uploading: boolean;
  vessels: VesselOption[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("maintenance_manual");
  const [vesselId, setVesselId] = useState<string>("none");
  const [dragOver, setDragOver] = useState(false);

  function reset() { setFile(null); setTitle(""); setDocType("maintenance_manual"); setVesselId("none"); }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.toLowerCase().endsWith(".pdf")) {
      setFile(dropped);
      if (!title) setTitle(dropped.name.replace(/\.pdf$/i, ""));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md bg-[#0d1a2e] border-white/[0.1] text-[#f0f4ff]">
        <DialogHeader>
          <DialogTitle className="text-[#f0f4ff]">Upload document</DialogTitle>
          <DialogDescription className="text-white/40">PDF files up to 500MB</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center text-sm transition-all",
              dragOver
                ? "border-[#f5a623]/50 bg-[#f5a623]/05"
                : file
                  ? "border-emerald-500/40 bg-emerald-500/05"
                  : "border-white/[0.1] hover:border-white/[0.2]"
            )}
          >
            {file ? (
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#c8deff] truncate">{file.name}</span>
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-white/40 hover:text-white/70 ml-3 shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <span className="text-white/40">Drop a PDF here or </span>
                <span className="font-medium text-[#f5a623] hover:underline">browse</span>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.pdf$/i, "")); }
                  }}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.08em] text-white/50">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              className="bg-white/[0.05] border-white/[0.1] text-[#f0f4ff] placeholder:text-white/25 focus:border-[#f5a623]/50"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.08em] text-white/50">Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="bg-white/[0.05] border-white/[0.1] text-white/70">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1a2e] border-white/[0.1] text-white/70">
                {DOC_TYPES.map((dt) => (
                  <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vessel */}
          {vessels.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.08em] text-white/50">Vessel (optional)</Label>
              <Select value={vesselId} onValueChange={setVesselId}>
                <SelectTrigger className="bg-white/[0.05] border-white/[0.1] text-white/70">
                  <SelectValue placeholder="No vessel (fleet-wide)" />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1a2e] border-white/[0.1] text-white/70">
                  <SelectItem value="none">No vessel (fleet-wide)</SelectItem>
                  {vessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md border border-white/[0.1] text-white/50 hover:text-white/80 hover:border-white/20 text-sm transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => file && title && onUpload(file, title, docType, vesselId === "none" ? null : vesselId)}
            disabled={!file || !title || uploading}
            className="flex items-center gap-1.5 bg-[#f5a623] hover:bg-[#e8971a] disabled:opacity-40 text-[#2865bf] text-sm font-bold tracking-widest uppercase px-4 py-2 rounded-md transition-colors"
          >
            {uploading ? (
              <><Loader2 className="size-4 animate-spin" />Uploading…</>
            ) : (
              "Upload"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}