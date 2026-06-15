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
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center justify-center h-[22px] w-[22px] rounded-full border border-[#7C3AED]/40 bg-background text-[#7C3AED] text-[11px] font-bold leading-none shadow-sm shadow-[#7C3AED]/10 hover:bg-[#7C3AED] hover:text-white hover:border-[#7C3AED] transition-all shrink-0 select-none"
        aria-label={`Ayuda: ${titulo}`}
      >
        i
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{titulo}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {explicacion}
          </p>

          <div className="bg-muted/60 rounded-xl p-3.5 border border-border">
            <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-line">
              {ejemplo}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
