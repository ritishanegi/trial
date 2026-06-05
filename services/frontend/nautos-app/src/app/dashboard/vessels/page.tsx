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
import { Plus, Loader2, ArrowRight } from "lucide-react";
import { VESSEL_TYPES } from "@/lib/constants";

interface Vessel {
  id: string;
  name: string;
  imo: string | null;
  vesselType: string | null;
  flagState: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function VesselsPage() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchVessels = useCallback(async () => {
    try {
      const res = await fetch("/api/vessels");
      if (res.ok) {
        const data = await res.json();
        setVessels(data.vessels);
      }
    } catch {
      // Network error — vessels stay empty
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVessels();
  }, [fetchVessels]);

  async function handleAdd(v: { name: string; imo: string; vesselType: string; flagState: string }) {
    const res = await fetch("/api/vessels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    if (res.ok) { setShowAdd(false); fetchVessels(); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Fleet</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage vessels and linked equipment</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-1.5" />
          Add vessel
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : vessels.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-16 text-center">
          <p className="text-sm text-muted-foreground mb-3">No vessels added yet</p>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="size-4 mr-1.5" />Add your first vessel
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {vessels.map((v) => (
            <Link
              key={v.id}
              href={`/dashboard/vessels/${v.id}`}
              className="group flex items-center justify-between border border-border rounded-lg px-4 py-3.5 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{v.name}</p>
                    <Badge variant={v.isActive ? "secondary" : "outline"} className="text-[10px]">
                      {v.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {v.imo && <span>IMO {v.imo}</span>}
                    {v.vesselType && <span>{v.vesselType}</span>}
                    {v.flagState && <span>{v.flagState}</span>}
                  </div>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      )}

      <AddVesselDialog open={showAdd} onOpenChange={setShowAdd} onAdd={handleAdd} />
    </div>
  );
}

function AddVesselDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (v: { name: string; imo: string; vesselType: string; flagState: string }) => void;
}) {
  const [name, setName] = useState("");
  const [imo, setImo] = useState("");
  const [vesselType, setVesselType] = useState("");
  const [flagState, setFlagState] = useState("");
  function reset() { setName(""); setImo(""); setVesselType(""); setFlagState(""); }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add vessel</DialogTitle>
          <DialogDescription>Register a new vessel in your fleet</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vessel name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="M/V Pacific Star" />
          </div>
          <div className="space-y-1.5">
            <Label>IMO number</Label>
            <Input value={imo} onChange={(e) => setImo(e.target.value)} placeholder="9274848" />
          </div>
          <div className="space-y-1.5">
            <Label>Vessel type</Label>
            <Select value={vesselType} onValueChange={setVesselType}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {VESSEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Flag state</Label>
            <Input value={flagState} onChange={(e) => setFlagState(e.target.value)} placeholder="Panama" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (name) { onAdd({ name, imo, vesselType, flagState }); reset(); } }} disabled={!name}>
            Add vessel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
