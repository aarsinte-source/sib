/**
 * Output colorato condiviso da tutti gli script del kit (launch.mjs,
 * campagna_da_brief.mjs, stato_accessi.mjs). Un solo posto: se cambia lo
 * stile, cambia ovunque insieme.
 */
export const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};

export const ok    = (m) => console.log(`  ${C.green}OK${C.reset}    ${m}`);
export const warn  = (m) => console.log(`  ${C.yellow}ATTENZIONE${C.reset}  ${m}`);
export const fail  = (m) => console.log(`  ${C.red}BLOCCO${C.reset}  ${m}`);
export const info  = (m) => console.log(`  ${C.dim}·${C.reset}     ${m}`);
export const title = (m) => console.log(`\n${C.bold}${C.cyan}${m}${C.reset}\n${C.dim}${'─'.repeat(Math.max(m.length, 60))}${C.reset}`);
