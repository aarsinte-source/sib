"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Come apparirebbe sui social: la creativa con il copy sotto.
 *
 * PERCHÉ NON BASTA MOSTRARE L'IMMAGINE
 * ------------------------------------
 * Una creativa guardata da sola sembra quasi sempre buona: è un'immagine
 * curata, a tutto schermo, senza contesto. Quella stessa immagine dentro un
 * feed — ridotta, con la didascalia sotto che ne ruba l'attenzione, il nome
 * del marchio sopra e la prima riga della caption troncata — racconta un'altra
 * storia. Metà delle creative che sembrano funzionare non reggono quel
 * confronto, e il confronto va fatto PRIMA di pubblicare, non dopo.
 *
 * Il troncamento della didascalia è riprodotto apposta: Instagram taglia
 * intorno ai 125 caratteri e mette «altro». Se il gancio non sta lì dentro,
 * nessuno lo leggerà mai — ed è un difetto che si vede solo così.
 */

const TRONCA_A = 125;

export type DatiAnteprima = {
  canale: string;
  brand: string;
  brandLabel: string;
  formato: string;
  hook: string;
  copy: string;
  cta: string;
  hashtag: string[] | null;
  copyGrafica?: { titolo?: string; sottotitolo?: string; cta?: string } | null;
  assetUrl?: string | null;
};

const RAPPORTO: Record<string, string> = {
  statico: "aspect-[4/5]",
  carosello: "aspect-[4/5]",
  video: "aspect-[9/16]",
  ugc: "aspect-[9/16]",
};

export default function AnteprimaSocial({ dati }: { dati: DatiAnteprima }) {
  const [aperta, setAperta] = useState(false);

  const corpo = [dati.hook, dati.copy].filter(Boolean).join("\n\n").trim();
  const tag = (dati.hashtag ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const completo = [corpo, dati.cta, tag].filter(Boolean).join("\n\n");
  const troppoLungo = completo.length > TRONCA_A;
  const visibile = aperta || !troppoLungo ? completo : completo.slice(0, TRONCA_A);

  const perTelefono = dati.formato === "video" || dati.formato === "ugc";

  return (
    <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-[var(--bordo)] bg-[var(--surface)]">
      {/* testata, come nel feed */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--bordo)] bg-white">
          {/* Il marchio è il file vero, non una ricostruzione: vedi marchi.json. */}
          <Image
            src={`/marchi/${dati.brand}.png`}
            alt={dati.brandLabel}
            width={32}
            height={32}
            className="size-7 object-contain p-0.5"
            unoptimized
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{dati.brandLabel}</div>
          <div className="text-xs text-[var(--on-surface-3)]">
            {dati.canale} · {dati.formato}
          </div>
        </div>
      </div>

      {/* la creativa */}
      <div className={`relative w-full bg-[var(--surface-2)] ${RAPPORTO[dati.formato] ?? "aspect-square"}`}>
        {dati.assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dati.assetUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="text-sm text-[var(--on-surface-3)]">creativa non ancora generata</div>
            {dati.copyGrafica?.titolo && (
              <div className="mt-2 space-y-1">
                <div className="text-lg font-medium leading-tight">{dati.copyGrafica.titolo}</div>
                {dati.copyGrafica.sottotitolo && (
                  <div className="text-sm text-[var(--on-surface-2)]">{dati.copyGrafica.sottotitolo}</div>
                )}
                {dati.copyGrafica.cta && (
                  <div className="pt-1 text-xs uppercase tracking-wide text-[var(--on-surface-3)]">
                    {dati.copyGrafica.cta}
                  </div>
                )}
                <div className="pt-2 text-xs text-[var(--on-surface-3)]">
                  ↑ il testo che andrà stampato sull&apos;immagine
                </div>
              </div>
            )}
          </div>
        )}
        {perTelefono && (
          <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
            verticale
          </span>
        )}
      </div>

      {/* la didascalia, troncata come la tronca il feed */}
      <div className="px-3 py-2.5">
        <p className="whitespace-pre-line text-sm leading-snug">
          <span className="font-medium">{dati.brandLabel} </span>
          {visibile}
          {troppoLungo && !aperta && (
            <button
              onClick={() => setAperta(true)}
              className="ml-1 text-[var(--on-surface-3)] hover:underline"
            >
              … altro
            </button>
          )}
        </p>
        {troppoLungo && !aperta && (
          <p className="mt-2 text-xs text-[var(--on-surface-3)]">
            Oltre i {TRONCA_A} caratteri il feed taglia. Quello che sta sotto la piega lo legge
            soltanto chi ha già deciso di leggerti.
          </p>
        )}
      </div>
    </div>
  );
}
