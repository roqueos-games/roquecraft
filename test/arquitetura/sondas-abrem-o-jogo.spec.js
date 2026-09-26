import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// AS SONDAS PRECISAM CONSEGUIR ABRIR O JOGO.
//
// ⚠️ ELAS FICARAM CEGAS POR SEMANAS E NINGUÉM VIU.
//
// Toda sonda de QA do RoqueCraft sobe `dist/pwa` num servidor estático e cai no
// `index.html` quando a rota não tem arquivo próprio — o jeito certo desde
// sempre, até o Goal 15. Com o hosting composto, depois de um `yarn deploy` a
// raiz do dist é o SITE e o shell do app virou `app.html`: a sonda abre a
// página institucional, espera por `window.__rosStore` e morre em timeout, com
// o jogo perfeitamente são.
//
// O sintoma não parece um defeito de infraestrutura, parece a sonda estar
// quebrada — e uma sonda "quebrada" é uma sonda que se para de rodar. Foi por
// isso que este teste existe: a escolha do shell é de UM lugar
// (`qa/lib/servidor-do-dist.mjs`), e nenhuma sonda pode voltar a cravar
// `index.html` na mão.
//
// Veio de `tests/unit/architecture/sondas-abrem-o-jogo.spec.js` do RoqueOS
// (7ab22a6f): o `describe` das sondas, com os mesmos três casos. O do helper
// (`shellDoApp`) ficou no front, que continua com o helper dele. Aqui o
// `qa/lib/preparar-dist.mjs` escreve o `app.html` ao lado do `dist/pwa`, e o
// helper serve esse shell (ver `qa/README.md`).
const SCRIPTS = resolve('qa')
const sondas = readdirSync(SCRIPTS).filter(
  (f) => f.startsWith('qa-roquecraft-') && f.endsWith('.mjs'),
)
const fonte = (f) => readFileSync(resolve(SCRIPTS, f), 'utf8')

describe('sondas de QA do RoqueCraft', () => {
  it('existem, e não são poucas (prova de vida deste teste)', () => {
    expect(sondas.length).toBeGreaterThan(30)
  })

  it('nenhuma crava index.html como shell do app', () => {
    const cravadas = sondas.filter((f) =>
      /path\.join\(\s*DIST\s*,\s*'index\.html'\s*\)/.test(fonte(f)),
    )
    expect(
      cravadas,
      'depois de um `yarn deploy` a raiz do dist é o SITE. Use `shellDoApp(DIST)` ' +
        'ou `servirDist()` de qa/lib/servidor-do-dist.mjs:\n' +
        cravadas.join('\n'),
    ).toEqual([])
  })

  it('toda sonda que serve o dist usa o helper', () => {
    const semHelper = sondas.filter((f) => {
      const src = fonte(f)
      const serveODist = /const DIST\s*=/.test(src) && /createServer/.test(src)
      return serveODist && !/shellDoApp|servirDist/.test(src)
    })
    expect(semHelper, `sonda servindo dist/pwa sem o helper:\n${semHelper.join('\n')}`).toEqual([])
  })
})
