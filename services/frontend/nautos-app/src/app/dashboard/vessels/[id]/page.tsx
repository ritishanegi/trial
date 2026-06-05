"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, Plus, Loader2, Upload } from "lucide-react";
import { OCR_STATUS_STYLE } from "@/lib/constants";

interface Vessel {
  id: string;
  name: string;
  imo: string | null;
  vesselType: string | null;
  flagState: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Equipment {
  id: string;
  manufacturer: string;
  modelType: string;
  serialNumber: string | null;
}

interface Document {
  id: string;
  title: string;
  docType: string;
  ocrStatus: string;
}

export default function VesselDetailPage() {
  const { id } = useParams();
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEq, setShowAddEq] = useState(false);

  const loadVessel = useCallback(async () => {
    try {
      const res = await fetch(`/api/vessels/${id}`);
      if (res.ok) {
        const data = await res.json();
        setVessel(data.vessel);
        setEquipmentList(data.equipment);
        setDocuments(data.documents);
      }
    } catch {
      // Network error
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadVessel();
  }, [loadVessel]);

  async function handleAddEq(eq: { manufacturer: string; modelType: string; serialNumber: string }) {
    const res = await fetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...eq, vesselId: id }),
    });
    if (res.ok) { setShowAddEq(false); loadVessel(); }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vessel) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Vessel not found
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm mb-6">
        <Link href="/dashboard/vessels" className="text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          <ChevronLeft className="size-4" />Fleet
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground truncate">{vessel.name}</span>
      </div>

      {/* Vessel info */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{vessel.name}</h1>
            <Badge variant={vessel.isActive ? "secondary" : "outline"} className="text-[10px]">
              {vessel.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {vessel.imo && <span>IMO {vessel.imo}</span>}
            {vessel.vesselType && <span>{vessel.vesselType}</span>}
            {vessel.flagState && <span>{vessel.flagState}</span>}
          </div>
        </div>
      </div>

      {/* Equipment */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Equipment ({equipmentList.length})</h2>
          <Button size="sm" variant="outline" onClick={() => setShowAddEq(true)}>
            <Plus className="size-3.5 mr-1" />Add
          </Button>
        </div>
        {equipmentList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No equipment linked yet.</p>
        ) : (
          <div className="space-y-1.5">
            {equipmentList.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{eq.manufacturer} — {eq.modelType}</p>
                  {eq.serialNumber && <p className="text-xs text-muted-foreground">S/N: {eq.serialNumber}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Documents ({documents.length})</h2>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/documents"><Upload className="size-3.5 mr-1" />Upload</Link>
          </Button>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No documents linked yet.</p>
        ) : (
          <div className="space-y-1.5">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/dashboard/documents/${doc.id}`}
                className="flex items-center justify-between border border-border rounded-md px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{doc.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{doc.docType.replace(/_/g, " ")}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize ${OCR_STATUS_STYLE[doc.ocrStatus] || ""}`}>
                  {doc.ocrStatus}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      <AddEquipmentDialog open={showAddEq} onOpenChange={setShowAddEq} onAdd={handleAddEq} />
    </div>
  );
}

function AddEquipmentDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (eq: { manufacturer: string; modelType: string; serialNumber: string }) => void;
}) {
  const [manufacturer, setManufacturer] = useState("");
  const [modelType, setModelType] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  function reset() { setManufacturer(""); setModelType(""); setSerialNumber(""); }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add equipment</DialogTitle>
          <DialogDescription>Link equipment to this vessel</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Manufacturer *</Label>
            <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="MAN B&W" />
          </div>
          <div className="space-y-1.5">
            <Label>Model / Type *</Label>
            <Input value={modelType} onChange={(e) => setModelType(e.target.value)} placeholder="6S60ME-C8.5" />
          </div>
          <div className="space-y-1.5">
            <Label>Serial number</Label>
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="ME-C8-2024-0147" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (manufacturer && modelType) { onAdd({ manufacturer, modelType, serialNumber }); reset(); } }} disabled={!manufacturer || !modelType}>
            Add equipment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
