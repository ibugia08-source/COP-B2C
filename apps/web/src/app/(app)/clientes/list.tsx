"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ADS_META,
  AGENCY_BRAND_META,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  HEALTH_META,
} from "@/lib/labels";
import { formatDateOnly } from "@/lib/date";
import { Alert, Button, Field, Select, StatusBadge, Table, Td, Th, UserAvatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icon";
import { useAction } from "@/components/ui/use-action";
import { BulkBar, CardTrash, SelectCircle, SelectionProvider, type BulkMenu } from "@/components/bulk-select";
import {
  bulkClientEmpresa,
  bulkClientGestor,
  bulkClientModelo,
  bulkClientSaude,
  bulkDeleteClientsList,
  deleteClientRow,
  updateClientQuick,
} from "./actions";

type Opt = { value: string; label: string };

export type ClientRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  agencyBrand: string;
  niche: string | null;
  businessModel: string;
  status: string;
  healthStatus: string;
  adsStatus: string;
  gestor1Id: string | null;
  gestor1Name: string | null;
  startDate: string | null; // data-only 'YYYY-MM-DD'
};

type Options = {
  brands: Opt[];
  models: Opt[];
  niches: Opt[];
  statuses: Opt[]; // sem PERDIDO
  healths: Opt[]; // sem CRÍTICO
  adsStatuses: Opt[];
  users: Opt[]; // gestores
};

// garante que o valor atual apareça no select mesmo se não estiver na lista de opções
function ensureOption(opts: Opt[], value: string, label: string): Opt[] {
  if (!value || opts.some((o) => o.value === value)) return opts;
  return [{ value, label }, ...opts];
}

// Modal de edição rápida de um cliente (aberto pelo lápis na linha).
function ClientQuickEdit({ row, options }: { row: ClientRow; options: Options }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useAction();

  const [empresa, setEmpresa] = useState(row.agencyBrand);
  const [nicho, setNicho] = useState(row.niche ?? "");
  const [modelo, setModelo] = useState(row.businessModel);
  const [saude, setSaude] = useState(row.healthStatus);
  const [ads, setAds] = useState(row.adsStatus);
  const [gestor, setGestor] = useState(row.gestor1Id ?? "");

  function openModal() {
    // ressincroniza com a linha (os dados podem ter mudado desde o último refresh)
    setEmpresa(row.agencyBrand);
    setNicho(row.niche ?? "");
    setModelo(row.businessModel);
    setSaude(row.healthStatus);
    setAds(row.adsStatus);
    setGestor(row.gestor1Id ?? "");
    setOpen(true);
  }

  function save() {
    const changed: Record<string, string> = {};
    if (empresa !== row.agencyBrand) changed.agencyBrand = empresa;
    if (nicho !== (row.niche ?? "")) changed.niche = nicho;
    if (modelo !== row.businessModel) changed.businessModel = modelo;
    if (saude !== row.healthStatus) changed.healthStatus = saude;
    if (ads !== row.adsStatus) changed.adsStatus = ads;
    if (gestor !== (row.gestor1Id ?? "")) changed.trafficManager1Id = gestor;
    if (Object.keys(changed).length === 0) {
      setOpen(false);
      return;
    }
    run(() => updateClientQuick(row.id, changed), () => setOpen(false));
  }

  const healthOptions = ensureOption(options.healths, row.healthStatus, HEALTH_META[row.healthStatus]?.label ?? row.healthStatus);
  const nicheOptions = row.niche ? ensureOption(options.niches, row.niche, row.niche) : options.niches;

  return (
    <>
      <button
        type="button"
        title="Editar cliente"
        aria-label={`Editar ${row.name}`}
        onClick={openModal}
        className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-emerald-400"
      >
        <Icon name="pencil" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Editar — ${row.name}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Empresa">
            <Select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
              {options.brands.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Modelo de negócio">
            <Select value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {options.models.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Saúde da conta">
            <Select value={saude} onChange={(e) => setSaude(e.target.value)}>
              {healthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Anúncios">
            <Select value={ads} onChange={(e) => setAds(e.target.value)}>
              {options.adsStatuses.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nicho">
            <Select value={nicho} onChange={(e) => setNicho(e.target.value)}>
              <option value="">— sem nicho —</option>
              {nicheOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Gestor 1">
            <Select value={gestor} onChange={(e) => setGestor(e.target.value)}>
              <option value="">— sem gestor —</option>
              {options.users.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">
          Saúde CRÍTICA e os demais campos ficam na{" "}
          <Link href={`/clientes/${row.id}/editar`} className="text-emerald-400 hover:text-emerald-300">
            ficha completa
          </Link>
          .
        </p>
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function ClientsList({
  rows,
  options,
  canUpdate,
  canDelete,
  bulkRaised = false,
}: {
  rows: ClientRow[];
  options: Options;
  canUpdate: boolean;
  canDelete: boolean;
  /** eleva a barra de ações em massa (quando o Kanban da mesma tela também tem a sua). */
  bulkRaised?: boolean;
}) {
  const bulkMenus: BulkMenu[] = canUpdate
    ? [
        { label: "Empresa…", options: options.brands, run: bulkClientEmpresa },
        { label: "Modelo…", options: options.models, run: bulkClientModelo },
        { label: "Saúde…", options: options.healths, run: bulkClientSaude },
        { label: "Gestor…", options: [{ value: "", label: "— Sem gestor —" }, ...options.users], run: bulkClientGestor },
      ]
    : [];
  const hasActions = canUpdate || canDelete;

  return (
    <SelectionProvider>
      <Table
        minWidth="900px"
        head={
          <>
            <Th className="w-8"></Th>
            <Th>Cliente</Th>
            <Th>Empresa</Th>
            <Th>Nicho</Th>
            <Th>Modelo</Th>
            <Th>Status</Th>
            <Th>Saúde</Th>
            <Th>Ads</Th>
            <Th>Gestor 1</Th>
            <Th>Entrada</Th>
            {hasActions && <Th className="w-16 text-right">Ações</Th>}
          </>
        }
      >
        {rows.map((c) => (
          <tr key={c.id} className="transition hover:bg-zinc-900/60">
            <Td><SelectCircle id={c.id} /></Td>
            <Td>
              <Link href={`/clientes/${c.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                {c.name}
              </Link>
              {c.city && <p className="text-xs text-zinc-500">{c.city}{c.state ? `/${c.state}` : ""}</p>}
            </Td>
            <Td><StatusBadge value={c.agencyBrand} meta={AGENCY_BRAND_META} /></Td>
            <Td className="text-zinc-400">{c.niche ?? "—"}</Td>
            <Td className="text-zinc-400">{BUSINESS_MODEL_LABEL[c.businessModel] ?? c.businessModel}</Td>
            <Td><StatusBadge value={c.status} meta={CLIENT_STATUS_META} /></Td>
            <Td><StatusBadge value={c.healthStatus} meta={HEALTH_META} /></Td>
            <Td><StatusBadge value={c.adsStatus} meta={ADS_META} /></Td>
            <Td>
              {c.gestor1Name ? (
                <span className="flex items-center gap-1.5">
                  <UserAvatar name={c.gestor1Name} size="sm" />
                  <span className="text-xs text-zinc-400">{c.gestor1Name.split(" ")[0]}</span>
                </span>
              ) : (
                <span className="text-xs text-amber-500">sem gestor</span>
              )}
            </Td>
            <Td className="text-zinc-400">{formatDateOnly(c.startDate)}</Td>
            {hasActions && (
              <Td>
                <div className="flex items-center justify-end gap-0.5">
                  {canUpdate && <ClientQuickEdit row={c} options={options} />}
                  {canDelete && <CardTrash id={c.id} deleteAction={deleteClientRow} label="cliente" />}
                </div>
              </Td>
            )}
          </tr>
        ))}
      </Table>
      <BulkBar entityLabel="clientes" menus={bulkMenus} deleteAction={canDelete ? bulkDeleteClientsList : undefined} raised={bulkRaised} />
    </SelectionProvider>
  );
}
