import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";

// Calendário mensal compartilhado (Tarefas e Operação): tarefas por vencimento
// e reuniões, com navegação de mês via querystring (?mes=YYYY-MM).

export type CalendarItem = {
  kind: "task" | "meeting";
  id: string;
  title: string;
  href: string;
  date: Date;
  done?: boolean;
  showTime?: boolean;
};

export function CalendarMonth({
  year,
  month,
  buildHref,
  items,
}: {
  year: number;
  month: number; // 0-indexado
  buildHref: (patch: Record<string, string | null>) => string;
  items: CalendarItem[];
}) {
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const fmt = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = month === 0 ? fmt(year - 1, 11) : fmt(year, month - 1);
  const next = month === 11 ? fmt(year + 1, 0) : fmt(year, month + 1);

  const byDay = new Map<number, CalendarItem[]>();
  for (const item of items) {
    if (item.date.getMonth() !== month || item.date.getFullYear() !== year) continue;
    const d = item.date.getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), item]);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Link href={buildHref({ mes: prev })} className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-white">
          ← anterior
        </Link>
        <p className="text-sm font-semibold capitalize text-zinc-300">
          {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(firstDay)}
        </p>
        <Link href={buildHref({ mes: next })} className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-white">
          próximo →
        </Link>
        {!isCurrentMonth && (
          <Link href={buildHref({ mes: null })} className="text-xs text-emerald-400 hover:underline">
            hoje
          </Link>
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />tarefa/demanda</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-500" />reunião</span>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`min-h-20 rounded-lg border p-1.5 ${
              isCurrentMonth && day === now.getDate() ? "border-emerald-700 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900/40"
            } ${day == null ? "opacity-30" : ""}`}
          >
            {day && (
              <>
                <p className="text-right text-[10px] text-zinc-500">{day}</p>
                <div className="space-y-0.5">
                  {(byDay.get(day) ?? []).slice(0, 4).map((item) => (
                    <Link
                      key={`${item.kind}-${item.id}`}
                      href={item.href}
                      className={`block truncate rounded px-1 py-0.5 text-[10px] ${
                        item.kind === "meeting"
                          ? "bg-purple-950/60 text-purple-300 hover:bg-purple-900/60"
                          : item.done
                            ? "bg-zinc-800 text-zinc-500 line-through"
                            : "bg-sky-950/60 text-sky-300 hover:bg-sky-900/60"
                      }`}
                    >
                      {item.showTime ? `${timeFmt.format(item.date)} ` : ""}
                      {item.title}
                    </Link>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 4 && (
                    <p className="text-[10px] text-zinc-500">+{byDay.get(day)!.length - 4}</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="mt-4">
          <EmptyState icon="🗓️" title="Nada com prazo neste mês" />
        </div>
      )}
    </div>
  );
}
