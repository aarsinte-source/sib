import type { ReactNode } from "react";

/**
 * Kit UI minimo e riusato in ogni pagina dello Studio. Niente dipendenze
 * pesanti: bastano questi pochi elementi (SPEC.md §"Cosa NON fare").
 */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[var(--hairline)] bg-[var(--surface)] p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--on-surface-3)]">{children}</p>;
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="display text-2xl sm:text-3xl">{children}</h1>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="display text-xl sm:text-2xl">{children}</h2>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "solid",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost" | "danger";
  type?: "button" | "submit";
  title?: string;
}) {
  const cls =
    variant === "solid"
      ? "bg-[var(--on-surface)] text-[var(--surface)] hover:opacity-88"
      : variant === "danger"
        ? "border border-[color-mix(in_oklab,var(--color-blocked)_45%,transparent)] text-[var(--color-blocked)] hover:bg-[color-mix(in_oklab,var(--color-blocked)_8%,transparent)]"
        : "border border-[var(--hairline-strong)] hover:border-[var(--accent-ink)] hover:text-[var(--accent-ink)]";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

/** Etichetta ferma per un'azione non disponibile — dichiara il motivo, non finge un pulsante. */
export function AzioneBloccata({ motivo }: { motivo: string }) {
  return (
    <span
      title={motivo}
      className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--hairline-strong)] px-4 py-2 text-sm text-[var(--on-surface-3)]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-wip)]" aria-hidden />
      Non disponibile
    </span>
  );
}

export function Banner({
  tono = "info",
  titolo,
  children,
}: {
  tono?: "info" | "attenzione" | "errore";
  titolo?: string;
  children: ReactNode;
}) {
  const colore = tono === "errore" ? "var(--color-blocked)" : tono === "attenzione" ? "var(--color-wip)" : "var(--color-ready)";
  return (
    <div
      className="rounded-md border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${colore} 30%, transparent)`,
        background: `color-mix(in oklab, ${colore} 7%, transparent)`,
      }}
    >
      {titolo ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: colore }}>
          {titolo}
        </p>
      ) : null}
      <div className="text-sm text-[var(--on-surface-2)]">{children}</div>
    </div>
  );
}

export function Badge({ children, colore = "var(--on-surface-3)" }: { children: ReactNode; colore?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: colore,
        borderColor: `color-mix(in oklab, ${colore} 35%, transparent)`,
        background: `color-mix(in oklab, ${colore} 11%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colore }} aria-hidden />
      {children}
    </span>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--on-surface-3)]">
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-md border border-[var(--hairline-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-ink)]";
