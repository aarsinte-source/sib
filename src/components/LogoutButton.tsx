"use client";

export default function LogoutButton() {
  async function esci() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/entra";
  }
  return (
    <button
      type="button"
      onClick={esci}
      className="rounded-full border border-[var(--hairline-strong)] px-3 py-1 text-xs hover:border-[var(--accent-ink)]"
    >
      Esci
    </button>
  );
}
