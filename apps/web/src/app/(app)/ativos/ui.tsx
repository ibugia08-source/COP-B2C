"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { DigitalAsset, DigitalAssetGroup } from "@/db/schema";
import { ASSET_TEMPLATES, findAssetTemplate } from "@/lib/assets/templates";
import {
  ASSET_GROUP_TYPE_LABEL,
  ASSET_PLATFORM_LABEL,
  ASSET_PRIORITY_META,
  ASSET_STATUS_META,
  ASSET_TYPE_LABEL,
} from "@/lib/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { createAsset, saveGroup, updateAsset, type ActionState } from "./actions";

type Option = { id: string; name: string };

const ASSET_FIELD_LABELS: Record<string, string> = {
  loginUrl: "URL de login",
  profileUrl: "URL do perfil",
  businessManagerId: "ID do Business Manager",
  adAccountId: "ID da conta de anúncio",
  pageId: "ID da página",
  profileId: "ID do perfil",
  externalId: "ID externo",
  recoveryEmail: "E-mail de recuperação",
};

// ---------------------------------------------------------------------------
// Grupo (novo/editar)
// ---------------------------------------------------------------------------

export function GroupFormButton({
  group,
  clients,
  canManage,
}: {
  group?: DigitalAssetGroup;
  clients: Option[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const action = saveGroup.bind(null, group?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    {},
  );

  if (!canManage) return null;
  return (
    <>
      <Button variant="secondary" size={group ? "sm" : "md"} onClick={() => setOpen(true)}>
        {group ? "Editar grupo" : "+ Novo grupo"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={group ? `Editar — ${group.name}` : "Novo grupo de ativos"}>
        <form action={formAction} className="space-y-4">
          <Field label="Nome do grupo *">
            <Input name="name" required defaultValue={group?.name} placeholder="Ex.: Costa Imobiliária, Contas do TikTok" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select name="type" defaultValue={group?.type ?? "CLIENTE"}>
                {Object.entries(ASSET_GROUP_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={group?.status ?? "ATIVO"}>
                <option value="ATIVO">Ativo</option>
                <option value="PAUSADO">Pausado</option>
                <option value="ARQUIVADO">Arquivado</option>
              </Select>
            </Field>
          </div>
          <Field label="Cliente vinculado (opcional)">
            <Select name="clientId" defaultValue={group?.clientId ?? ""}>
              <option value="">— Interno da agência —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição">
            <Input name="description" defaultValue={group?.description ?? ""} />
          </Field>
          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar grupo"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ativo (novo com template / editar)
// ---------------------------------------------------------------------------

export function AssetFormButton({
  asset,
  groups,
  clients,
  users,
  defaultClientId,
  autoOpen,
  canCreateSecrets,
}: {
  asset?: DigitalAsset;
  groups: Option[];
  clients: Option[];
  users: Option[];
  defaultClientId?: string;
  autoOpen?: boolean;
  canCreateSecrets: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [templateSlug, setTemplateSlug] = useState("");
  const router = useRouter();
  const baseAction = asset ? updateAsset.bind(null, asset.id) : createAsset;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await baseAction(prev, fd);
      if (result.success) {
        setOpen(false);
        if (result.assetId && !asset) router.push(`/ativos/${result.assetId}`);
        else router.refresh();
      }
      return result;
    },
    {},
  );

  const template = templateSlug ? findAssetTemplate(templateSlug) : undefined;
  const visibleAssetFields = asset
    ? (Object.keys(ASSET_FIELD_LABELS) as (keyof typeof ASSET_FIELD_LABELS)[])
    : (template?.assetFields ?? ["loginUrl", "profileUrl", "externalId"]);

  return (
    <>
      <Button size={asset ? "sm" : "md"} variant={asset ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {asset ? "Editar" : "+ Novo ativo"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={asset ? `Editar — ${asset.title}` : "Novo ativo digital"} wide>
        <form action={formAction} className="space-y-4">
          {!asset && (
            <Field label="Começar a partir de um template">
              <Select value={templateSlug} onChange={(e) => setTemplateSlug(e.target.value)}>
                <option value="">— Sem template —</option>
                {ASSET_TEMPLATES.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.name}</option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Título *" className="sm:col-span-2">
              <Input name="title" required defaultValue={asset?.title} placeholder="Ex.: BM Principal — Sorriso Prime" />
            </Field>
            <Field label="Prioridade">
              <Select name="priority" defaultValue={asset?.priority ?? "MEDIA"}>
                {Object.entries(ASSET_PRIORITY_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Grupo *">
              <Select name="groupId" required defaultValue={asset?.groupId ?? ""}>
                <option value="">Selecione...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cliente (opcional)">
              <Select name="clientId" defaultValue={asset?.clientId ?? defaultClientId ?? ""}>
                <option value="">— Interno —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={asset?.status ?? "NAO_INFORMADO"}>
                {Object.entries(ASSET_STATUS_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de ativo">
              <Select name="assetType" key={`type-${templateSlug}`} defaultValue={asset?.assetType ?? template?.assetType ?? "OTHER"}>
                {Object.entries(ASSET_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Plataforma">
              <Select name="platform" key={`plat-${templateSlug}`} defaultValue={asset?.platform ?? template?.platform ?? "OUTRA"}>
                {Object.entries(ASSET_PLATFORM_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Responsável">
              <Select name="assignedToId" defaultValue={asset?.assignedToId ?? ""}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Dono (owner)">
              <Select name="ownerUserId" defaultValue={asset?.ownerUserId ?? ""}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Próxima revisão">
              <Input
                name="nextReviewAt"
                type="date"
                defaultValue={asset?.nextReviewAt ? asset.nextReviewAt.toISOString().slice(0, 10) : ""}
              />
            </Field>
            <Field label="Tags (vírgula)">
              <Input name="tags" defaultValue={asset?.tags.join(", ") ?? ""} placeholder="principal, verificada" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 sm:grid-cols-2">
            <p className="text-xs font-semibold uppercase text-zinc-500 sm:col-span-2">Identificadores e links (não sensíveis)</p>
            {visibleAssetFields.map((f) => (
              <Field key={f} label={ASSET_FIELD_LABELS[f]}>
                <Input name={f} defaultValue={(asset?.[f as keyof DigitalAsset] as string | null) ?? ""} />
              </Field>
            ))}
          </div>

          {!asset && template && canCreateSecrets && (
            <div className="space-y-3 rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
              <p className="text-xs font-semibold uppercase text-amber-400">
                🔐 Credenciais do template — serão criptografadas (AES-256-GCM)
              </p>
              {template.secretFields.map((s, i) => (
                <Field key={i} label={s.label}>
                  <Input
                    name={`secret__${s.type}__${s.label}`}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Deixe vazio para não cadastrar"
                  />
                </Field>
              ))}
              <p className="text-[11px] text-zinc-500">
                Os valores nunca são exibidos em listagens — apenas via ação “Revelar”, com auditoria.
              </p>
            </div>
          )}

          <Field label="Observações">
            <Textarea name="notes" defaultValue={asset?.notes ?? ""} placeholder="Contexto operacional. Nunca cole senhas aqui — use as credenciais." />
          </Field>
          <Field label="Descrição">
            <Input name="description" defaultValue={asset?.description ?? ""} />
          </Field>

          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : asset ? "Salvar ativo" : "Criar ativo"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

export function AssetFilters({
  clients,
  groups,
  users,
}: {
  clients: Option[];
  groups: Option[];
  users: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }
  const sel = (k: string) => params.get(k) ?? "";

  const chip = (label: string, key: string, value: string) => (
    <button
      type="button"
      onClick={() => setParam(key, sel(key) === value ? "" : value)}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
        sel(key) === value
          ? "border-emerald-600 bg-emerald-950/60 text-emerald-300"
          : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`mb-4 space-y-2 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap gap-2">
        <input
          defaultValue={sel("q")}
          placeholder="Buscar ativo..."
          className={`${selectClass} w-44`}
          onKeyDown={(e) => e.key === "Enter" && setParam("q", (e.target as HTMLInputElement).value)}
          onBlur={(e) => e.target.value !== sel("q") && setParam("q", e.target.value)}
        />
        <select className={selectClass} value={sel("cliente")} onChange={(e) => setParam("cliente", e.target.value)}>
          <option value="">Cliente: todos</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className={selectClass} value={sel("grupo")} onChange={(e) => setParam("grupo", e.target.value)}>
          <option value="">Grupo: todos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select className={selectClass} value={sel("tipo")} onChange={(e) => setParam("tipo", e.target.value)}>
          <option value="">Tipo: todos</option>
          {Object.entries(ASSET_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select className={selectClass} value={sel("plataforma")} onChange={(e) => setParam("plataforma", e.target.value)}>
          <option value="">Plataforma: todas</option>
          {Object.entries(ASSET_PLATFORM_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select className={selectClass} value={sel("status")} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">Status: todos</option>
          {Object.entries(ASSET_STATUS_META).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
        <select className={selectClass} value={sel("responsavel")} onChange={(e) => setParam("responsavel", e.target.value)}>
          <option value="">Responsável: todos</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <input
          defaultValue={sel("tag")}
          placeholder="Tag..."
          className={`${selectClass} w-24`}
          onKeyDown={(e) => e.key === "Enter" && setParam("tag", (e.target as HTMLInputElement).value)}
          onBlur={(e) => e.target.value !== sel("tag") && setParam("tag", e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chip("🔴 Bloqueados", "status", "BLOQUEADA")}
        {chip("✅ Prontos para uso", "status", "PRONTA_PARA_USO")}
        {chip("🔥 Sendo esquentados", "status", "SENDO_ESQUENTADA")}
        {chip("📄 Precisam de documentos", "status", "PRECISA_DE_DOCUMENTOS")}
        {chip("⏰ Revisão pendente", "revisao", "pendente")}
      </div>
    </div>
  );
}
