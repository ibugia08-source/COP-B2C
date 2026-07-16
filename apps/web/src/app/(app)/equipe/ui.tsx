"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { CARGO_NAMES, type CargoName } from "@/db/schema";
import {
  cargoDefaultPermissions,
  CARGO_LABELS,
  FEATURE_LABELS,
  FEATURES,
  PERMISSION_KEYS,
  PERMISSION_META,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { Alert, Badge, Button, UserAvatar } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icon";
import {
  approveUser,
  changeCargo,
  createTeamMember,
  deleteTeamMember,
  grantPermission,
  rejectUser,
  removeMemberAvatar,
  revokePermission,
  toggleMemberActive,
  updateMemberProfile,
  uploadMemberAvatar,
  type ActionState,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Pendente", cls: "bg-amber-950 text-amber-300" },
  ATIVO: { label: "Ativo", cls: "bg-emerald-950 text-emerald-300" },
  INATIVO: { label: "Inativo", cls: "bg-zinc-800 text-zinc-400" },
  REJEITADO: { label: "Recusado", cls: "bg-red-950 text-red-300" },
};

// Seletor de cargo único.
function CargoSelect({
  value,
  onChange,
  disabled,
}: {
  value: CargoName | "";
  onChange: (c: CargoName) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CargoName)}
      className={inputClass}
    >
      <option value="" disabled>
        Selecione o cargo…
      </option>
      {CARGO_NAMES.map((c) => (
        <option key={c} value={c}>
          {CARGO_LABELS[c]}
        </option>
      ))}
    </select>
  );
}

// Painel de permissões: mostra as que vêm do cargo (padrão, travadas) e permite
// conceder/remover as EXTRAS. Organizado por feature, com busca.
function PermissionsPanel({
  userId,
  cargo,
  extras,
}: {
  userId: string;
  cargo: CargoName | null;
  extras: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [hideDefault, setHideDefault] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ key: PermissionKey; label: string } | null>(null);

  const defaults = useMemo(() => new Set(cargoDefaultPermissions(cargo)), [cargo]);
  const extraSet = useMemo(() => new Set(extras), [extras]);
  const q = query.trim().toLowerCase();

  function toggle(key: PermissionKey, grant: boolean) {
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      const res = grant ? await grantPermission(userId, key) : await revokePermission(userId, key);
      setPendingKey(null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  // Conceder algo de ALTO RISCO pede confirmação; conceder/remover o resto é direto.
  function requestToggle(key: PermissionKey, grant: boolean) {
    if (grant && PERMISSION_META[key].risk === "high") {
      setConfirm({ key, label: PERMISSION_META[key].label });
      return;
    }
    toggle(key, grant);
  }

  function toggleCollapse(feature: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature);
      else next.add(feature);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-zinc-300">Permissões extras (além do cargo)</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <input type="checkbox" checked={hideDefault} onChange={(e) => setHideDefault(e.target.checked)} className="accent-emerald-500" />
            Ocultar padrão do cargo
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar permissão…"
            className="w-44 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        {FEATURES.map((feature) => {
          const keys = PERMISSION_KEYS.filter(
            (k) =>
              PERMISSION_META[k].feature === feature &&
              (!q || PERMISSION_META[k].label.toLowerCase().includes(q) || k.includes(q)) &&
              (!hideDefault || !defaults.has(k) || extraSet.has(k)),
          );
          if (keys.length === 0) return null;
          const grantedCount = keys.filter((k) => extraSet.has(k) && !defaults.has(k)).length;
          const isCollapsed = collapsed.has(feature) && !q;
          return (
            <div key={feature} className="rounded-md border border-zinc-800/70">
              <button
                type="button"
                onClick={() => toggleCollapse(feature)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between px-2 py-1.5 text-left transition hover:bg-zinc-900/50"
              >
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <Icon name="chevronDown" className={`text-[8px] transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  {FEATURE_LABELS[feature]}
                </span>
                {grantedCount > 0 && <Badge tone="green">{grantedCount} extra(s)</Badge>}
              </button>
              {!isCollapsed && (
                <div className="space-y-1 px-2 pb-2">
                  {keys.map((key) => {
                    const meta = PERMISSION_META[key];
                    const isDefault = defaults.has(key);
                    const isExtra = extraSet.has(key);
                    const checked = isDefault || isExtra;
                    const busy = pendingKey === key;
                    return (
                      <label
                        key={key}
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${
                          isDefault ? "opacity-70" : "hover:bg-zinc-900"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isDefault || busy}
                            onChange={(e) => requestToggle(key, e.target.checked)}
                            className="accent-emerald-500"
                          />
                          <span className={meta.risk === "high" ? "text-amber-300" : "text-zinc-200"}>
                            {meta.label}
                          </span>
                          {meta.risk === "high" && <span title="Alto risco" className="text-[10px] text-amber-500">●</span>}
                        </span>
                        <span className="flex items-center gap-1">
                          {isDefault && <Badge tone="zinc">padrão</Badge>}
                          {isExtra && !isDefault && <Badge tone="green">concedida</Badge>}
                          {busy && <span className="text-[10px] text-zinc-500">…</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-600">
        “Padrão” vem do cargo (para tirá-la, mude o cargo). “Concedida” é extra individual e é
        <strong> salva na hora</strong>. Permissões de alto risco (<span className="text-amber-500">●</span>) pedem confirmação.
      </p>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) toggle(confirm.key, true);
          setConfirm(null);
        }}
        title="Conceder permissão de alto risco?"
        description={`Você está concedendo “${confirm?.label}”.`}
        warning="Confirme se esta pessoa realmente precisa deste acesso — segredos, exclusões e ações administrativas são sensíveis. A concessão fica registrada na auditoria."
        confirmLabel="Conceder"
        danger
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criar colaborador (admin cria já ativo)
// ---------------------------------------------------------------------------

export function MemberForm() {
  const [open, setOpen] = useState(false);
  const [cargo, setCargo] = useState<CargoName | "">("");
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
          <input type="hidden" name="cargo" value={cargo} />
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
            <label className="mb-1 block text-sm text-zinc-300" htmlFor="password">Senha inicial *</label>
            <input id="password" name="password" type="password" required minLength={8} className={inputClass} placeholder="Mínimo 8 caracteres" />
          </div>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Cargo *</span>
            <CargoSelect value={cargo} onChange={setCargo} />
            <p className="mt-1 text-[11px] text-zinc-600">
              O cargo define o pacote padrão de permissões. Extras podem ser concedidas depois.
            </p>
          </div>

          {state.error && <div className="sm:col-span-2"><Alert>{state.error}</Alert></div>}
          {state.success && <div className="sm:col-span-2"><Alert tone="green">{state.success}</Alert></div>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending || !cargo}
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
  const [cargo, setCargo] = useState<CargoName | "">("");
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
          <p className="text-sm text-zinc-400">Defina o cargo do novo usuário:</p>
          <CargoSelect value={cargo} onChange={setCargo} />
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={pending || !cargo} onClick={() => run(() => approveUser(user.id, cargo))}>
              {pending ? "Aprovando..." : "Aprovar acesso"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Linha de membro
// ---------------------------------------------------------------------------

type MemberInfo = {
  id: string;
  name: string;
  email: string;
  status: string;
  isActive: boolean;
  cargo: CargoName | null;
  phone: string | null;
  extras: string[];
  isSelf: boolean;
  avatarUrl: string | null;
};

// Editor de foto de perfil (upload por magic bytes; remove volta às iniciais).
function AvatarEditor({ member }: { member: MemberInfo }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(uploadMemberAvatar, {});
  const [removing, startRemove] = useTransition();

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <UserAvatar name={member.name} src={member.avatarUrl} size="lg" />
      <div className="space-y-1.5">
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={member.id} />
          <label className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-300">
            {pending ? "Enviando..." : member.avatarUrl ? "Trocar foto" : "Enviar foto"}
            <input
              type="file"
              name="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={pending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="hidden"
            />
          </label>
          {member.avatarUrl && (
            <button
              type="button"
              disabled={removing}
              onClick={() => startRemove(async () => { await removeMemberAvatar(member.id); router.refresh(); })}
              className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 transition hover:text-red-400"
            >
              {removing ? "..." : "Remover"}
            </button>
          )}
        </form>
        <p className="text-[11px] text-zinc-600">PNG, JPG ou WEBP.</p>
        {state.error && <p className="text-[11px] text-red-500">{state.error}</p>}
      </div>
    </div>
  );
}

export function MemberRow({
  member,
  canUpdate,
  canDeactivate,
  canDelete,
}: {
  member: MemberInfo;
  canUpdate: boolean;
  canDeactivate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cargo, setCargo] = useState<CargoName | "">(member.cargo ?? "");
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const meta = STATUS_META[member.status] ?? STATUS_META.INATIVO;
  const hasActions = canUpdate || canDeactivate || canDelete;

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

  // Salva perfil (nome/telefone) e, se mudou, o cargo.
  function saveAll() {
    setError(null);
    startTransition(async () => {
      const profile = await updateMemberProfile(member.id, { name, phone });
      if (profile.error) return setError(profile.error);
      if (cargo && cargo !== member.cargo) {
        const cargoRes = await changeCargo(member.id, cargo);
        if (cargoRes.error) return setError(cargoRes.error);
      }
      setEditOpen(false);
      router.refresh();
    });
  }

  function openEdit() {
    setError(null);
    setName(member.name);
    setPhone(member.phone ?? "");
    setCargo(member.cargo ?? "");
    setEditOpen(true);
  }

  return (
    <tr className={member.isActive ? "" : "opacity-60"}>
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center gap-2.5">
          <UserAvatar name={member.name} src={member.avatarUrl} size="sm" />
          <span>
            {member.name}
            {member.isSelf && <span className="ml-2 text-xs text-zinc-500">(você)</span>}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-zinc-400">{member.email}</td>
      <td className="px-4 py-3">
        {member.cargo ? (
          <Badge tone="zinc">{CARGO_LABELS[member.cargo]}</Badge>
        ) : (
          <span className="text-xs text-zinc-600">sem cargo</span>
        )}
        {member.extras.length > 0 && (
          <span
            className="ml-1 cursor-help text-[10px] text-emerald-400"
            title={member.extras.map((k) => PERMISSION_META[k as PermissionKey]?.label ?? k).join(", ")}
          >
            +{member.extras.length} extra(s)
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
      </td>
      {hasActions && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {canUpdate && (
              <Button size="sm" variant="secondary" onClick={openEdit}>
                Editar
              </Button>
            )}
            {canDeactivate && !member.isSelf && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => toggleMemberActive(member.id))}
              >
                {pending ? "..." : member.isActive ? "Desativar" : "Reativar"}
              </Button>
            )}
            {canDelete && !member.isSelf && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setError(null); setDeleteOpen(true); }}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Excluir
              </Button>
            )}
          </div>
          {error && !editOpen && !deleteOpen && <p className="mt-1 text-right text-xs text-red-600">{error}</p>}

          {/* Editar: nome, telefone, cargo e permissões extras */}
          <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Editar — ${member.name}`} wide>
            <div className="space-y-4 text-left">
              <AvatarEditor member={member} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Nome *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Nome completo" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">E-mail</label>
                  <input value={member.email} disabled className={`${inputClass} opacity-60`} />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Telefone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Cargo</label>
                  <CargoSelect value={cargo} onChange={setCargo} disabled={member.isSelf} />
                  {member.isSelf && <p className="mt-1 text-[11px] text-zinc-600">Você não pode alterar o próprio cargo.</p>}
                </div>
              </div>

              {member.isSelf ? (
                <p className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-500">
                  Você não pode alterar as suas próprias permissões.
                </p>
              ) : (
                <PermissionsPanel userId={member.id} cargo={cargo || member.cargo} extras={member.extras} />
              )}

              {error && <Alert>{error}</Alert>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Fechar</Button>
                <Button disabled={pending || name.trim().length < 2} onClick={saveAll}>
                  {pending ? "Salvando..." : "Salvar nome/cargo"}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Excluir colaborador */}
          <ConfirmDialog
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            onConfirm={() => run(() => deleteTeamMember(member.id), () => setDeleteOpen(false))}
            title={`Excluir ${member.name}?`}
            description="O colaborador será removido do sistema permanentemente. O histórico operacional (tarefas, clientes, logs) é preservado, mas deixa de ficar atribuído a esta pessoa. Esta ação não pode ser desfeita."
            confirmLabel="Excluir definitivamente"
            danger
            pending={pending}
          />
        </td>
      )}
    </tr>
  );
}
