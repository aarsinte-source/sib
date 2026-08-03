import "server-only";

/**
 * Pubblicazione via Zernio — DICHIARATAMENTE non collegata da questa app.
 *
 * Zernio, in questo ambiente, esiste solo come server MCP (mcp.zernio.com)
 * cablato dentro Claude Code (~/.claude.json), non come API REST pubblica
 * documentata che un'app Next.js server-side possa chiamare in autonomia.
 * L'unico publisher reale oggi è l'agente Claude Code
 * `sheis-social-publisher-zernio`, che ha accesso MCP.
 *
 * Inventare qui un endpoint REST non documentato per "far vedere che
 * funziona" violerebbe la regola più importante della SPEC: "Non pubblicare
 * nulla davvero" e "il degrado si dichiara, mai un finto verde". Quindi
 * questo modulo dichiara sempre il blocco, con il motivo esatto — la coda
 * (sheis_pubblicazioni) resta scritta e consultabile, pronta per quando un
 * ponte diretto (o l'agente) la lavorerà.
 *
 * NB anche a ponte collegato: Zernio oggi vede solo gli account Alkemia
 * (alkemia.marketing FB, andrei_arsinte IG), nessun account SHEis. Pubblicare
 * su canali Alkemia "per prova" è peggio che non pubblicare (SPEC.md).
 */

export type EsitoPubblicazione = { ok: false; motivo: string };

export async function pubblicaSuZernio(input: {
  contenutoId: string;
  canale: string;
}): Promise<EsitoPubblicazione> {
  return {
    ok: false,
    motivo:
      `Zernio non è raggiungibile direttamente da questa applicazione per il contenuto ${input.contenutoId} (canale ${input.canale}): l'integrazione esiste oggi solo come server MCP collegato a Claude Code (agente sheis-social-publisher-zernio), non come API server-to-server per SHEis Studio. ` +
      "Anche quando un ponte diretto sarà disponibile, Zernio oggi vede solo gli account Alkemia — nessun account SHEis collegato: la pubblicazione reale resta bloccata finché Mauro non collega i profili SHEis via OAuth Zernio.",
  };
}
