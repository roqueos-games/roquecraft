import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

//
// A VARREDURA DAS SONDAS TEM QUE TER ACONTECIDO, E TER DADO VERDE.
//
// ⚠️ AS SONDAS NÃO ESTAVAM EM GATE NENHUM, e apodreciam sem ninguém ver. Em
// 18/09/2026 as 91 foram rodadas uma a uma pela primeira vez em semanas: a
// sonda de PRODUÇÃO do jogo procurava um botão que o site deixou de ter no
// Goal 15 — oito dias vermelha em silêncio — e outras três acusavam o jogo por
// estarem velhas (a aldeia mudou de lugar, o minimapa virou disco, a aranha
// passou a dropar olho).
//
// Rodar as 85 leva uma hora: não cabe aqui. O que cabe é ler o que a última
// varredura escreveu (`qa/qa-roquecraft-varredura.json`, gerado por
// `node qa/qa-sondas.mjs`) e cobrar três coisas:
//
//   1. toda sonda do disco foi varrida (sonda nova sem varredura reprova);
//   2. nenhuma está VERMELHA — teto ZERO, não catraca;
//   3. a varredura não é velha demais para significar alguma coisa.
//
// `nao-rodou` (navegador ausente na máquina que varreu) NÃO é vermelho: é a
// máquina, e a mensagem diz o que instalar. Mas não pode ser eterno — a regra
// 3 cobra a varredura inteira, e a 4 cobra que essas voltem a rodar.
//
// Veio de `tests/unit/architecture/sondas-varridas.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.
// As sondas, o ledger e o `qa-sondas.mjs` moram em `qa/`, e não em `scripts/`.

const DIR = resolve('qa')
const LEDGER_PATH = resolve(DIR, 'qa-roquecraft-varredura.json')
/** Quanto a varredura pode envelhecer antes de deixar de valer. */
export const FOLGA_DIAS = 21
/** Quantas sondas podem ficar sem navegador antes de isso virar defeito. */
export const TETO_NAO_RODOU = 3

const sondas = readdirSync(DIR)
  .filter((f) => /^qa-roquecraft.*\.mjs$/.test(f) && !/\.impl\./.test(f))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort()

const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) : null

describe('as sondas do RoqueCraft foram varridas, e estão verdes', () => {
  it('a varredura existe', () => {
    expect(ledger, 'sem qa/qa-roquecraft-varredura.json: rode node qa/qa-sondas.mjs').not.toBeNull()
  })

  it('toda sonda do disco está na varredura', () => {
    const faltam = sondas.filter((s) => !ledger?.sondas?.[s])
    expect(
      faltam,
      `sonda(s) nunca varrida(s): ${faltam.join(', ')}. Rode node qa/qa-sondas.mjs ${faltam.map((f) => f.replace('qa-roquecraft-', '')).join(' ')}`,
    ).toEqual([])
  })

  it('a varredura não fala de sonda que não existe mais', () => {
    const fantasmas = Object.keys(ledger?.sondas ?? {}).filter((s) => !sondas.includes(s))
    expect(fantasmas, `no ledger e não no disco: ${fantasmas.join(', ')}`).toEqual([])
  })

  it('⚠️ nenhuma sonda está VERMELHA — teto ZERO, não catraca', () => {
    const vermelhas = Object.entries(ledger?.sondas ?? {})
      .filter(([, s]) => s.estado === 'vermelha')
      .map(([n, s]) => `${n} (exit ${s.exit}, ${s.quando?.slice(0, 10)})`)
    expect(
      vermelhas,
      `sonda(s) vermelha(s) na última varredura — o jogo ou a sonda está errado, e um dos dois tem que mudar:\n  ${vermelhas.join('\n  ')}`,
    ).toEqual([])
  })

  it('a varredura não está velha demais para significar alguma coisa', () => {
    const quando = new Date(ledger?.varridoEm ?? 0).getTime()
    const idadeDias = (Date.now() - quando) / 86_400_000
    expect(
      idadeDias,
      `a última varredura foi há ${Math.round(idadeDias)} dias (folga: ${FOLGA_DIAS}). Rode node qa/qa-sondas.mjs — leva ~1 h.`,
    ).toBeLessThanOrEqual(FOLGA_DIAS)
  })

  it('⚠️ `varridoEm` é a sonda mais VELHA — varrer uma sonda só não rejuvenesce as outras', () => {
    // `node qa/qa-sondas.mjs porta` roda uma e regrava o ledger. Se
    // `varridoEm` fosse o relógio da rodada, esse filtro zeraria a folga de 21
    // dias da varredura inteira e o gate acima viraria decoração.
    const datas = Object.values(ledger?.sondas ?? {})
      .map((s) => s.quando)
      .filter(Boolean)
      .sort()
    expect(datas.length).toBeGreaterThan(0)
    expect(
      ledger.varridoEm <= datas[0],
      `varridoEm ${ledger.varridoEm} é mais novo que a sonda mais velha (${datas[0]})`,
    ).toBe(true)
  })

  it('sonda que "não rodou" por falta de navegador não vira permanente', () => {
    const naoRodou = Object.entries(ledger?.sondas ?? {})
      .filter(([, s]) => s.estado === 'nao-rodou')
      .map(([n]) => n)
    expect(
      naoRodou.length,
      `${naoRodou.length} sonda(s) sem navegador na máquina da varredura: ${naoRodou.join(', ')}. Instale (yarn playwright install webkit) e varra de novo.`,
    ).toBeLessThanOrEqual(TETO_NAO_RODOU)
  })

  it('todo estado do ledger é um dos quatro conhecidos', () => {
    const estranhos = Object.entries(ledger?.sondas ?? {}).filter(
      ([, s]) => !['verde', 'vermelha', 'nao-rodou', 'humana'].includes(s.estado),
    )
    expect(estranhos).toEqual([])
  })
})
