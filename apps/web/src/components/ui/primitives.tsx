import Link from "next/link";
import type { ReactNode } from "react";
import { TONE_CLASSES, type Tone } from "@/lib/labels";
import { Icon, type IconName } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  secondary: "border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  ghost: "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100",
} as const;

const BUTTON_SIZES = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "primary",
  size: keyof typeof BUTTON_SIZES = "md",
): string {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
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
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500 disabled:opacity-60";

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
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[tone]}`}
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition group-hover:-translate-y-0.5 group-hover:border-zinc-700">
      <p className="truncate text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
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
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-500">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">{children}</tbody>
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
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon = "envelopeOpen",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-2xl text-zinc-400">
        <Icon name={icon} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-zinc-300">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Skeleton de carregamento (usa a classe .skeleton do globals.css)
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
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
  src,
}: {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
  title?: string;
  /** URL/rota da foto; ausente ou nula cai no fallback de iniciais. */
  src?: string | null;
}) {
  if (!name) return <span className="text-zinc-500">—</span>;
  const sz = size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-16 w-16 text-lg" : "h-8 w-8 text-xs";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        title={title ?? name}
        className={`inline-block shrink-0 rounded-full object-cover ${sz}`}
      />
    );
  }
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  const color = AVATAR_COLORS[(name.charCodeAt(0) + name.length) % AVATAR_COLORS.length];
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
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
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
    <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-14 text-sm text-zinc-500">
      <Spinner /> {label}
    </div>
  );
}
