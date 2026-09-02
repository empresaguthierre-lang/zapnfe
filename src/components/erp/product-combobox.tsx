"use client";

import { useState, useRef, useEffect } from "react";
import type { SelectOption } from "@/lib/erp/shared/types";

export function ProductCombobox({ options, name, defaultValue }: { options: SelectOption[]; name: string; defaultValue?: string }) {
  const [query, setQuery] = useState(() => {
    if (defaultValue) {
      const opt = options.find((o) => o.value === defaultValue);
      return opt ? opt.label : "";
    }
    return "";
  });
  const [selectedId, setSelectedId] = useState(defaultValue || "");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())).slice(0, 50);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }} className="product-combobox">
      <input type="hidden" name={name} value={selectedId} required />
      <input
        type="text"
        placeholder="Digite o código (SKU) ou nome..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        className="select-field"
        required={!selectedId}
      />
      {open && filtered.length > 0 && (
        <ul style={{ position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0, background: "white", border: "1px solid #d7e0e5", borderRadius: "9px", maxHeight: "250px", overflowY: "auto", margin: 0, padding: 0, listStyle: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {filtered.map(opt => (
            <li
              key={opt.value}
              onClick={() => {
                setQuery(opt.label);
                setSelectedId(opt.value);
                setOpen(false);
              }}
              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontSize: "13px" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f7fbfc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
