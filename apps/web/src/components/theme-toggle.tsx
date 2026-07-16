"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

// Alternador de tema: Auto (segue o sistema) → Claro → Escuro → Auto.
// A preferência fica em localStorage; o script anti-flash no root layout aplica
// data-theme antes da pintura para não piscar.

type Mode = "auto" | "light" | "dark";
const ORDER: Mode[] = ["auto", "light", "dark"];
const META: Record<Mode, { icon: IconName; label: string }> = {
  auto: { icon: "themeAuto", label: "Tema: automático (segue o sistema)" },
  light: { icon: "sun", label: "Tema: claro" },
  dark: { icon: "moon", label: "Tema: escuro" },
};

function applyMode(mode: Mode) {
  const el = document.documentElement;
  if (mode === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cop_theme");
    // hidrata a preferência salva após a montagem (evita mismatch de SSR)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "light" || stored === "dark" || stored === "auto") setMode(stored);
    setMounted(true);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
    setMode(next);
    try {
      localStorage.setItem("cop_theme", next);
    } catch {
      /* modo privado / storage bloqueado — só não persiste */
    }
    applyMode(next);
  }

  // Antes de hidratar mostramos "auto" (neutro) para não divergir do servidor.
  const m = META[mounted ? mode : "auto"];
  return (
    <button
      type="button"
      onClick={cycle}
      title={m.label}
      aria-label={m.label}
      className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
    >
      <Icon name={m.icon} />
    </button>
  );
}
