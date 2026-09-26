#!/usr/bin/env node
// RoqueCraft - GABARITO DA MALHA (lancador).
//
// ⚠️ ESTA SONDA PASSOU DIAS "QUEBRADA" SEM ESTAR QUEBRADA.
//
// Ela e a unica que importa `src/` DIRETO, em vez de falar com o jogo por um
// navegador. E `src/` e codigo de Vite: cento e nove imports relativos sem
// extensao (`from './constants'`), que o Vite resolve e o loader ESM do Node
// nao. Rodada com `node`, ela morria em ERR_MODULE_NOT_FOUND na primeira
// importacao -- antes de medir coisa nenhuma.
//
// Uma sonda que morre no import parece uma sonda com defeito. Ela nao tinha:
// sob `vite-node` roda inteira e passa em todas as sementes. O que estava
// errado era o LANCADOR, e o proprio cabecalho dela mandava usar `node`.
//
// Por isso este arquivo existe. `node scripts/qa-roquecraft-malha.mjs` continua
// sendo o comando -- ele so re-executa a sonda de verdade sob `vite-node`,
// repassando os argumentos e o codigo de saida. A alternativa seria escrever
// `.js` em cento e nove imports pra agradar um loader que so esta sonda usa.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const sonda = path.join(aqui, 'qa-roquecraft-malha.impl.mjs')
const viteNode = path.join(raiz, 'node_modules', '.bin', 'vite-node')

const filho = spawn(viteNode, [sonda, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: raiz,
})

filho.on('error', (err) => {
  console.error('[malha] nao consegui rodar o vite-node:', err.message)
  console.error('[malha] esta sonda precisa dele: `yarn` na raiz resolve.')
  process.exit(1)
})
filho.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
