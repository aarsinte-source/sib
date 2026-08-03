import Link from "next/link";
import { getSessione, RUOLO_LABEL } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const VOCI = [
  { href: "/analisi", label: "Analisi" },
  { href: "/piano", label: "Piano" },
  { href: "/creativita", label: "Creatività" },
  { href: "/calendario", label: "Calendario" },
  { href: "/outreach", label: "Outreach" },
  { href: "/campagne", label: "Campagne" },
  { href: "/sito", label: "Sito" },
  { href: "/report", label: "Report" },
] as const;

export default async function Nav() {
  const sessione = await getSessione();

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--hairline)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="display text-lg">
          SHEis Studio
        </Link>

        {sessione ? (
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {VOCI.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                className="rounded-full px-3 py-1.5 text-[var(--on-surface-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--on-surface)]"
              >
                {v.label}
              </Link>
            ))}
            {sessione.ruolo === "mauro" ? (
              <Link
                href="/utenti"
                className="rounded-full px-3 py-1.5 text-[var(--on-surface-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--on-surface)]"
              >
                Utenti
              </Link>
            ) : null}
          </nav>
        ) : null}

        <div className="flex items-center gap-3 text-sm text-[var(--on-surface-3)]">
          {sessione ? (
            <>
              <span>
                {sessione.nome} · {RUOLO_LABEL[sessione.ruolo]}
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link href="/entra" className="rounded-full border border-[var(--hairline-strong)] px-3 py-1">
              Accedi
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
