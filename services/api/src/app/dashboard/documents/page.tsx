"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Upload, Loader2 } from "lucide-react";
import { OCR_STATUS_STYLE, DOC_TYPES } from "@/lib/constants";

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
    // Fetch vessels for the upload dialog
    fetch("/api/vessels")
      .then((res) => res.json())
      .then((data) => setVessels(data.vessels || []))
      .catch(() => {});
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
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your document library</p>
        </div>
        <Button size="sm" onClick={() => setShowUpload(true)}>
          <Plus className="size-4 mr-1.5" />
          Upload
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-16 text-center">
          <p className="text-sm text-muted-foreground mb-3">No documents uploaded yet</p>
          <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
            <Upload className="size-4 mr-1.5" />
            Upload your first document
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead>Uploaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Link href={`/dashboard/documents/${doc.id}`} className="font-medium text-foreground hover:underline">
                      {doc.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{doc.docType.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] capitalize ${OCR_STATUS_STYLE[doc.ocrStatus] || ""}`}>
                      {doc.ocrStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{doc.pageCount ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>PDF files up to 500MB</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center text-sm transition-colors ${
              dragOver ? "border-ring bg-muted" : file ? "border-emerald-300 bg-emerald-50" : "border-border"
            }`}
          >
            {file ? (
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <span className="text-muted-foreground">Drop a PDF here or </span>
                <span className="font-medium text-foreground hover:underline">browse</span>
                <input type="file" accept=".pdf" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.pdf$/i, "")); }
                }} className="hidden" />
              </label>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((dt) => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {vessels.length > 0 && (
            <div className="space-y-1.5">
              <Label>Vessel (optional)</Label>
              <Select value={vesselId} onValueChange={setVesselId}>
                <SelectTrigger><SelectValue placeholder="No vessel (fleet-wide)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vessel (fleet-wide)</SelectItem>
                  {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => file && title && onUpload(file, title, docType, vesselId === "none" ? null : vesselId)}
            disabled={!file || !title || uploading}
          >
            {uploading ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Uploading...</> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
