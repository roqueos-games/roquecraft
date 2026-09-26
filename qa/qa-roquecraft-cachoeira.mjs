#!/usr/bin/env node
// Lançador da sonda de cachoeira. A sonda de verdade é o `.impl.mjs` ao lado.
//
// Ela importa `src/services/roquecraft/worldgen` direto — precisa achar, no
// MESMO mundo que o navegador vai gerar, onde a cachoeira caiu — e `src/` é
// código de Vite: imports relativos sem extensão que o loader ESM do Node não
// resolve. Sob `node` ela morreria no primeiro import, antes de medir nada.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const sonda = path.join(aqui, 'qa-roquecraft-cachoeira.impl.mjs')
const viteNode = path.join(raiz, 'node_modules', '.bin', 'vite-node')

const filho = spawn(viteNode, [sonda, ...process.argv.slice(2)], { stdio: 'inherit', cwd: raiz })
filho.on('error', (err) => {
  console.error('[cachoeira] nao consegui rodar o vite-node:', err.message)
  console.error('[cachoeira] esta sonda precisa dele: `yarn` na raiz resolve.')
  process.exit(1)
})
filho.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
