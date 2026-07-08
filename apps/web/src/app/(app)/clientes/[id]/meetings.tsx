"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { createMeetingFollowup, generateMeetLink, registerMeeting, type MeetingInput } from "../actions";

const TYPE_LABELS: Record<string, string> = {
  ONBOARDING: "Onboarding",
  ACOMPANHAMENTO: "Acompanhamento",
  ALINHAMENTO: "Alinhamento",
  APRESENTACAO: "Apresentação",
  RENOVACAO: "Renovação",
  OUTRO: "Outro",
};
const STATUS_META: Record<string, { label: string; tone: "green" | "amber" | "red" | "blue" | "zinc" }> = {
  AGENDADA: { label: "Agendada", tone: "blue" },
  REALIZADA: { label: "Realizada", tone: "green" },
  CANCELADA: { label: "Cancelada", tone: "red" },
  REMARCADA: { label: "Remarcada", tone: "amber" },
};

export type MeetingView = {
  id: string;
  title: string;
  meetingDate: string;
  meetingType: string;
  status: string;
  participants: string | null;
  responsibleName: string | null;
  meetLink: string | null;
  summary: string | null;
  nextSteps: string | null;
};

type UserOption = { id: string; name: string };

export function ClientMeetings({
  clientId,
  meetings,
  users,
  canManage,
  canCreateTask,
  meetEnabled,
}: {
  clientId: string;
  meetings: MeetingView[];
  users: UserOption[];
  canManage: boolean;
  canCreateTask: boolean;
  meetEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<MeetingInput>({
    title: "Reunião de acompanhamento",
    meetingDate: "",
    meetingType: "ACOMPANHAMENTO",
    status: "AGENDADA",
    participants: "",
    responsibleId: "",
    meetLink: "",
    summary: "",
    nextSteps: "",
  });
  const set = (patch: Partial<MeetingInput>) => setForm((f) => ({ ...f, ...patch }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await registerMeeting(clientId, form);
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function genLink() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await generateMeetLink(form.title, form.meetingDate);
      if (result.error) setNotice(result.error);
      else if (result.url) set({ meetLink: result.url });
    });
  }

  function followup(meetingId: string) {
    startTransition(async () => {
      await createMeetingFollowup(meetingId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <Button size="sm" onClick={() => { setError(null); setNotice(null); setOpen(true); }}>
          + Nova reunião
        </Button>
      )}

      {meetings.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma reunião registrada.</p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-zinc-100">{m.title}</p>
                  <Badge tone="zinc">{TYPE_LABELS[m.meetingType] ?? m.meetingType}</Badge>
                  <Badge tone={STATUS_META[m.status]?.tone ?? "zinc"}>{STATUS_META[m.status]?.label ?? m.status}</Badge>
                </div>
                <span className="text-xs text-zinc-500">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(m.meetingDate))}
                </span>
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
                {m.responsibleName && <p>Responsável: {m.responsibleName}</p>}
                {m.participants && <p>Participantes: {m.participants}</p>}
                {m.meetLink && (
                  <p>
                    Link:{" "}
                    <a href={m.meetLink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                      abrir reunião ↗
                    </a>
                  </p>
                )}
              </div>
              {m.summary && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{m.summary}</p>}
              {m.nextSteps && (
                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
                  <p className="text-[11px] font-semibold uppercase text-zinc-500">Próximos passos</p>
                  <p className="whitespace-pre-wrap text-sm text-zinc-300">{m.nextSteps}</p>
                  {canCreateTask && (
                    <Button size="sm" variant="secondary" className="mt-2" disabled={pending} onClick={() => followup(m.id)}>
                      Criar tarefa de follow-up
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nova reunião" wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Título *" className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Data e hora *">
            <Input type="datetime-local" value={form.meetingDate} onChange={(e) => set({ meetingDate: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Select value={form.meetingType} onChange={(e) => set({ meetingType: e.target.value })}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {Object.entries(STATUS_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={form.responsibleId} onChange={(e) => set({ responsibleId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Participantes" className="sm:col-span-2">
            <Input value={form.participants} onChange={(e) => set({ participants: e.target.value })} placeholder="Ex.: Dra. Paula, Tiago, Gabriela" />
          </Field>
          <Field label="Link da reunião" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input value={form.meetLink} onChange={(e) => set({ meetLink: e.target.value })} placeholder="https://meet.google.com/..." />
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !meetEnabled}
                title={meetEnabled ? "Gerar link do Google Meet" : "Integração com Google Meet não configurada"}
                onClick={genLink}
              >
                Gerar link Meet
              </Button>
            </div>
            {!meetEnabled && (
              <p className="mt-1 text-[11px] text-amber-500/80">
                Google Meet não configurado — cole o link manualmente (veja Configurações → Serviços & Módulos).
              </p>
            )}
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={form.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="Principais pontos discutidos" />
          </Field>
          <Field label="Próximos passos" className="sm:col-span-2">
            <Textarea value={form.nextSteps} onChange={(e) => set({ nextSteps: e.target.value })} placeholder="Ações combinadas — podem virar tarefas de follow-up" />
          </Field>

          {notice && <div className="sm:col-span-2"><Alert tone="amber">{notice}</Alert></div>}
          {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={pending} onClick={submit}>{pending ? "Salvando..." : "Registrar reunião"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
