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
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: 20,
          width: 20,
          borderRadius: "50%",
          border: "1px solid rgba(124,58,237,0.3)",
          background: "#EDE9FE",
          color: "#7C3AED",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          flexShrink: 0,
          userSelect: "none",
          cursor: "pointer",
          transition: "background 200ms, color 200ms, border-color 200ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#7C3AED";
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.borderColor = "#7C3AED";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#EDE9FE";
          e.currentTarget.style.color = "#7C3AED";
          e.currentTarget.style.borderColor = "rgba(124,58,237,0.3)";
        }}
        aria-label={`Ayuda: ${titulo}`}
      >
        ?
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-sm font-sans"
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
