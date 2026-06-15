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
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "#7C3AED",
          fontSize: 16,
          fontWeight: 900,
          lineHeight: 1,
          cursor: "pointer",
          flexShrink: 0,
          userSelect: "none",
          transition: "color 200ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#5B21B6"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#7C3AED"; }}
        aria-label={`Ayuda: ${titulo}`}
      >
        ?
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-sm"
          style={{ borderTop: "3px solid #7C3AED", borderRadius: "0.75rem" }}
        >
          <DialogHeader>
            <DialogTitle
              className="text-base"
              style={{ color: "#7C3AED", fontWeight: 700 }}
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
                background: "#EDE9FE",
                borderLeft: "3px solid #7C3AED",
                borderRadius: "0 0.5rem 0.5rem 0",
                padding: "0.75rem 1rem",
              }}
            >
              <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "#5B21B6" }}>
                {ejemplo}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
