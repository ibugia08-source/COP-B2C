"use client";

import { useRef } from "react";

/**
 * "Pegar e arrastar" o quadro do Kanban para rolar na horizontal (pan).
 *
 * Convive com o drag-and-drop de cards: o pan só começa quando o clique NÃO foi
 * num card arrastável nem num controle (link, botão, campo). Sem isso, arrastar
 * um card também rolaria o quadro.
 *
 * Também ignora um micro-movimento (4px) para não atrapalhar cliques normais.
 */
export function useBoardPan<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0 });

  function onPointerDown(e: React.PointerEvent<T>) {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    const target = e.target as HTMLElement;
    // não sequestra o arraste do card nem interações de controles
    if (target.closest('[draggable="true"], a, button, input, select, textarea, [role="button"]')) return;
    // evita que o arraste vire seleção de texto
    e.preventDefault();
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft };
  }

  function onPointerMove(e: React.PointerEvent<T>) {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) < 4) return;
    el.scrollLeft = d.startScroll - dx;
  }

  function stop() {
    drag.current.active = false;
  }

  return {
    ref,
    panProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
    },
  };
}
