import { describe, it, expect } from 'vitest'
import {
  criarTrilha,
  definirMomento,
  avancarTrilha,
  noAr,
  ESPERA,
  PRIORIDADE,
  MOMENTOS,
  momentoAgora,
  PERTO_TENSAO,
} from '../../src/servicos/trilha.js'

// A trilha que o founder pediu (2026-08-23): "pianos bem lenta e calma igual ao
// jogo original... em todos os eventos, como dia, noite, batalha, morte e etc".
//
// O que se afirma aqui NÃO é gosto musical — é a regra que faz a música parecer
// a do jogo original: ela CALA. Uma faixa toca, vêm minutos de silêncio, vem
// outra. E as trocas de momento respeitam urgência: morrer corta o que estiver
// tocando; amanhecer não corta nada.

const ACERVO = {
  dia: [
    { arq: 'd0.mp3', dur: 60 },
    { arq: 'd1.mp3', dur: 30 },
  ],
  noite: [{ arq: 'n0.mp3', dur: 40 }],
  tensao: [{ arq: 't0.mp3', dur: 50 }],
  morte: [{ arq: 'm0.mp3', dur: 20 }],
  menu: [{ arq: 'u0.mp3', dur: 25 }],
}

/** Relógio determinístico: sem isto o teste depende de Math.random. */
const trilhaFixa = (valor = 0.5) => criarTrilha(() => valor)

/** Roda `segundos` em passos de `dt`, devolvendo tudo que começou a tocar. */
function correr(t, segundos, dt = 0.5) {
  const tocou = []
  for (let s = 0; s < segundos; s += dt) {
    const o = avancarTrilha(t, dt, ACERVO)
    if (o) tocou.push({ arq: o.arq, momento: o.momento, em: +s.toFixed(1) })
  }
  return tocou
}

describe('roquecraft - a trilha toca e CALA', () => {
  it('sem momento definido, não toca nada', () => {
    const t = trilhaFixa()
    expect(correr(t, 600)).toEqual([])
  })

  it('entra em cena assim que o momento é definido', () => {
    const t = trilhaFixa()
    definirMomento(t, 'dia')
    const tocou = correr(t, 5)
    expect(tocou).toHaveLength(1)
    expect(tocou[0].momento).toBe('dia')
    expect(noAr(t)).toBe(true)
  })

  it('⚠️ entre duas faixas há MINUTOS de silêncio, não emenda', () => {
    // Este é o teste que separa "trilha" de "leito em loop". Sem ele o jeito
    // fácil (tocar sem parar) passaria.
    const t = trilhaFixa(0.5) // espera = meio do intervalo
    definirMomento(t, 'dia')
    const tocou = correr(t, 400)
    expect(tocou.length).toBeGreaterThanOrEqual(2)
    const intervalo = tocou[1].em - tocou[0].em - ACERVO.dia[0].dur
    const [min, max] = ESPERA.dia
    expect(intervalo).toBeGreaterThanOrEqual(min - 1)
    expect(intervalo).toBeLessThanOrEqual(max + 1)
  })

  it('o silêncio é a maior parte do tempo', () => {
    const t = trilhaFixa(0.5)
    definirMomento(t, 'dia')
    let tocando = 0
    for (let s = 0; s < 1200; s += 0.5) {
      avancarTrilha(t, 0.5, ACERVO)
      if (noAr(t)) tocando += 0.5
    }
    expect(tocando / 1200).toBeLessThan(0.5)
  })

  it('não repete a mesma faixa duas vezes seguidas', () => {
    const t = criarTrilha(() => 0) // sorteio sempre no índice 0
    definirMomento(t, 'dia')
    const tocou = correr(t, 900)
    expect(tocou.length).toBeGreaterThan(2)
    for (let i = 1; i < tocou.length; i++) expect(tocou[i].arq).not.toBe(tocou[i - 1].arq)
  })

  it('momento sem faixa no acervo não trava nem tenta a cada quadro', () => {
    const t = trilhaFixa()
    definirMomento(t, 'dia')
    expect(() => correr(t, 60, 1 / 60)).not.toThrow()
    const vazio = trilhaFixa()
    definirMomento(vazio, 'dia')
    expect(avancarTrilha(vazio, 1, { dia: [] })).toBeNull()
  })

  it('dt zero ou negativo não avança nada', () => {
    const t = trilhaFixa()
    definirMomento(t, 'dia')
    expect(avancarTrilha(t, 0, ACERVO)).toBeNull()
    expect(avancarTrilha(t, -5, ACERVO)).toBeNull()
  })
})

describe('roquecraft - urgência manda na troca de momento', () => {
  it('morrer CORTA a faixa que estiver tocando', () => {
    const t = trilhaFixa()
    definirMomento(t, 'dia')
    correr(t, 5)
    expect(noAr(t)).toBe(true)
    expect(definirMomento(t, 'morte'), 'a morte não cortou a faixa').toBe(true)
    expect(noAr(t)).toBe(false)
    const tocou = correr(t, 3)
    expect(tocou[0]?.momento).toBe('morte')
  })

  it('perigo corta a música de exploração', () => {
    const t = trilhaFixa()
    definirMomento(t, 'noite')
    correr(t, 5)
    expect(definirMomento(t, 'tensao')).toBe(true)
    expect(correr(t, 3)[0]?.momento).toBe('tensao')
  })

  it('⚠️ amanhecer NÃO corta: a faixa da noite termina em paz', () => {
    // Cortar aqui seria o defeito clássico de trilha reativa — a música muda no
    // meio de uma frase musical toda vez que o relógio vira.
    const t = trilhaFixa()
    definirMomento(t, 'noite')
    correr(t, 5)
    const antes = noAr(t)
    expect(definirMomento(t, 'dia')).toBe(false)
    expect(noAr(t)).toBe(antes)
  })

  it('sair do perigo não corta a música de perigo, mas a próxima já é a normal', () => {
    const t = trilhaFixa()
    definirMomento(t, 'tensao')
    correr(t, 3)
    expect(definirMomento(t, 'dia')).toBe(false)
    expect(noAr(t)).toBe(true)
    const depois = correr(t, 400)
    expect(depois.length).toBeGreaterThan(0)
    expect(depois.every((x) => x.momento === 'dia')).toBe(true)
  })

  it('a faixa de morte toca UMA vez e cala até renascer', () => {
    const t = trilhaFixa()
    definirMomento(t, 'morte')
    const naMorte = correr(t, 1200)
    expect(naMorte).toHaveLength(1)
    // Renascer NÃO emenda música na hora — o silêncio volta a ser o normal do
    // momento novo. O que não pode é o `Infinity` da morte vazar e deixar a
    // trilha muda pro resto da partida.
    definirMomento(t, 'dia')
    expect(t.espera).toBeLessThanOrEqual(ESPERA.dia[1])
    expect(correr(t, 5), 'música emendou logo depois de renascer').toHaveLength(0)
    const depois = correr(t, 400)
    expect(depois.length).toBeGreaterThan(0)
    expect(depois[0].momento).toBe('dia')
  })

  it('entrar em perigo durante o silêncio começa a música na hora', () => {
    const t = trilhaFixa()
    definirMomento(t, 'dia')
    correr(t, 70) // a faixa de 60 s acabou, está no silêncio
    expect(noAr(t)).toBe(false)
    definirMomento(t, 'tensao')
    expect(correr(t, 2)[0]?.momento, 'perigo esperou o silêncio programado').toBe('tensao')
  })

  it('definir o mesmo momento de novo não reinicia nada', () => {
    const t = trilhaFixa()
    definirMomento(t, 'dia')
    correr(t, 5)
    const faixa = t.tocando
    expect(definirMomento(t, 'dia')).toBe(false)
    expect(t.tocando).toBe(faixa)
  })

  it('todo momento tem prioridade e intervalo declarados', () => {
    // Um momento novo sem entrada nas tabelas cairia em `undefined` e a trilha
    // ficaria muda sem ninguém perceber.
    for (const m of MOMENTOS) {
      expect(PRIORIDADE[m], `${m} sem prioridade`).toBeTypeOf('number')
      expect(m in ESPERA, `${m} sem intervalo declarado`).toBe(true)
    }
    expect(PRIORIDADE.morte).toBeGreaterThan(PRIORIDADE.tensao)
    expect(PRIORIDADE.tensao).toBeGreaterThan(PRIORIDADE.dia)
    expect(PRIORIDADE.dia).toBe(PRIORIDADE.noite)
  })

  // ── momentoAgora: a regra que morava no componente ────────────────────────
  //
  // Ela lia o estado do jogo e devolvia a string. Regra pura sem Vue e sem
  // timer é serviço (rule 44), e o serviço que já conhece os momentos é este.
  describe('momentoAgora', () => {
    const perseguidor = (over = {}) => ({ state: 'chase', dead: false, x: 0, z: 0, ...over })
    const base = { morto: false, noMenu: false, mobs: [], jogador: { x: 0, z: 0 }, noite: false }

    it('morte tem precedência sobre tudo', () => {
      expect(
        momentoAgora({ ...base, morto: true, noMenu: true, mobs: [perseguidor()], noite: true }),
      ).toBe('morte')
    })

    it('menu vem antes de tensão, noite e dia', () => {
      expect(momentoAgora({ ...base, noMenu: true, mobs: [perseguidor()] })).toBe('menu')
    })

    it('perseguidor DENTRO do raio liga a tensão', () => {
      const dentro = PERTO_TENSAO - 1
      expect(momentoAgora({ ...base, mobs: [perseguidor({ x: dentro })] })).toBe('tensao')
    })

    it('perseguidor FORA do raio não liga - senão tocaria a noite toda', () => {
      // O gatilho é "vem vindo atrás de você AGORA". Uma tensão que acendesse
      // com qualquer monstro no mundo deixaria de significar qualquer coisa.
      expect(momentoAgora({ ...base, mobs: [perseguidor({ x: PERTO_TENSAO })] })).toBe('dia')
      expect(momentoAgora({ ...base, mobs: [perseguidor({ x: 100, z: 100 })], noite: true })).toBe(
        'noite',
      )
    })

    it('quem não persegue e quem já morreu não contam', () => {
      expect(momentoAgora({ ...base, mobs: [perseguidor({ state: 'idle', x: 1 })] })).toBe('dia')
      expect(momentoAgora({ ...base, mobs: [perseguidor({ dead: true, x: 1 })] })).toBe('dia')
    })

    it('mede a distância a partir do JOGADOR, não da origem', () => {
      // CONTROLE: com o jogador longe da origem, um monstro colado nele tem que
      // acender. Uma conta que esquecesse o jogador leria distância 900 e diria
      // "dia" com o zumbi encostado.
      const jogador = { x: 900, z: -300 }
      expect(momentoAgora({ ...base, jogador, mobs: [perseguidor({ x: 901, z: -300 })] })).toBe(
        'tensao',
      )
      expect(momentoAgora({ ...base, jogador, mobs: [perseguidor({ x: 0, z: 0 })] })).toBe('dia')
    })

    it('sem nada acontecendo, é o relógio que decide', () => {
      expect(momentoAgora({ ...base, noite: false })).toBe('dia')
      expect(momentoAgora({ ...base, noite: true })).toBe('noite')
    })
  })
})
