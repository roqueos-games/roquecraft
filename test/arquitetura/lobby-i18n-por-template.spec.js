import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { SKIN_IDS } from '../../src/servicos/skins.js'

/**
 * A CHAVE MONTADA POR TEMPLATE NÃO TEM QUEM A COBRE.
 *
 * Por quanto tempo ninguém viu, não dá pra dizer: `roqueCraft.mp.skins.areia`
 * existia nos dez idiomas com o valor literal `'undefined'` — a string, não o
 * valor. Alguém gerou a tradução a partir de um `undefined` e gravou o
 * resultado; a chave sobreviveu à remoção da skin e nenhuma skin `areia` existe
 * em `skins.js`.
 *
 * Nada acusava, e os dois lados do buraco explicam por quê: o gate de chaves
 * i18n compara os dez idiomas ENTRE SI, e a órfã estava nos dez; e o
 * `RCLobby.vue` monta três rótulos por TEMPLATE —
 *
 *     t(`roqueCraft.mp.skins.${s.id}`)   a skin escolhida
 *     t(`roqueCraft.mp.${mp.error}`)     o erro do lobby
 *     t(`roqueCraft.mp.${mp.mode}`)      "criando…" / "entrando…"
 *
 * — e uma chave montada em tempo de execução não aparece em varredura nenhuma
 * de chave literal. Este teste cruza os dois lados na mão, que é o que falta.
 *
 * ⚠️ NÃO É UM TESTE DE i18n GENÉRICO, e não deve virar um: onde a chave é
 * literal o gate de i18n já pega. Aqui só entra o que é montado.
 *
 * ⚠️ LÊ O MÓDULO, NÃO O TEXTO DO ARQUIVO. A primeira versão casava um regex
 * contra o fonte e parava no primeiro `}` — um valor com chave fechada dentro
 * truncava a captura e o teste acusaria "as oito faltando" em vez do erro real.
 * Quem entende a sintaxe é o parser.
 *
 * Veio de `tests/unit/architecture/lobby-i18n-por-template.spec.js` do RoqueOS
 * (7ab22a6f), com os mesmos casos e as mesmas asserções. O que mudou foi onde o
 * texto mora: lá era `src/i18n/<idioma>/roqueCraft.js`, um módulo por idioma;
 * aqui é `i18n/<idioma>.json`, sem o `roqueCraft.` na frente (o `t` do jogo tira
 * o prefixo, ver `src/textosDoJogo.js`). Quem lê continua sendo o parser, o de
 * JSON, que é o mesmo `JSON.parse` com que o jogo carrega o texto.
 */
const I18N = resolve('i18n')
const locais = readdirSync(I18N)
  .filter((f) => /^[a-z]{2}-[A-Z]{2}\.json$/.test(f))
  .map((f) => f.slice(0, -'.json'.length))
const TEXTOS = Object.fromEntries(
  locais.map((l) => [l, JSON.parse(readFileSync(resolve(I18N, `${l}.json`), 'utf8'))]),
)
const mpDe = (local) => TEXTOS[local]?.mp

const COMPOSABLE = resolve('src/composables/useRoqueCraftMultijogador.js')
const fonte = readFileSync(COMPOSABLE, 'utf8')
/** Todo `mp.error = 'x'` do composable — inclusive o que alguém acrescentar amanhã. */
const erros = [...new Set([...fonte.matchAll(/mp\.error\s*=\s*'(\w+)'/g)].map((m) => m[1]))]
  .filter(Boolean)
  .sort()
const modos = [...new Set([...fonte.matchAll(/mp\.mode\s*=\s*'(\w+)'/g)].map((m) => m[1]))].sort()

// Modo que o lobby NÃO escreve na tela, com o motivo. O `v-else-if` da linha 71
// do RCLobby desenha o rótulo só em 'creating' e 'joining'; os outros dois são
// estados de navegação e desenham a tela inteira, não uma frase.
const MODO_SEM_FRASE = {
  menu: 'é a própria tela do lobby, não uma mensagem',
  connected: 'é a tela da sala com o código e a lista de gente',
}

describe('o que o lobby monta por template tem tradução nos dez idiomas', () => {
  it('há os dez idiomas, oito skins, e os erros e modos saíram do composable', () => {
    expect(locais.length).toBe(10)
    expect(SKIN_IDS.length).toBe(8)
    expect(locais.every((l) => !!mpDe(l))).toBe(true)
    expect(erros.length).toBeGreaterThan(0)
    expect(modos.length).toBeGreaterThan(0)
  })

  it('cada idioma nomeia EXATAMENTE as skins que existem — nem a menos, nem órfã', () => {
    const esperado = [...SKIN_IDS].sort()
    const errados = []
    for (const l of locais) {
      const tem = Object.keys(mpDe(l).skins || {}).sort()
      const faltando = esperado.filter((id) => !tem.includes(id))
      const orfas = tem.filter((k) => !esperado.includes(k))
      if (faltando.length) errados.push(`${l}: skin sem nome → ${faltando.join(', ')}`)
      if (orfas.length) errados.push(`${l}: nome sem skin → ${orfas.join(', ')}`)
    }
    expect(errados).toEqual([])
  })

  it('todo erro que o composable levanta tem frase nos dez idiomas', () => {
    const mudos = []
    for (const l of locais) for (const e of erros) if (!mpDe(l)[e]) mudos.push(`${l}.mp.${e}`)
    expect(mudos).toEqual([])
  })

  it('todo modo que vira frase na tela tem frase nos dez idiomas', () => {
    const comFrase = modos.filter((m) => !MODO_SEM_FRASE[m])
    const mudos = []
    for (const l of locais) for (const m of comFrase) if (!mpDe(l)[m]) mudos.push(`${l}.mp.${m}`)
    expect(mudos).toEqual([])
  })

  it("nenhuma dessas frases é 'undefined', 'null' ou vazia", () => {
    const mortos = []
    const morta = (v) =>
      typeof v === 'string' && (!v.trim() || /^(undefined|null)$/i.test(v.trim()))
    for (const l of locais) {
      const mp = mpDe(l)
      for (const [k, v] of Object.entries(mp.skins || {}))
        if (morta(v)) mortos.push(`${l}.mp.skins.${k} = ${JSON.stringify(v)}`)
      for (const k of [...erros, ...modos])
        if (morta(mp[k])) mortos.push(`${l}.mp.${k} = ${JSON.stringify(mp[k])}`)
    }
    expect(mortos).toEqual([])
  })
})
