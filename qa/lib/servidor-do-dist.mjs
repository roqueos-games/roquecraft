// O SERVIDOR ESTÁTICO QUE AS SONDAS DE QA USAM.
//
// ⚠️ ELE EXISTE POR CAUSA DO HOSTING COMPOSTO (Goal 15).
//
// Antes, `dist/pwa/index.html` era o shell do app e toda sonda servia o
// diretório com fallback para `index.html`. Depois do `compose-site.mjs`, a
// raiz passou a ser o SITE e o shell do app virou `app.html` — então uma sonda
// rodada depois de um deploy abre o site institucional, espera por
// `window.__rosStore` e morre em timeout, com o jogo perfeitamente são.
//
// O fallback certo é: se `app.html` existe, o dist está composto e é ELE o
// shell; senão, `index.html`. Um lugar só, para o próximo Goal não quebrar
// sessenta sondas de novo.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const TIPO = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

/** O arquivo que responde por uma rota sem arquivo próprio. */
export function shellDoApp(dist) {
  const composto = path.join(dist, 'app.html')
  return fs.existsSync(composto) ? composto : path.join(dist, 'index.html')
}

/**
 * Sobe o dist numa porta livre. Devolve `{ base, fechar }`.
 *
 * @param {string} dist  caminho do diretório construído (normalmente dist/pwa)
 */
export async function servirDist(dist) {
  const raiz = path.resolve(dist)
  if (!fs.existsSync(raiz)) throw new Error(`${dist} não existe. Rode \`yarn build:app\` antes.`)
  const shell = shellDoApp(raiz)

  const s = http.createServer((q, r) => {
    const p = decodeURIComponent((q.url || '/').split('?')[0])
    let f = path.join(raiz, p)
    try {
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = shell
    } catch {
      f = shell
    }
    r.setHeader('Content-Type', TIPO[path.extname(f)] || 'application/octet-stream')
    fs.createReadStream(f).pipe(r)
  })
  await new Promise((r) => s.listen(0, r))
  return {
    base: `http://localhost:${s.address().port}`,
    fechar: () => s.close(),
  }
}
