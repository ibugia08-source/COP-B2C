import Link from "next/link";
import type { ReactNode } from "react";
import { TONE_CLASSES, type Tone } from "@/lib/labels";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-500",
  secondary: "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
  danger: "bg-red-700 text-white hover:bg-red-600",
  ghost: "text-zinc-400 hover:text-white hover:bg-zinc-800",
} as const;

const BUTTON_SIZES = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "primary",
  size: keyof typeof BUTTON_SIZES = "md",
): string {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  href,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  href?: string;
}) {
  const cls = `${buttonClass(variant, size)} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {props.children}
      </Link>
    );
  }
  return <button className={cls} {...props} />;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-500 disabled:opacity-60";

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-zinc-300">
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} min-h-24 ${props.className ?? ""}`} />;
}

export function Field({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge / StatusBadge
// ---------------------------------------------------------------------------

export function Badge({ tone = "zinc", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  value,
  meta,
}: {
  value: string | null | undefined;
  meta: Record<string, { label: string; tone: Tone }>;
}) {
  if (!value) return <span className="text-zinc-500">—</span>;
  const m = meta[value] ?? { label: value, tone: "zinc" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Card / Table / PageHeader / EmptyState / UserAvatar
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "text-zinc-100",
  href,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  href?: string;
  hint?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition group-hover:border-zinc-600">
      <p className="truncate text-xs text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="group block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Table({
  head,
  children,
  minWidth = "640px",
}: {
  head: ReactNode;
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase text-zinc-500">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon = "📭",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 px-6 py-14 text-center">
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-3 text-sm font-semibold text-zinc-300">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-emerald-800",
  "bg-sky-800",
  "bg-purple-800",
  "bg-amber-800",
  "bg-rose-800",
  "bg-cyan-800",
];

export function UserAvatar({
  name,
  size = "md",
  title,
}: {
  name: string | null | undefined;
  size?: "sm" | "md";
  title?: string;
}) {
  if (!name) return <span className="text-zinc-500">—</span>;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  const color = AVATAR_COLORS[(name.charCodeAt(0) + name.length) % AVATAR_COLORS.length];
  const sz = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span
      title={title ?? name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${color} ${sz}`}
    >
      {initials}
    </span>
  );
}

export function Alert({
  tone = "red",
  children,
}: {
  tone?: "red" | "green" | "amber";
  children: ReactNode;
}) {
  const cls = {
    red: "border-red-900 bg-red-950/60 text-red-300",
    green: "border-emerald-900 bg-emerald-950/60 text-emerald-300",
    amber: "border-amber-900 bg-amber-950/60 text-amber-300",
  }[tone];
  return (
    <p role="alert" className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
  );
}

export function LoadingBlock({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-14 text-sm text-zinc-400">
      <Spinner /> {label}
    </div>
  );
}
