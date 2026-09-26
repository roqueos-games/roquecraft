#!/usr/bin/env node
// Lançador da sonda de jornada. A sonda de verdade é o `.impl.mjs` ao lado.
//
// Ela importa `src/` direto, e `src/` é código de Vite: imports relativos sem
// extensão que o loader ESM do Node não resolve. Sob `node` ela morreria no
// primeiro import, antes de medir coisa nenhuma — foi o que aconteceu com a
// sonda de malha, que passou dias "quebrada" sem estar. Este arquivo só
// re-executa a sonda sob `vite-node`, repassando argumentos e código de saída.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const sonda = path.join(aqui, 'qa-roquecraft-itens-mortos.impl.mjs')
const viteNode = path.join(raiz, 'node_modules', '.bin', 'vite-node')

const filho = spawn(viteNode, [sonda, ...process.argv.slice(2)], { stdio: 'inherit', cwd: raiz })
filho.on('error', (err) => {
  console.error('[jornada] nao consegui rodar o vite-node:', err.message)
  console.error('[jornada] esta sonda precisa dele: `yarn` na raiz resolve.')
  process.exit(1)
})
filho.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
