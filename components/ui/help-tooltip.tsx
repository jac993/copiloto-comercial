"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HelpTooltipProps {
  titulo: string;
  explicacion: string;
  ejemplo: string;
}

export function HelpTooltip({ titulo, explicacion, ejemplo }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setOpen(true); } }}
        aria-label={`Ayuda: ${titulo}`}
        className="w-4 h-4 rounded-full bg-orange-200 text-orange-600 text-[10px] font-bold inline-flex items-center justify-center cursor-pointer ml-1.5 hover:bg-orange-300 flex-shrink-0"
      >
        ?
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-sm"
          style={{ borderTop: "3px solid #F97316", borderRadius: "0.75rem" }}
        >
          <DialogHeader>
            <DialogTitle
              className="text-base"
              style={{ color: "#F97316", fontWeight: 700 }}
            >
              {titulo}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {explicacion}
          </p>

          {ejemplo && (
            <div
              style={{
                background: "#FFF7ED",
                borderLeft: "3px solid #F97316",
                borderRadius: "0 0.5rem 0.5rem 0",
                padding: "0.75rem 1rem",
              }}
            >
              <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "#C2410C" }}>
                {ejemplo}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
