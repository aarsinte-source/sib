"use client";

import { useState } from "react";
import { Label, inputCls, Button } from "@/components/ui";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState("");
  const [caricando, setCaricando] = useState(false);

  async function accedi() {
    if (!email.trim() || !password) return;
    setCaricando(true);
    setErrore("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const j = (await r.json()) as { error?: string };
      if (r.ok) {
        window.location.href = "/piano";
      } else {
        setErrore(j.error || "Accesso non riuscito.");
      }
    } catch {
      setErrore("Errore di rete: riprova.");
    } finally {
      setCaricando(false);
    }
  }

  return (
    <div className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && accedi()}
          className={inputCls}
          autoComplete="username"
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && accedi()}
          className={inputCls}
          autoComplete="current-password"
        />
      </div>
      {errore ? <p className="text-sm text-[var(--color-blocked)]">{errore}</p> : null}
      <Button onClick={accedi} disabled={caricando || !email.trim() || !password}>
        {caricando ? "Accedo…" : "Accedi"}
      </Button>
    </div>
  );
}
