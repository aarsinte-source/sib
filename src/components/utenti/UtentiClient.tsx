"use client";

import { useEffect, useState, useCallback } from "react";
import { Banner, Card, Button, Label, inputCls, Badge } from "@/components/ui";
import { RUOLI, RUOLO_LABEL, type Ruolo } from "@/lib/ruoli";

type Utente = { id: string; email: string; nome: string; ruolo: Ruolo; attivo: boolean; ultimo_accesso: string | null };

export default function UtentiClient() {
  const [schema, setSchema] = useState<{ ok: boolean; motivo?: string } | null>(null);
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [ruolo, setRuolo] = useState<Ruolo>("dipendente");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const ricarica = useCallback(async () => {
    const r = await fetch("/api/utenti");
    if (r.ok) {
      const j = (await r.json()) as { utenti?: Utente[] };
      setUtenti(j.utenti ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/stato");
      const j = (await r.json()) as { schema: { ok: boolean; motivo?: string } };
      setSchema(j.schema);
      if (j.schema.ok) await ricarica();
    })();
  }, [ricarica]);

  async function crea() {
    setBusy(true);
    setErrore("");
    const r = await fetch("/api/utenti", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), nome: nome.trim(), ruolo, password }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (r.ok) {
      setEmail("");
      setNome("");
      setPassword("");
      await ricarica();
    } else setErrore(j.error || "Creazione non riuscita.");
  }

  async function toggleAttivo(u: Utente) {
    await fetch(`/api/utenti/${u.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attivo: !u.attivo }),
    });
    await ricarica();
  }

  if (schema === null) return <p className="text-sm text-[var(--on-surface-3)]">Verifico il database…</p>;
  if (!schema.ok) {
    return (
      <Banner tono="attenzione" titolo="Database non ancora inizializzato">
        {schema.motivo}
      </Banner>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <p className="text-sm font-medium">Nuovo utente</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <Label>Email</Label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Nome</Label>
            <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Ruolo</Label>
            <select className={inputCls} value={ruolo} onChange={(e) => setRuolo(e.target.value as Ruolo)}>
              {RUOLI.map((r) => (
                <option key={r} value={r}>
                  {RUOLO_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Password (min 8)</Label>
            <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={crea} disabled={busy || !email.trim() || !nome.trim() || password.length < 8}>
            {busy ? "…" : "Crea utente"}
          </Button>
        </div>
        {errore ? <p className="mt-2 text-sm text-[var(--color-blocked)]">{errore}</p> : null}
      </Card>

      <ul className="space-y-2">
        {utenti.map((u) => (
          <li key={u.id} className="flex items-center justify-between rounded-md border border-[var(--hairline)] p-3">
            <div>
              <p className="text-sm font-medium">
                {u.nome} <span className="text-[var(--on-surface-3)]">· {u.email}</span>
              </p>
              <p className="text-xs text-[var(--on-surface-3)]">{RUOLO_LABEL[u.ruolo]}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge colore={u.attivo ? "var(--color-live)" : "var(--color-blocked)"}>{u.attivo ? "Attivo" : "Disattivo"}</Badge>
              <Button variant="ghost" onClick={() => toggleAttivo(u)}>
                {u.attivo ? "Disattiva" : "Riattiva"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
