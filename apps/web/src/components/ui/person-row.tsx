"use client";

import { UserAvatar } from "@/components/ui/primitives";

/** Linha de pessoa no card: rótulo/ícone + foto + nome. */
export function PersonRow({
  icon,
  name,
  avatar,
  title,
}: {
  icon: React.ReactNode;
  name: string;
  avatar?: string | null;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400" title={title}>
      <span className="flex w-4 shrink-0 justify-center text-zinc-500">{icon}</span>
      <UserAvatar name={name} size="sm" src={avatar} />
      <span className="truncate">{name}</span>
    </div>
  );
}
