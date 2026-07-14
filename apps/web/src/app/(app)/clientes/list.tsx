"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  ADS_META,
  AGENCY_BRAND_META,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  formatDate,
  HEALTH_META,
} from "@/lib/labels";
import { StatusBadge, Table, Td, Th, UserAvatar } from "@/components/ui/primitives";
import { BulkBar, CardTrash, SelectCircle, SelectionProvider, type BulkMenu } from "@/components/bulk-select";
import {
  bulkClientEmpresa,
  bulkClientGestor,
  bulkClientModelo,
  bulkClientSaude,
  bulkDeleteClientsList,
  deleteClientRow,
  updateClientField,
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
  startDate: string | null; // ISO
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

// Célula editável inline: mostra o valor; ao clicar (com permissão) vira <select>.
function InlineField({
  id,
  field,
  value,
  display,
  options,
  canEdit,
  allowEmpty,
  emptyLabel = "—",
}: {
  id: string;
  field: string;
  value: string;
  display: ReactNode;
  options: Opt[];
  canEdit: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!canEdit) return <>{display}</>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setErr(null); setEditing(true); }}
        title="Clique para editar"
        className="group/inline inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition hover:bg-zinc-800"
      >
        {display}
        <span className="text-[9px] text-zinc-500 opacity-0 transition group-hover/inline:opacity-100">▾</span>
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <select
        autoFocus
        defaultValue={value}
        disabled={pending}
        onBlur={() => !pending && setEditing(false)}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => {
            const r = await updateClientField(id, field, v);
            if (r.error) setErr(r.error);
            else {
              setEditing(false);
              router.refresh();
            }
          });
        }}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-emerald-500"
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {err && <span className="max-w-40 text-[10px] text-red-600">{err}</span>}
    </span>
  );
}

export function ClientsList({
  rows,
  options,
  canUpdate,
  canDelete,
}: {
  rows: ClientRow[];
  options: Options;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const bulkMenus: BulkMenu[] = canUpdate
    ? [
        { label: "Empresa…", options: options.brands, run: bulkClientEmpresa },
        { label: "Modelo…", options: options.models, run: bulkClientModelo },
        { label: "Saúde…", options: options.healths, run: bulkClientSaude },
        { label: "Gestor…", options: [{ value: "", label: "— Sem gestor —" }, ...options.users], run: bulkClientGestor },
      ]
    : [];

  return (
    <SelectionProvider>
      <Table
        minWidth="1000px"
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
            {canDelete && <Th className="w-10"></Th>}
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
            <Td>
              <InlineField id={c.id} field="agencyBrand" value={c.agencyBrand} canEdit={canUpdate} options={options.brands}
                display={<StatusBadge value={c.agencyBrand} meta={AGENCY_BRAND_META} />} />
            </Td>
            <Td className="text-zinc-400">
              <InlineField id={c.id} field="niche" value={c.niche ?? ""} canEdit={canUpdate} options={options.niches} allowEmpty emptyLabel="— sem nicho —"
                display={<span>{c.niche ?? "—"}</span>} />
            </Td>
            <Td className="text-zinc-400">
              <InlineField id={c.id} field="businessModel" value={c.businessModel} canEdit={canUpdate} options={options.models}
                display={<span>{BUSINESS_MODEL_LABEL[c.businessModel] ?? c.businessModel}</span>} />
            </Td>
            <Td>
              {/* status é derivado (etapa + saúde + pausa) — somente leitura */}
              <StatusBadge value={c.status} meta={CLIENT_STATUS_META} />
            </Td>
            <Td>
              <InlineField id={c.id} field="healthStatus" value={c.healthStatus} canEdit={canUpdate} options={options.healths}
                display={<StatusBadge value={c.healthStatus} meta={HEALTH_META} />} />
            </Td>
            <Td>
              <InlineField id={c.id} field="adsStatus" value={c.adsStatus} canEdit={canUpdate} options={options.adsStatuses}
                display={<StatusBadge value={c.adsStatus} meta={ADS_META} />} />
            </Td>
            <Td>
              <InlineField id={c.id} field="trafficManager1Id" value={c.gestor1Id ?? ""} canEdit={canUpdate} options={options.users} allowEmpty emptyLabel="— sem gestor —"
                display={
                  c.gestor1Name ? (
                    <span className="flex items-center gap-1.5">
                      <UserAvatar name={c.gestor1Name} size="sm" />
                      <span className="text-xs text-zinc-400">{c.gestor1Name.split(" ")[0]}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-amber-500">sem gestor</span>
                  )
                } />
            </Td>
            <Td className="text-zinc-400">{formatDate(c.startDate ? new Date(c.startDate) : null)}</Td>
            {canDelete && <Td className="text-right"><CardTrash id={c.id} deleteAction={deleteClientRow} label="cliente" /></Td>}
          </tr>
        ))}
      </Table>
      <BulkBar entityLabel="clientes" menus={bulkMenus} deleteAction={canDelete ? bulkDeleteClientsList : undefined} />
    </SelectionProvider>
  );
}
