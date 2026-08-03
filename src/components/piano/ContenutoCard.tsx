"use client";

import { useState } from "react";
import type { Brand, Canale, Formato, Lingua, Pubblico } from "@/lib/brand";
import type { Ruolo } from "@/lib/ruoli";
import { Badge, Button, Label, inputCls } from "@/components/ui";
import { labelStato, metaRiga } from "@/components/piano/format";

export type ContenutoDTO = {
  id: string;
  piano_id: string | null;
  data_pubblicazione: string | null;
  canale: Canale;
  brand: Brand;
  pubblico: Pubblico | null;
  lingua: Lingua;
  lingua_secondaria: Lingua | null;
  formato: Formato;
  angolo: string;
  hook: string;
  copy: string;
  copy_secondario: string | null;
  cta: string;
  hashtag: string[] | null;
  stato: string;
  feedback_mauro: string | null;
  created_at: string;
  updated_at: string;
};

type VoceLog = { id: string; azione: string; attore: string; note: string | null; created_at: string };

const COLORE_STATO: Record<string, string> = {
  in_attesa: "var(--on-surface-3)",
  approvato: "var(--color-live)",
  modificato: "var(--color-wip)",
  scartato: "var(--color-blocked)",
  in_produzione: "var(--color-wip)",
  prodotto: "var(--color-live)",
  programmato: "var(--color-ready)",
  pubblicato: "var(--color-live)",
  errore: "var(--color-blocked)",
};

export default function ContenutoCard({
  contenuto,
  ruolo,
  onApprovato,
  onRifiutato,
  onModificato,
}: {
  contenuto: ContenutoDTO;
  ruolo: Ruolo;
  onApprovato: (id: string) => void;
  onRifiutato: (id: string) => void;
  onModificato: (c: ContenutoDTO) => void;
}) {
  const [busy, setBusy] = useState<null | "approva" | "rifiuta" | "ai" | "manuale">(null);
  const [errore, setErrore] = useState("");
  const [linterViolazioni, setLinterViolazioni] = useState<{ regola: string; descrizione: string; frase: string }[] | null>(null);

  const [modModo, setModModo] = useState<null | "ai" | "manuale">(null);
  const [notaAI, setNotaAI] = useState("");
  const [campi, setCampi] = useState({
    hook: contenuto.hook,
    copy: contenuto.copy,
    copy_secondario: contenuto.copy_secondario ?? "",
    cta: contenuto.cta,
  });
  const [notaRifiuto, setNotaRifiuto] = useState("");
  const [rifiutoAttivo, setRifiutoAttivo] = useState(false);

  const [logAperto, setLogAperto] = useState(false);
  const [log, setLog] = useState<VoceLog[] | null>(null);

  const puoApprovare = ruolo === "mauro" || ruolo === "marketing";

  async function chiama(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, json: j };
  }

  async function approva() {
    setBusy("approva");
    setErrore("");
    setLinterViolazioni(null);
    const { ok, json } = await chiama(`/api/contenuti/${contenuto.id}/approva`, {});
    setBusy(null);
    if (ok) onApprovato(contenuto.id);
    else {
      setErrore((json.error as string) || "Approvazione non riuscita.");
      if (json.linter && Array.isArray((json.linter as { violazioni?: unknown }).violazioni)) {
        setLinterViolazioni((json.linter as { violazioni: { regola: string; descrizione: string; frase: string }[] }).violazioni);
      }
    }
  }

  async function rifiuta() {
    setBusy("rifiuta");
    setErrore("");
    const { ok, json } = await chiama(`/api/contenuti/${contenuto.id}/rifiuta`, { nota: notaRifiuto.trim() || undefined });
    setBusy(null);
    if (ok) onRifiutato(contenuto.id);
    else setErrore((json.error as string) || "Rifiuto non riuscito.");
  }

  async function modificaAI() {
    setBusy("ai");
    setErrore("");
    const { ok, json } = await chiama(`/api/contenuti/${contenuto.id}/modifica-ai`, { nota: notaAI.trim() });
    setBusy(null);
    if (ok) {
      onModificato(json.contenuto as ContenutoDTO);
      setModModo(null);
      setNotaAI("");
    } else setErrore((json.error as string) || "Rielaborazione non riuscita.");
  }

  async function modificaManuale() {
    setBusy("manuale");
    setErrore("");
    const { ok, json } = await chiama(`/api/contenuti/${contenuto.id}/modifica-manuale`, campi);
    setBusy(null);
    if (ok) {
      onModificato(json.contenuto as ContenutoDTO);
      setModModo(null);
    } else setErrore((json.error as string) || "Modifica non riuscita.");
  }

  async function apriLog() {
    setLogAperto((v) => !v);
    if (!log) {
      const r = await fetch(`/api/contenuti/${contenuto.id}/log`);
      const j = (await r.json()) as { log?: VoceLog[] };
      setLog(j.log ?? []);
    }
  }

  return (
    <article className="rounded-lg border border-[var(--hairline)] p-5 sm:p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--on-surface-3)]">{metaRiga(contenuto)}</p>
        <Badge colore={COLORE_STATO[contenuto.stato] ?? "var(--on-surface-3)"}>{labelStato(contenuto.stato)}</Badge>
      </div>

      <p className="text-sm text-[var(--on-surface-2)]">
        Angolo: <span className="italic">{contenuto.angolo}</span>
      </p>
      <p className="display mt-3 text-lg">{contenuto.hook}</p>
      <p className="mt-2 text-sm text-[var(--on-surface-2)]">{contenuto.copy}</p>
      {contenuto.copy_secondario ? (
        <p className="mt-2 text-sm text-[var(--on-surface-3)]">
          {contenuto.lingua_secondaria?.toUpperCase()} — {contenuto.copy_secondario}
        </p>
      ) : null}
      <p className="mt-3 text-sm">
        <span className="font-medium">CTA</span> · {contenuto.cta}
      </p>
      {contenuto.hashtag && contenuto.hashtag.length > 0 ? (
        <p className="mt-2 text-xs text-[var(--on-surface-3)]">
          {contenuto.hashtag.map((h) => `#${h}`).join(" ")}
        </p>
      ) : null}
      {contenuto.feedback_mauro ? (
        <p className="mt-3 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-xs">
          Nota: {contenuto.feedback_mauro}
        </p>
      ) : null}

      {linterViolazioni ? (
        <div className="mt-4 rounded-md border border-[color-mix(in_oklab,var(--color-blocked)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-blocked)_7%,transparent)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-blocked)]">Linter — bloccato</p>
          <ul className="mt-1.5 space-y-1.5">
            {linterViolazioni.map((v, i) => (
              <li key={i} className="text-xs text-[var(--on-surface-2)]">
                <strong>{v.regola}</strong>: {v.descrizione} — <em>&ldquo;{v.frase}&rdquo;</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {modModo === "manuale" ? (
        <div className="mt-4 space-y-3 border-t border-[var(--hairline)] pt-4">
          <div>
            <Label>Hook</Label>
            <input className={inputCls} value={campi.hook} onChange={(e) => setCampi((c) => ({ ...c, hook: e.target.value }))} />
          </div>
          <div>
            <Label>Copy</Label>
            <textarea className={inputCls} rows={3} value={campi.copy} onChange={(e) => setCampi((c) => ({ ...c, copy: e.target.value }))} />
          </div>
          <div>
            <Label>Copy secondario</Label>
            <textarea
              className={inputCls}
              rows={2}
              value={campi.copy_secondario}
              onChange={(e) => setCampi((c) => ({ ...c, copy_secondario: e.target.value }))}
            />
          </div>
          <div>
            <Label>CTA</Label>
            <input className={inputCls} value={campi.cta} onChange={(e) => setCampi((c) => ({ ...c, cta: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={modificaManuale} disabled={busy !== null}>
              {busy === "manuale" ? "Salvo…" : "Salva modifica manuale"}
            </Button>
            <Button variant="ghost" onClick={() => setModModo(null)} disabled={busy !== null}>
              Annulla
            </Button>
          </div>
        </div>
      ) : modModo === "ai" ? (
        <div className="mt-4 space-y-3 border-t border-[var(--hairline)] pt-4">
          <Label>Nota per l&apos;AI (cosa cambiare)</Label>
          <textarea
            className={inputCls}
            rows={3}
            value={notaAI}
            onChange={(e) => setNotaAI(e.target.value)}
            placeholder="Es. Hook più diretto, sposta l'accento sulla resa in salone…"
          />
          <div className="flex gap-2">
            <Button onClick={modificaAI} disabled={busy !== null}>
              {busy === "ai" ? "Rielaboro…" : "Rielabora con l'AI"}
            </Button>
            <Button variant="ghost" onClick={() => setModModo(null)} disabled={busy !== null}>
              Annulla
            </Button>
          </div>
        </div>
      ) : rifiutoAttivo ? (
        <div className="mt-4 space-y-3 border-t border-[var(--hairline)] pt-4">
          <Label>Motivo del rifiuto (opzionale)</Label>
          <textarea className={inputCls} rows={2} value={notaRifiuto} onChange={(e) => setNotaRifiuto(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="danger" onClick={rifiuta} disabled={busy !== null}>
              {busy === "rifiuta" ? "…" : "Conferma rifiuto"}
            </Button>
            <Button variant="ghost" onClick={() => setRifiutoAttivo(false)} disabled={busy !== null}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-4">
          {puoApprovare ? (
            <>
              <Button onClick={approva} disabled={busy !== null}>
                {busy === "approva" ? "…" : "Approva"}
              </Button>
              <Button variant="danger" onClick={() => setRifiutoAttivo(true)} disabled={busy !== null}>
                Rifiuta
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={() => setModModo("manuale")} disabled={busy !== null}>
            Modifica a mano
          </Button>
          <Button variant="ghost" onClick={() => setModModo("ai")} disabled={busy !== null}>
            Rielabora con l&apos;AI
          </Button>
          <button type="button" onClick={apriLog} className="ml-auto text-xs text-[var(--on-surface-3)] underline underline-offset-2">
            {logAperto ? "Nascondi registro" : "Mostra registro"}
          </button>
        </div>
      )}

      {errore ? <p className="mt-3 text-sm text-[var(--color-blocked)]">{errore}</p> : null}

      {logAperto ? (
        <div className="mt-4 border-t border-[var(--hairline)] pt-4">
          {log === null ? (
            <p className="text-xs text-[var(--on-surface-3)]">Carico…</p>
          ) : log.length === 0 ? (
            <p className="text-xs text-[var(--on-surface-3)]">Nessuna azione registrata ancora.</p>
          ) : (
            <ul className="space-y-1.5">
              {log.map((v) => (
                <li key={v.id} className="text-xs text-[var(--on-surface-3)]">
                  <span className="font-medium text-[var(--on-surface-2)]">{v.azione}</span> · {v.attore} ·{" "}
                  {new Date(v.created_at).toLocaleString("it-IT")}
                  {v.note ? ` — ${v.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
}
