"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Banner, Button, Card, H2, Label } from "@/components/ui";

/**
 * La demo dell'outreach. Andrei scrive come scriverebbe il prospect, il
 * sistema risponde come scriverebbe a un prospect vero.
 *
 * Sotto ogni messaggio si vedono DUE cose che di solito restano nascoste:
 * cosa il sistema sta cercando di capire in quel punto della conversazione, e
 * i segnali che tradirebbero una macchina se fossero rimasti. Vederli è il
 * motivo per cui questa demo esiste: il tono si giudica leggendolo.
 */

type Messaggio = { da: "prospect" | "noi"; testo: string };
type Meta = { correzioni: string[]; sospetti: string[]; cosaStoFacendo: string; prossimoPasso: string };

const TIPI = [
  { id: "distributore", nome: "Distributore" },
  { id: "importatore", nome: "Importatore estero" },
  { id: "salone", nome: "Salone" },
];

const LINGUE = [
  { id: "it", nome: "Italiano" },
  { id: "es", nome: "Spagnolo" },
  { id: "en", nome: "Inglese" },
];

export default function DemoClient() {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [meta, setMeta] = useState<Record<number, Meta>>({});
  const [testo, setTesto] = useState("");
  const [tipo, setTipo] = useState("distributore");
  const [paese, setPaese] = useState("Piemonte");
  const [lingua, setLingua] = useState("it");
  const [note, setNote] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi]);

  async function rispondi(storia: Messaggio[]) {
    setInCorso(true);
    setErrore("");
    const r = await fetch("/api/outreach/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messaggi: storia, profilo: { tipo, paese, note }, lingua }),
    });
    const j = await r.json();
    if (!r.ok) {
      setErrore(j.error ?? "Non è arrivata risposta.");
      setInCorso(false);
      return;
    }
    setMessaggi((m) => {
      const nuovo = [...m, { da: "noi" as const, testo: j.messaggio }];
      setMeta((x) => ({
        ...x,
        [nuovo.length - 1]: {
          correzioni: j.correzioni ?? [],
          sospetti: j.sospetti ?? [],
          cosaStoFacendo: j.cosaStoFacendo ?? "",
          prossimoPasso: j.prossimoPasso ?? "",
        },
      }));
      return nuovo;
    });
    setInCorso(false);
  }

  async function invia() {
    const t = testo.trim();
    if (!t || inCorso) return;
    setTesto("");
    const storia = [...messaggi, { da: "prospect" as const, testo: t }];
    setMessaggi(storia);
    await rispondi(storia);
  }

  return (
    <div className="space-y-6">
      {/* ── chi finge di essere ───────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <Label>Fai la parte di</Label>
            <div className="mt-2 flex gap-2">
              {TIPI.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTipo(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    tipo === t.id
                      ? "border-[var(--accento)] bg-[var(--accento)] text-white"
                      : "border-[var(--bordo)] text-[var(--on-surface-2)]"
                  }`}
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Lingua</Label>
            <div className="mt-2 flex gap-2">
              {LINGUE.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLingua(l.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    lingua === l.id
                      ? "border-[var(--accento)] bg-[var(--accento)] text-white"
                      : "border-[var(--bordo)] text-[var(--on-surface-2)]"
                  }`}
                >
                  {l.nome}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[10rem] flex-1">
            <Label htmlFor="paese">Zona</Label>
            <input
              id="paese"
              value={paese}
              onChange={(e) => setPaese(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--bordo)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[14rem] flex-[2]">
            <Label htmlFor="note">Com&apos;è fatto (facoltativo)</Label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="es. lavora già con due marchi, diffidente"
              className="mt-1 w-full rounded-md border border-[var(--bordo)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        {messaggi.length === 0 && (
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={() => rispondi([])} disabled={inCorso}>
              {inCorso ? "Scrivo…" : "Fai scrivere il primo messaggio"}
            </Button>
            <span className="text-sm text-[var(--on-surface-3)]">
              oppure comincia tu, scrivendo come scriverebbe lui
            </span>
          </div>
        )}
      </Card>

      {errore && <Banner tono="errore">{errore}</Banner>}

      {/* ── la conversazione ──────────────────────────────────────────── */}
      {messaggi.length > 0 && (
        <div className="space-y-4">
          {messaggi.map((m, i) => {
            const meta_ = meta[i];
            const nostro = m.da === "noi";
            return (
              <div key={i} className={nostro ? "" : "flex justify-end"}>
                <div className={nostro ? "max-w-[80%]" : "max-w-[80%]"}>
                  <div
                    className={`whitespace-pre-line rounded-2xl px-4 py-3 text-sm ${
                      nostro
                        ? "rounded-bl-sm border border-[var(--bordo)] bg-[var(--surface-2)]"
                        : "rounded-br-sm bg-[var(--accento)] text-white"
                    }`}
                  >
                    {m.testo}
                  </div>

                  {nostro && meta_ && (
                    <div className="mt-2 space-y-1.5 pl-1 text-xs">
                      {meta_.cosaStoFacendo && (
                        <div className="text-[var(--on-surface-3)]">→ {meta_.cosaStoFacendo}</div>
                      )}
                      {meta_.correzioni.length > 0 && (
                        <div className="text-[var(--on-surface-3)]">
                          ripulito: {meta_.correzioni.join(" · ")}
                        </div>
                      )}
                      {meta_.sospetti.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {meta_.sospetti.map((s, k) => (
                            <Badge key={k} colore="#B45309">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {meta_.sospetti.length === 0 && meta_.correzioni.length === 0 && (
                        <Badge colore="#047857">nessun segnale da macchina</Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {inCorso && <div className="text-sm text-[var(--on-surface-3)]">sta scrivendo…</div>}
          <div ref={fondo} />
        </div>
      )}

      {/* ── scrivi come il prospect ───────────────────────────────────── */}
      <Card>
        <Label htmlFor="msg">Rispondi come risponderebbe lui</Label>
        <textarea
          id="msg"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void invia();
          }}
          rows={3}
          placeholder="es. «Grazie ma lavoriamo già con due fornitori, non ci serve altro»"
          className="mt-1 w-full resize-none rounded-md border border-[var(--bordo)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={invia} disabled={inCorso || !testo.trim()}>
            Manda
          </Button>
          <span className="text-xs text-[var(--on-surface-3)]">⌘+Invio</span>
          {messaggi.length > 0 && (
            <button
              onClick={() => {
                setMessaggi([]);
                setMeta({});
              }}
              className="text-xs text-[var(--on-surface-3)] underline"
            >
              ricomincia
            </button>
          )}
        </div>
      </Card>

      <Card>
        <H2>Cosa stai guardando</H2>
        <p className="mt-1 text-sm text-[var(--on-surface-2)]">
          Sotto ogni messaggio nostro trovi cosa il sistema sta cercando di capire in quel punto, e
          i segnali che avrebbero tradito una macchina. I trattini usati come pausa vengono tolti
          nel codice e non solo chiesti nel prompt: chiederli funziona quasi sempre, e su un canale
          a freddo «quasi sempre» significa che ogni tanto parte un messaggio con addosso la firma
          di un&apos;intelligenza artificiale.
        </p>
        <p className="mt-3 text-sm text-[var(--on-surface-3)]">
          Questa pagina non manda niente a nessuno. Le conversazioni di prova vivono in una tabella
          separata, con un vincolo che impedisce di riusarla per i contatti veri.
        </p>
      </Card>
    </div>
  );
}
