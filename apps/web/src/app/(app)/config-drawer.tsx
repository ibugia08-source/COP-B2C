"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TONE_CLASSES, type Tone } from "@/lib/labels";
import { Alert, Badge, Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icon";
import {
  createOption,
  deleteOption,
  reorderOptions,
  restoreDefaults,
  setDefaultOption,
  toggleOption,
  updateOption,
  type ActionState,
} from "./config-actions";

const TONES: Tone[] = ["green", "amber", "red", "blue", "purple", "zinc", "cyan"];

export type DrawerOption = {
  id: string | null;
  value: string;
  label: string;
  color: Tone;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
};
export type DrawerGroup = {
  moduleKey: string;
  groupKey: string;
  name: string;
  isSystem: boolean;
  options: DrawerOption[];
};

function ColorDot({ tone }: { tone: Tone }) {
  return <span className={`inline-block h-3 w-3 rounded-full border ${TONE_CLASSES[tone]}`} />;
}

function OptionRow({
  option,
  group,
  index,
  total,
  onAction,
  pending,
}: {
  option: DrawerOption;
  group: DrawerGroup;
  index: number;
  total: number;
  onAction: (fn: () => Promise<ActionState>) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(option.label);
  const [color, setColor] = useState<Tone>(option.color);

  function reorder(dir: -1 | 1) {
    const ids = group.options.map((o) => o.id!).filter(Boolean);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    onAction(() => reorderOptions(ids));
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-40" />
        <div className="flex items-center gap-1">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setColor(t)}
              className={`rounded-full p-0.5 ${color === t ? "ring-2 ring-emerald-500" : ""}`}
              title={t}
            >
              <ColorDot tone={t} />
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-1">
          <Button size="sm" disabled={pending} onClick={() => { onAction(() => updateOption(option.id!, label, color)); setEditing(false); }}>Salvar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 ${option.isActive ? "" : "opacity-50"}`}>
      <ColorDot tone={option.color} />
      <span className="text-sm text-zinc-200">{option.label}</span>
      {option.isDefault && <Badge tone="green">padrão</Badge>}
      {option.isSystem && <Badge tone="zinc">sistema</Badge>}
      {!option.isActive && <Badge tone="amber">inativa</Badge>}
      <span className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => reorder(-1)} disabled={pending || index === 0} className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">↑</button>
        <button type="button" onClick={() => reorder(1)} disabled={pending || index === total - 1} className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">↓</button>
        {!option.isDefault && option.isActive && (
          <button type="button" onClick={() => onAction(() => setDefaultOption(option.id!))} disabled={pending || !option.id} title="Usar como coluna/valor padrão" className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800">padrão</button>
        )}
        <button type="button" onClick={() => setEditing(true)} className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800">editar</button>
        <button type="button" onClick={() => onAction(() => toggleOption(option.id!))} disabled={pending} className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800">
          {option.isActive ? "desativar" : "ativar"}
        </button>
        {!option.isSystem && (
          <button type="button" onClick={() => onAction(() => deleteOption(option.id!))} disabled={pending} className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-zinc-800">excluir</button>
        )}
      </span>
    </div>
  );
}

function GroupPanel({ group, onAction, pending }: { group: DrawerGroup; onAction: (fn: () => Promise<ActionState>) => void; pending: boolean }) {
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<Tone>("blue");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{group.name}</h3>
          {group.isSystem && (
            <p className="text-[11px] text-zinc-500">
              Valores do sistema são travados (edite rótulo, cor, ordem e ativação). Colunas novas que você adicionar podem ser excluídas.
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onAction(() => restoreDefaults(group.moduleKey, group.groupKey))}>
          Restaurar padrão
        </Button>
      </div>

      <div className="space-y-1.5">
        {group.options.map((o, i) => (
          <OptionRow key={o.id ?? o.value} option={o} group={group} index={i} total={group.options.length} onAction={onAction} pending={pending} />
        ))}
        {group.options.length === 0 && <p className="text-sm text-zinc-500">Nenhuma opção ainda.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={group.isSystem ? "Nova coluna..." : "Nova opção..."} className="w-44" />
          <div className="flex items-center gap-1">
            {TONES.map((t) => (
              <button key={t} type="button" onClick={() => setNewColor(t)} className={`rounded-full p-0.5 ${newColor === t ? "ring-2 ring-emerald-500" : ""}`}>
                <ColorDot tone={t} />
              </button>
            ))}
          </div>
          <Button size="sm" disabled={pending || !newLabel.trim()} onClick={() => { onAction(() => createOption(group.moduleKey, group.groupKey, newLabel, newColor)); setNewLabel(""); }}>
            + Adicionar
          </Button>
      </div>
    </div>
  );
}

export function ConfigDrawerButton({
  moduleLabel,
  buttonLabel,
  groups,
}: {
  moduleLabel: string;
  buttonLabel?: string;
  groups: DrawerGroup[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(groups[0]?.groupKey ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAction(fn: () => Promise<ActionState>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const active = groups.find((g) => g.groupKey === activeTab) ?? groups[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Configurar opções e colunas do módulo (admins)"
        className={`rounded-lg border border-zinc-700 text-zinc-400 transition hover:border-zinc-500 hover:text-white ${
          buttonLabel ? "px-3 py-2 text-sm" : "p-2"
        }`}
      >
        <Icon name="settings" />{buttonLabel ? ` ${buttonLabel}` : ""}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Configurar — ${moduleLabel}`} wide>
        {groups.length === 0 ? (
          <p className="text-sm text-zinc-500">Nada configurável neste módulo.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1 border-b border-zinc-800 pb-2">
              {groups.map((g) => (
                <button
                  key={g.groupKey}
                  type="button"
                  onClick={() => setActiveTab(g.groupKey)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    active?.groupKey === g.groupKey ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
            {error && <Alert>{error}</Alert>}
            {active && <GroupPanel group={active} onAction={onAction} pending={pending} />}
            <p className="text-[11px] text-zinc-500">
              Desativar uma opção a esconde de novos cadastros; registros que já a usam continuam exibindo normalmente.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
