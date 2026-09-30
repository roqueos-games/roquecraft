// O `dist/pwa` que as sondas de QA esperam, feito do jogo deste repo.
//
// As sondas vieram do RoqueOS sem mudança: elas servem `dist/pwa` (o build do
// front), abrem `/app`, esperam `window.__rosStore` e chamam
// `__rosStore.openWindow('roquecraft')`. Aqui não há RoqueOS. Este arquivo
// constrói a página de desenvolvimento do repo (`index.html` + `dev/main.js`,
// com o host de desenvolvimento do SDK) com o Vite do repo em `dist/pwa`, e
// escreve ao lado um `app.html` igual ao `index.html` com um `__rosStore` de
// mentira na frente: abrir a janela não faz nada porque o jogo já abre sozinho.
// O `servidor-do-dist.mjs` (o mesmo do front) serve o `app.html` em `/app`.
//
// De brinde, é o build que prova que o Worker do terreno sai como arquivo
// próprio e é servido (ver o relatório que isto imprime).
//
//   node qa/lib/preparar-dist.mjs      (da raiz do repo)
import { build } from 'vite'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '../..')
const saida = join(raiz, 'dist/pwa')

await build({ root: raiz, logLevel: 'warn', build: { outDir: saida, emptyOutDir: true } })

// O `__rosStore` das sondas: só o que elas chamam. `notifications` fica vazio de
// propósito (o host de desenvolvimento avisa no console, não numa bandeja), e a
// sonda que conta aviso na bandeja não tem o que contar aqui.
const SHIM = `<script>
  window.__rosStore = {
    // Diz às sondas que aqui não há RoqueOS: a galeria de jogos, a janela e o
    // dock são do front, e a cena que os fotografa se pula em vez de esperar
    // 30 s por um seletor que nunca vem.
    semRoqueOS: true,
    windows: [{ id: 'roquecraft', appId: 'roquecraft' }],
    notifications: [],
    openWindow() { return { id: 'roquecraft' } },
    maximizeWindow() {},
  }
</script>`
const index = readFileSync(join(saida, 'index.html'), 'utf8')
writeFileSync(join(saida, 'app.html'), index.replace('<head>', `<head>\n    ${SHIM}`))

const assets = readdirSync(join(saida, 'assets'))
const worker = assets.filter((f) => /chunkWorker/.test(f))
console.log(
  JSON.stringify(
    {
      dist: saida,
      app: existsSync(join(saida, 'app.html')),
      worker,
      arquivos: assets.length,
    },
    null,
    2,
  ),
)
