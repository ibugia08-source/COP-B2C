"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { CreativeRequest, CreativeStatus } from "@/db/schema";
import { CREATIVE_STATUSES } from "@/db/schema";
import { CREATIVE_STATUS_META } from "@/lib/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { changeCreativeStatus, createCreative, updateCreative, type ActionState } from "./actions";

const OBJECTIVE_LABELS: Record<string, string> = {
  MENSAGENS: "Mensagens",
  ENGAJAMENTO: "Engajamento",
  RECONHECIMENTO: "Reconhecimento",
  VENDAS: "Vendas",
  LEADS: "Leads",
  SOCIAL_MEDIA: "Social Media",
};
const PLATFORM_LABELS: Record<string, string> = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  OUTRO: "Outro",
};
const TYPE_LABELS: Record<string, string> = {
  VIDEO: "Vídeo",
  IMAGEM: "Imagem",
  CARROSSEL: "Carrossel",
  STORIES: "Stories",
  REELS: "Reels",
  COPY: "Copy",
  LANDING_PAGE: "Landing Page",
};

export { OBJECTIVE_LABELS, PLATFORM_LABELS, TYPE_LABELS };

// ---------------------------------------------------------------------------
// Form (criar/editar)
// ---------------------------------------------------------------------------

export function CreativeFormButton({
  creative,
  users,
  clients,
  defaultClientId,
  autoOpen,
}: {
  creative?: CreativeRequest;
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const router = useRouter();
  const baseAction = creative ? updateCreative.bind(null, creative.id) : createCreative;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await baseAction(prev, formData);
      if (result.success) {
        setOpen(false);
        if (result.creativeId) router.push(`/criativos/${result.creativeId}`);
        else router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    <>
      <Button variant={creative ? "secondary" : "primary"} size={creative ? "sm" : "md"} onClick={() => setOpen(true)}>
        {creative ? "Editar" : "+ Solicitar criativo"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={creative ? "Editar criativo" : "Nova solicitação de criativo"} wide>
        <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente *">
            <Select name="clientId" required defaultValue={creative?.clientId ?? defaultClientId ?? ""}>
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Título *">
            <Input name="title" required defaultValue={creative?.title} placeholder="Ex.: Vídeo depoimento" />
          </Field>
          <Field label="Objetivo">
            <Select name="objective" defaultValue={creative?.objective ?? ""}>
              <option value="">—</option>
              {Object.entries(OBJECTIVE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Plataforma">
            <Select name="platform" defaultValue={creative?.platform ?? ""}>
              <option value="">—</option>
              {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select name="creativeType" defaultValue={creative?.creativeType ?? ""}>
              <option value="">—</option>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prazo">
            <Input name="dueDate" type="date" defaultValue={creative?.dueDate ? creative.dueDate.toISOString().slice(0, 10) : ""} />
          </Field>
          <Field label="Responsável pela copy">
            <Select name="copyResponsibleId" defaultValue={creative?.copyResponsibleId ?? ""}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável pelo design/edição">
            <Select name="assignedToId" defaultValue={creative?.assignedToId ?? ""}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Briefing" className="sm:col-span-2">
            <Textarea name="briefing" defaultValue={creative?.briefing ?? ""} placeholder="O que o criativo precisa comunicar? Referências, tom, formato..." />
          </Field>
          <Field label="Oferta">
            <Input name="offer" defaultValue={creative?.offer ?? ""} />
          </Field>
          <Field label="CTA">
            <Input name="cta" defaultValue={creative?.cta ?? ""} placeholder="Ex.: Agende sua avaliação" />
          </Field>
          <Field label="Link dos arquivos">
            <Input name="fileLinks" defaultValue={creative?.fileLinks ?? ""} placeholder="Drive, Figma..." />
          </Field>
          <Field label="Observações">
            <Input name="observations" defaultValue={creative?.observations ?? ""} />
          </Field>

          {state.error && <div className="sm:col-span-2"><Alert>{state.error}</Alert></div>}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : creative ? "Salvar" : "Solicitar criativo"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Controle de status (com regras de aprovação/reprovação/publicação)
// ---------------------------------------------------------------------------

export function CreativeStatusControls({ creative }: { creative: CreativeRequest }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"reprovar" | "publicar" | null>(null);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const [feedback, setFeedback] = useState("");

  function run(status: CreativeStatus, extras?: Parameters<typeof changeCreativeStatus>[2]) {
    setError(null);
    startTransition(async () => {
      const result = await changeCreativeStatus(creative.id, status, extras);
      if (result.error) setError(result.error);
      else {
        setModal(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={creative.status}
          disabled={pending}
          onChange={(e) => {
            const status = e.target.value as CreativeStatus;
            if (status === "REPROVADO") setModal("reprovar");
            else if (status === "PUBLICADO") setModal("publicar");
            else run(status);
          }}
          className="max-w-56"
        >
          {CREATIVE_STATUSES.map((s) => (
            <option key={s} value={s}>{CREATIVE_STATUS_META[s]?.label}</option>
          ))}
        </Select>
        {creative.status === "AGUARDANDO_APROVACAO" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run("APROVADO")}>✓ Aprovar</Button>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => setModal("reprovar")}>✗ Reprovar</Button>
          </>
        )}
        {creative.status === "APROVADO" && (
          <Button size="sm" disabled={pending} onClick={() => setModal("publicar")}>Publicar</Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}

      <Modal open={modal === "reprovar"} onClose={() => setModal(null)} title="Reprovar criativo">
        <div className="space-y-4">
          <Field label="Motivo da reprovação *">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="O que precisa mudar?" />
          </Field>
          <Field label="Feedback do cliente (opcional)">
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button variant="danger" disabled={pending} onClick={() => run("REPROVADO", { rejectionReason: reason, clientFeedback: feedback })}>
              {pending ? "Salvando..." : "Reprovar"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "publicar"} onClose={() => setModal(null)} title="Publicar criativo">
        <div className="space-y-4">
          <Field label="Link final publicado *">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button disabled={pending} onClick={() => run("PUBLICADO", { publishedLink: link })}>
              {pending ? "Salvando..." : "Marcar como publicado"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

export function CreativeFilters({
  users,
  clients,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
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
  return (
    <div className={`mb-4 flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`}>
      <select className={selectClass} value={sel("cliente")} onChange={(e) => setParam("cliente", e.target.value)}>
        <option value="">Cliente: todos</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("responsavel")} onChange={(e) => setParam("responsavel", e.target.value)}>
        <option value="">Responsável: todos</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("status")} onChange={(e) => setParam("status", e.target.value)}>
        <option value="">Status: todos</option>
        {Object.entries(CREATIVE_STATUS_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("objetivo")} onChange={(e) => setParam("objetivo", e.target.value)}>
        <option value="">Objetivo: todos</option>
        {Object.entries(OBJECTIVE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("plataforma")} onChange={(e) => setParam("plataforma", e.target.value)}>
        <option value="">Plataforma: todas</option>
        {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("prazo")} onChange={(e) => setParam("prazo", e.target.value)}>
        <option value="">Prazo: todos</option>
        <option value="atrasados">Atrasados</option>
        <option value="semana">Próximos 7 dias</option>
      </select>
    </div>
  );
}
