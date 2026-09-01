"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FiSearch } from "react-icons/fi";

export function DebouncedSearch({ placeholder = "Buscar..." }: { placeholder?: string }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  useEffect(() => { const timeout = window.setTimeout(() => { const next = new URLSearchParams(params); const clean = value.trim().slice(0, 80); if (clean) next.set("q", clean); else next.delete("q"); next.delete("page"); router.replace(`${pathname}?${next.toString()}`); }, 350); return () => window.clearTimeout(timeout); }, [value, params, pathname, router]);
  return <label className="erp-search"><FiSearch aria-hidden="true" /><span className="sr-only">Buscar</span><input value={value} onChange={(event) => setValue(event.target.value)} maxLength={80} placeholder={placeholder} /></label>;
}
