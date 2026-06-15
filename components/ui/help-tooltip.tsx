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
        className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-border bg-background text-muted-foreground text-[11px] font-semibold leading-none hover:border-primary hover:bg-primary/10 hover:text-primary transition-colors shrink-0 select-none"
        aria-label={`Ayuda: ${titulo}`}
      >
        ?
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
