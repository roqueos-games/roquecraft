import { describe, it, expect } from 'vitest'
import { creditos, secaoDoPack } from '../../src/servicos/creditos.js'
import ptBR from '../../i18n/pt-BR.json'
import enUS from '../../i18n/en-US.json'

const LOCAIS = { 'pt-BR': ptBR, 'en-US': enUS }

// Resolve `roqueCraft.credits.x` dentro de um arquivo de locale.
const traduz = (loc, chave) =>
  chave
    .replace(/^roqueCraft\./, '')
    .split('.')
    .reduce((o, k) => o?.[k], loc)

const textoDe = (secs, loc) =>
  secs
    .flatMap((s) => s.linhas)
    .map((l) => `${l.forte || ''} ${l.texto || ''} ${l.t ? traduz(loc, l.t) || '' : ''}`)
    .join(' ')

describe('créditos', () => {
  const comPack = creditos({ trocadas: 9, total: 81, tile: 128 })

  it('toda linha tem nome próprio ou chave de i18n - nunca prosa crua', () => {
    // A primeira versão trazia os parágrafos em português cravados no módulo:
    // a tela saía com título traduzido e corpo em português (QA de
    // 2026-08-22). `texto` só pode carregar nome de gente, nunca frase.
    for (const s of comPack) {
      for (const l of s.linhas) {
        expect(l.forte || l.t, `seção ${s.id} tem linha sem nome e sem chave`).toBeTruthy()
        if (l.texto) {
          expect(
            l.texto.split(' ').length,
            `"${l.texto}" parece frase; frase vai pro i18n`,
          ).toBeLessThan(8)
        }
      }
    }
  })

  it('toda chave de i18n existe em pt-BR e en-US', () => {
    for (const s of comPack) {
      for (const chave of [s.t, ...s.linhas.map((l) => l.t)].filter(Boolean)) {
        for (const [nome, loc] of Object.entries(LOCAIS)) {
          expect(traduz(loc, chave), `${chave} falta em ${nome}`).toBeTruthy()
        }
      }
    }
  })

  it('nomeia quem fez o RoqueCraft', () => {
    expect(textoDe(creditos(null), ptBR)).toContain('Roque Ribeiro')
  })

  // O jogo é um tributo declarado. Sem estas duas coisas ele passa a parecer
  // outra: a segunda é a que diz que não somos a Mojang.
  it('credita Minecraft e nega vínculo com a Mojang, nos dois idiomas', () => {
    expect(textoDe(creditos(null), ptBR)).toMatch(/Markus Persson/)
    expect(textoDe(creditos(null), ptBR)).toContain('Mojang')
    expect(traduz(ptBR, 'roqueCraft.credits.tributeLine')).toMatch(/não tem vínculo/i)
    expect(traduz(enUS, 'roqueCraft.credits.tributeLine')).toMatch(/not affiliated/i)
  })

  it('credita o motor', () => {
    expect(textoDe(creditos(null), ptBR)).toContain('three.js')
  })

  it('sem pack instalado, não existe seção de pack', () => {
    expect(creditos(null).some((s) => s.id === 'pack')).toBe(false)
    expect(creditos({ trocadas: 0, total: 81, tile: 64 }).some((s) => s.id === 'pack')).toBe(false)
  })

  // Com pack, duas coisas precisam estar ditas: de quem é, e que fica na
  // máquina de quem instalou.
  it('com pack instalado, credita o autor e diz que nada é redistribuído', () => {
    const sec = secaoDoPack({ trocadas: 9, total: 81, tile: 128 })
    expect(textoDe([sec], ptBR)).toContain('Continuum Graphics')
    expect(traduz(ptBR, 'roqueCraft.credits.packLine')).toMatch(/não redistribui/i)
    expect(traduz(enUS, 'roqueCraft.credits.packLine')).toMatch(/redistributes .*nothing|nothing/i)
    const contagem = sec.linhas.find((l) => l.t?.endsWith('packCount'))
    expect(contagem.params).toEqual({ n: 9, total: 81, px: 128 })
  })
})
