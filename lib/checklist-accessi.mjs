/**
 * Checklist canonica degli accessi Meta necessari per lanciare SHEis —
 * versione eseguibile della sezione "1. La checklist esatta degli accessi"
 * del README. Un solo posto: se la checklist cambia, cambia qui, e
 * stato_accessi.mjs la applica sempre aggiornata.
 *
 * Ogni voce dichiara se e' verificabile IN AUTOMATICO dal preflight (via
 * Graph API, quando esistono gli accessi) o solo A PAROLE (va chiesta e
 * confermata da un umano — es. lo spend cap lato Meta non e' leggibile con
 * certezza dalle API base, o il mandato a un fornitore terzo).
 */
export const CHECKLIST = [
  {
    sezione: 'A. Business Manager',
    id: 'bm_esiste',
    voce: 'Nome e ID del Business Manager di SHEis (se non esiste, va creato)',
    obbligatorio: true,
    verificabile_via_preflight: false,
    richiesta: 'Qual e\' il nome e l\'ID del Business Manager di SHEis su business.facebook.com? Se non esiste ancora, va creato (10 minuti).',
  },
  {
    sezione: 'A. Business Manager',
    id: 'bm_ruolo_alkemia',
    voce: 'Ruolo Amministratore per Alkemia (a.arsinte@andreiarsinte.it) sul Business Manager, o partnership tra Business Manager',
    obbligatorio: true,
    verificabile_via_preflight: false,
    richiesta: 'Aggiungi a.arsinte@andreiarsinte.it come Amministratore del Business Manager SHEis (Impostazioni azienda → Utenti → Persone → Aggiungi), oppure collega il Business Manager di Alkemia come partner (ID business Alkemia: 260406431383223).',
  },
  {
    sezione: 'B. Account pubblicitario',
    id: 'ad_account_esiste',
    voce: 'Account pubblicitario SHEis esistente (act_...) dentro il Business Manager SHEis',
    obbligatorio: true,
    verificabile_via_preflight: true,
    richiesta: 'Esiste gia\' un account pubblicitario SHEis? Serve l\'ID (act_...). Se no, va creato DENTRO il Business Manager di SHEis (non da un profilo personale), in EUR e fuso Europe/Rome — entrambi non modificabili dopo la creazione.',
  },
  {
    sezione: 'B. Account pubblicitario',
    id: 'ad_account_valuta',
    voce: 'Valuta dell\'account: EUR (non modificabile dopo la creazione)',
    obbligatorio: true,
    verificabile_via_preflight: true,
    richiesta: 'Conferma che l\'account e\' in EUR: i budget di questo kit sono in euro e non sono convertibili automaticamente.',
  },
  {
    sezione: 'B. Account pubblicitario',
    id: 'ad_account_ruolo_alkemia',
    voce: 'Ruolo per Alkemia sull\'account: Inserzionista o Amministratore',
    obbligatorio: true,
    verificabile_via_preflight: false,
    richiesta: 'Dai ad Alkemia il ruolo di Inserzionista (basta) o Amministratore (piu\' comodo) sull\'account pubblicitario.',
  },
  {
    sezione: 'C. Pagina Facebook',
    id: 'pagina_nel_bm',
    voce: 'La Pagina Facebook SHEis e\' dentro il Business Manager SHEis',
    obbligatorio: true,
    verificabile_via_preflight: true,
    richiesta: 'Porta la Pagina Facebook SHEis dentro il Business Manager SHEis (Impostazioni azienda → Pagine → Aggiungi → Aggiungi una pagina esistente). Chi la amministra oggi deve accettare il passaggio.',
  },
  {
    sezione: 'C. Pagina Facebook',
    id: 'pagina_ruolo_alkemia',
    voce: 'Ruolo per Alkemia sulla Pagina: Accesso completo o almeno Crea inserzioni',
    obbligatorio: true,
    verificabile_via_preflight: false,
    richiesta: 'Dai ad Alkemia il ruolo di Accesso completo (o almeno Crea inserzioni) sulla Pagina Facebook SHEis.',
  },
  {
    sezione: 'D. Instagram',
    id: 'ig_business',
    voce: 'Profilo Instagram in modalita\' Business (non Creator, non personale)',
    obbligatorio: true,
    verificabile_via_preflight: false,
    richiesta: 'Verifica che il profilo Instagram SHEis sia in modalita\' Business (App IG → Impostazioni → Tipo di account).',
  },
  {
    sezione: 'D. Instagram',
    id: 'ig_collegato',
    voce: 'Instagram collegato alla Pagina Facebook e dentro il Business Manager SHEis',
    obbligatorio: true,
    verificabile_via_preflight: true,
    richiesta: 'Collega il profilo Instagram alla Pagina Facebook (Business Suite → Impostazioni → Account Instagram) e aggiungilo al Business Manager SHEis. Senza questo passaggio gli annunci non escono su Instagram — errore frequente, si scopre sempre dopo aver caricato tutto.',
  },
  {
    sezione: 'E. Pixel e dominio',
    id: 'pixel_esiste',
    voce: 'Pixel Meta su sheishair.com (probabilmente assente: il sito usa Matomo)',
    obbligatorio: false,
    verificabile_via_preflight: true,
    richiesta: 'Esiste un pixel Meta su sheishair.com? Se no, va creato (Gestione eventi → Connetti origine dati → Web) e installato da Mark Studio (fornitore WordPress) — va dato mandato a loro. Non blocca il lancio di questo kit (A/B usano moduli istantanei, C non ha destinazione), ma serve per tutto cio\' che verra\' dopo.',
  },
  {
    sezione: 'E. Pixel e dominio',
    id: 'dominio_verificato',
    voce: 'Verifica del dominio sheishair.com (record TXT nel DNS)',
    obbligatorio: false,
    verificabile_via_preflight: false,
    richiesta: 'Verifica il dominio sheishair.com in Impostazioni azienda → Sicurezza del brand → Domini (richiede un record TXT nel DNS, lo fa chi gestisce il dominio). Non blocca questo kit, serve per il resto.',
  },
  {
    sezione: 'F. Pagamento',
    id: 'metodo_pagamento',
    voce: 'Metodo di pagamento sull\'account, intestato a SHEis Beauty International S.r.l.',
    obbligatorio: true,
    verificabile_via_preflight: true,
    richiesta: 'Aggiungi un metodo di pagamento all\'account pubblicitario (Gestione pagamenti → Aggiungi), intestato a SHEis Beauty International S.r.l.',
  },
  {
    sezione: 'F. Pagamento',
    id: 'spend_cap',
    voce: 'Soglia di spesa (spend cap) a 1.000 EUR/mese sull\'account',
    obbligatorio: false,
    verificabile_via_preflight: false,
    richiesta: 'Imposta uno spend cap di 1.000 EUR/mese sull\'account pubblicitario: e\' la rete di sicurezza vera, ferma Meta anche se qualcuno sbaglia un budget. Consigliata esplicitamente a Mauro, protegge lui e noi.',
  },
  {
    sezione: 'G. Permessi per i lead',
    id: 'leads_retrieval',
    voce: 'Permesso leads_retrieval sul token',
    obbligatorio: true,
    verificabile_via_preflight: true,
    richiesta: 'Assicurati che il token abbia il permesso leads_retrieval, altrimenti i lead dei moduli istantanei non sono leggibili via API. Il token di Pagina NON lo eredita: va concesso esplicitamente. Gia\' incontrato su un altro cliente.',
  },
  {
    sezione: 'H. Privacy',
    id: 'privacy_url',
    voce: 'URL della privacy policy (obbligatorio su ogni modulo lead)',
    obbligatorio: true,
    verificabile_via_preflight: false,
    richiesta: 'Conferma l\'URL della privacy policy da usare nei moduli lead (senza, Meta rifiuta il modulo). Oggi in config.example.json: https://www.sheishair.com/privacy-policy/ — verifica che sia quello giusto e raggiungibile.',
  },
  {
    sezione: 'H. Privacy',
    id: 'destinatario_lead',
    voce: 'Chi riceve i lead e su quale casella',
    obbligatorio: true,
    verificabile_via_preflight: false,
    richiesta: 'Chi deve ricevere i lead raccolti, e su quale email/CRM? Senza una destinazione reale i contatti restano dentro Meta e nessuno li vede.',
  },
];

export const OBBLIGATORIE = CHECKLIST.filter((v) => v.obbligatorio);
