"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { ROLE_NAMES, type RoleName } from "@/db/schema";
import { ACCESS_LEVEL_PRESETS, ROLE_LABELS } from "@/lib/auth/permissions";
import { Alert, Badge, Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import {
  approveUser,
  createTeamMember,
  rejectUser,
  toggleMemberActive,
  updateUserRoles,
  type ActionState,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-500";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Pendente", cls: "bg-amber-950 text-amber-300" },
  ATIVO: { label: "Ativo", cls: "bg-emerald-950 text-emerald-300" },
  INATIVO: { label: "Inativo", cls: "bg-zinc-800 text-zinc-400" },
  REJEITADO: { label: "Recusado", cls: "bg-red-950 text-red-300" },
};

// Seletor de nível de acesso reutilizado em criação, aprovação e edição.
function RoleSelector({
  selected,
  onChange,
}: {
  selected: RoleName[];
  onChange: (roles: RoleName[]) => void;
}) {
  function toggle(role: RoleName) {
    onChange(selected.includes(role) ? selected.filter((r) => r !== role) : [...selected, role]);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ACCESS_LEVEL_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange(preset.roles)}
            title={preset.description}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-600 hover:text-emerald-300"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {ROLE_NAMES.map((role) => (
          <label
            key={role}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 has-[:checked]:border-emerald-500 has-[:checked]:text-emerald-300"
          >
            <input
              type="checkbox"
              checked={selected.includes(role)}
              onChange={() => toggle(role)}
              className="accent-emerald-500"
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criar colaborador (admin cria já ativo)
// ---------------------------------------------------------------------------

export function MemberForm() {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<RoleName[]>([]);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTeamMember, {});

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        {open ? "Fechar" : "+ Novo colaborador"}
      </button>

      {open && (
        <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-2">
          {roles.map((r) => (
            <input key={r} type="hidden" name="roles" value={r} />
          ))}
          <div>
            <label className="mb-1 block text-sm text-zinc-300" htmlFor="name">Nome *</label>
            <input id="name" name="name" required className={inputClass} placeholder="Nome completo" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300" htmlFor="email">E-mail *</label>
            <input id="email" name="email" type="email" required className={inputClass} placeholder="pessoa@b2cgestao.com.br" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300" htmlFor="phone">Telefone</label>
            <input id="phone" name="phone" className={inputClass} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300" htmlFor="position">Cargo</label>
            <input id="position" name="position" className={inputClass} placeholder="Ex.: Gestor de Tráfego" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300" htmlFor="password">Senha inicial *</label>
            <input id="password" name="password" type="password" required minLength={8} className={inputClass} placeholder="Mínimo 8 caracteres" />
          </div>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Nível de acesso *</span>
            <RoleSelector selected={roles} onChange={setRoles} />
          </div>

          {state.error && <div className="sm:col-span-2"><Alert>{state.error}</Alert></div>}
          {state.success && <div className="sm:col-span-2"><Alert tone="green">{state.success}</Alert></div>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {pending ? "Salvando..." : "Cadastrar colaborador"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aprovação de cadastros pendentes
// ---------------------------------------------------------------------------

export function PendingRow({ user }: { user: { id: string; email: string; name: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<RoleName[]>(["GESTOR_TRAFEGO"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionState>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-zinc-100">{user.email}</p>
          <p className="text-xs text-zinc-500">Solicitou acesso · aguardando aprovação</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>Aprovar</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectUser(user.id))}>
            Recusar
          </Button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Aprovar acesso — ${user.email}`}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Defina o nível de acesso do novo usuário:</p>
          <RoleSelector selected={roles} onChange={setRoles} />
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={pending} onClick={() => run(() => approveUser(user.id, roles))}>
              {pending ? "Aprovando..." : "Aprovar acesso"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Linha de membro (status + editar nível + ativar/desativar)
// ---------------------------------------------------------------------------

type MemberInfo = {
  id: string;
  name: string;
  email: string;
  status: string;
  isActive: boolean;
  position: string | null;
  roles: RoleName[];
  isSelf: boolean;
};

export function MemberRow({
  member,
  canUpdate,
  canDeactivate,
}: {
  member: MemberInfo;
  canUpdate: boolean;
  canDeactivate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [roles, setRoles] = useState<RoleName[]>(member.roles);
  const meta = STATUS_META[member.status] ?? STATUS_META.INATIVO;

  function run(fn: () => Promise<ActionState>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        onOk?.();
        router.refresh();
      }
    });
  }

  return (
    <tr className={member.isActive ? "" : "opacity-60"}>
      <td className="px-4 py-3 font-medium">
        {member.name}
        {member.isSelf && <span className="ml-2 text-xs text-zinc-500">(você)</span>}
      </td>
      <td className="px-4 py-3 text-zinc-400">{member.email}</td>
      <td className="px-4 py-3 text-zinc-400">{member.position ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {member.roles.length === 0 && <span className="text-xs text-zinc-600">sem papel</span>}
          {member.roles.map((role) => (
            <Badge key={role} tone="zinc">{ROLE_LABELS[role] ?? role}</Badge>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
      </td>
      {(canUpdate || canDeactivate) && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {canUpdate && (
              <button
                type="button"
                onClick={() => { setError(null); setRoles(member.roles); setEditOpen(true); }}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500"
              >
                Editar nível
              </button>
            )}
            {canDeactivate && !member.isSelf && (
              <button
                type="button"
                onClick={() => run(() => toggleMemberActive(member.id))}
                disabled={pending}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 disabled:opacity-60"
              >
                {pending ? "..." : member.isActive ? "Desativar" : "Reativar"}
              </button>
            )}
          </div>
          {error && <p className="mt-1 text-right text-xs text-red-400">{error}</p>}

          <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Nível de acesso — ${member.name}`}>
            <div className="space-y-4">
              <RoleSelector selected={roles} onChange={setRoles} />
              {error && <Alert>{error}</Alert>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
                <Button disabled={pending} onClick={() => run(() => updateUserRoles(member.id, roles), () => setEditOpen(false))}>
                  {pending ? "Salvando..." : "Salvar nível"}
                </Button>
              </div>
            </div>
          </Modal>
        </td>
      )}
    </tr>
  );
}
