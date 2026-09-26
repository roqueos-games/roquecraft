import { describe, it, expect } from 'vitest'
import {
  climaEm,
  precipitacaoNoBioma,
  luzSobChuva,
  LIMIAR_CHUVA,
  relampagoEm,
  atrasoDoTrovao,
  tempestadeDe,
  SOM_NO_AR,
  semRaioNaJanela,
  envelope,
} from '../../src/servicos/clima.js'
import { TICKS_PER_DAY } from '../../src/servicos/daycycle.js'

const SEMENTES = [1, 7, 42, 20260825, 999983]

/** Varre N dias de uma semente, um passo a cada `passo` ticks. */
function varrer(semente, dias = 200, passo = 200) {
  const fora = []
  for (let t = 0; t < dias * TICKS_PER_DAY; t += passo) fora.push(climaEm(semente, t))
  return fora
}

describe('clima — o tempo como função pura', () => {
  it('o mesmo mundo no mesmo instante tem sempre o mesmo céu', () => {
    for (const s of SEMENTES) {
      for (const t of [0, 1234, 98765, 3_000_000]) {
        expect(climaEm(s, t)).toEqual(climaEm(s, t))
      }
    }
    // ⚠️ CONTROLE: se a semente NÃO mudasse o tempo, o teste acima passaria com
    // um clima constante e não provaria nada. Duas sementes têm que discordar
    // em algum instante.
    const a = varrer(1, 30)
    const b = varrer(7, 30)
    const discordam = a.some((c, i) => Math.abs(c.umidade - b[i].umidade) > 0.05)
    expect(discordam, 'duas sementes deram o mesmo tempo — o clima não depende do mundo').toBe(true)
  })

  it('a frente CHEGA em vez de aparecer', () => {
    // Chuva que liga de um tick pro outro é o que denuncia clima de brinquedo.
    let maiorSalto = 0
    for (const s of SEMENTES) {
      let ant = climaEm(s, 0)
      for (let t = 60; t < 40 * TICKS_PER_DAY; t += 60) {
        const c = climaEm(s, t)
        maiorSalto = Math.max(maiorSalto, Math.abs(c.chuva - ant.chuva))
        ant = c
      }
    }
    // 60 ticks são ~3,6 s de jogo. Em 3,6 s a chuva não pode pular meio passo.
    expect(maiorSalto, `a chuva saltou ${maiorSalto} em 60 ticks`).toBeLessThan(0.06)
    // ⚠️ CONTROLE: e o salto não pode ser zero, senão "não salta" seria só
    // "não muda" — um clima travado passaria neste teste.
    expect(maiorSalto, 'a chuva não mudou nada em 40 dias').toBeGreaterThan(0)
  })

  it('chove parte do tempo, não o tempo todo nem nunca', () => {
    // O limiar é calibrado AQUI, não no olho. Se alguém mexer em LIMIAR_CHUVA
    // sem olhar, é este número que denuncia.
    const fracoes = SEMENTES.map((s) => {
      const v = varrer(s, 200)
      return v.filter((c) => c.chuva > 0.05).length / v.length
    })
    for (const f of fracoes) {
      expect(f, `chovendo ${(f * 100).toFixed(1)}% do tempo`).toBeGreaterThan(0.03)
      expect(f, `chovendo ${(f * 100).toFixed(1)}% do tempo`).toBeLessThan(0.35)
    }
  })

  it('a nuvem chega antes da chuva e sai depois', () => {
    // Céu limpo que abre em temporal no mesmo minuto é o defeito que esta
    // regra existe para impedir: em todo instante de chuva o céu já está
    // carregado.
    for (const s of SEMENTES) {
      for (const c of varrer(s, 120)) {
        if (c.chuva > 0.01) {
          expect(c.cobertura, `chuva ${c.chuva} com céu ${c.cobertura}`).toBeGreaterThan(0.7)
        }
      }
    }
    // E existe nublado SEM chuva — senão "nuvem antes da chuva" seria só
    // "sempre nublado".
    const houveNubladoSeco = SEMENTES.some((s) =>
      varrer(s, 120).some((c) => c.estado === 'nublado' && c.chuva === 0),
    )
    expect(houveNubladoSeco, 'nunca ficou nublado sem chover').toBe(true)
    const houveLimpo = SEMENTES.some((s) => varrer(s, 120).some((c) => c.estado === 'limpo'))
    expect(houveLimpo, 'o céu nunca abriu').toBe(true)
  })

  it('o rótulo do estado bate com os números', () => {
    for (const s of SEMENTES) {
      for (const c of varrer(s, 60)) {
        if (c.estado === 'chuva') expect(c.chuva).toBeGreaterThan(0.05)
        else expect(c.chuva).toBeLessThanOrEqual(0.05)
        if (c.estado === 'limpo') expect(c.cobertura).toBeLessThanOrEqual(0.55)
      }
    }
  })

  it('umidade abaixo do limiar não molha ninguém', () => {
    // A fronteira, conferida no ponto exato: é onde erro de sinal se esconde.
    for (const s of SEMENTES) {
      for (const c of varrer(s, 90)) {
        if (c.umidade < LIMIAR_CHUVA) expect(c.chuva).toBe(0)
      }
    }
  })

  it('não guarda estado nem depende de ordem', () => {
    // Se ler o futuro mudasse o presente, save e multiplayer divergiriam.
    const s = 20260825
    const direto = climaEm(s, 500_000)
    climaEm(s, 0)
    climaEm(s, 9_000_000)
    expect(climaEm(s, 500_000)).toEqual(direto)
  })
})

describe('clima — o bioma tem voto', () => {
  it('não chove no deserto e neva no gelo', () => {
    expect(precipitacaoNoBioma(1, 'Deserto')).toEqual({ chuva: 0, neve: 0 })
    expect(precipitacaoNoBioma(1, 'desert')).toEqual({ chuva: 0, neve: 0 })
    expect(precipitacaoNoBioma(0.8, 'snowy_taiga')).toEqual({ chuva: 0, neve: 0.8 })
    // ⚠️ O PAR DE CONTROLE: um bioma comum TEM que molhar, senão a regra acima
    // estaria só devolvendo zero pra tudo — que é o defeito mais fácil de
    // escrever e o mais difícil de ver num teste sem par.
    expect(precipitacaoNoBioma(0.8, 'forest')).toEqual({ chuva: 0.8, neve: 0 })
    expect(precipitacaoNoBioma(0.8, 'plains')).toEqual({ chuva: 0.8, neve: 0 })
  })

  it('nunca chove E neva ao mesmo tempo', () => {
    // ⚠️ ISTO É O QUE IMPEDE A NEVE DE MOLHAR O CHÃO. Neve se acumula e deixa a
    // superfície mais CLARA; o modelo de superfície molhada faz o oposto.
    // Quem lê a saída (o engine) escolhe entre os dois pelo maior — se os dois
    // pudessem vir positivos, o campo gelado escureceria 30% e ninguém veria,
    // porque no gelo tudo já é branco demais pra denunciar.
    for (const b of ['forest', 'plains', 'desert', 'snowy', 'snowy_taiga', 'frozen_ocean']) {
      for (const c of [0, 0.3, 0.7, 1]) {
        const p = precipitacaoNoBioma(c, b)
        expect(Math.min(p.chuva, p.neve), `${b} com chuva ${c} deu ${JSON.stringify(p)}`).toBe(0)
      }
    }
    // ⚠️ CONTROLE: e alguém TEM que nevar, senão "nunca os dois" seria só
    // "neve nunca acontece" — que passaria neste teste e apagaria a feature.
    expect(precipitacaoNoBioma(1, 'snowy').neve).toBeGreaterThan(0)
  })

  it('sem chuva global, nenhum bioma molha', () => {
    for (const b of ['forest', 'plains', 'desert', 'snowy']) {
      const p = precipitacaoNoBioma(0, b)
      expect(p.chuva + p.neve).toBe(0)
    }
  })

  it('a chuva rouba luz do dia — nem de menos, nem a ponto de anoitecer', () => {
    expect(luzSobChuva(0)).toBe(1)
    expect(luzSobChuva(0.5)).toBeLessThan(luzSobChuva(0))
    expect(luzSobChuva(0.5)).toBeGreaterThan(luzSobChuva(1))

    // ⚠️ A FAIXA VEM DA MEDIÇÃO, e ela existe nos DOIS lados de propósito.
    //
    // A primeira versão exigia só `< 0,5`, um número que eu escrevi antes de
    // medir qualquer coisa. Com a perda em 0,55 o teste passava — e a sonda
    // `qa-roquecraft-chuva` mediu o descampado perdendo 60% do brilho, que não
    // lê como chuva, lê como noite chegando às onze da manhã. O teste tinha
    // piso e não tinha TETO, então ele aprovou o defeito.
    //
    // O teto aqui é o par do teto da sonda (queda de cena entre 8% e 45%):
    // este número e aquele se multiplicam na tela, e separá-los é o que
    // permitiria um subir sem ninguém notar que o outro já estava no limite.
    expect(luzSobChuva(1), 'chuva quase não escureceu — vira som com sol').toBeLessThan(0.8)
    expect(luzSobChuva(1), 'chuva escureceu como se anoitecesse').toBeGreaterThan(0.6)
  })
})

describe('tempestade — o relâmpago', () => {
  const SEG = 1 / 20 // passo de amostragem, ~um quadro de jogo em 20 Hz

  function varrerRaios(semente, segundos = 600, forca = 1) {
    const v = []
    for (let t = 0; t < segundos; t += SEG) v.push(relampagoEm(semente, t, forca))
    return v
  }

  it('céu sem tempestade não solta raio nenhum', () => {
    for (const s of SEMENTES) {
      for (const r of varrerRaios(s, 120, 0)) expect(r.clarao).toBe(0)
    }
    // ⚠️ CONTROLE: e com tempestade TEM que soltar, senão "não solta raio" seria
    // só "a função devolve zero pra tudo" — que passaria e apagaria a feature.
    const comRaio = varrerRaios(SEMENTES[0], 120, 1).some((r) => r.clarao > 0.2)
    expect(comRaio, 'com tempestade cheia não caiu raio nenhum em 2 minutos').toBe(true)
  })

  it('o mesmo instante devolve sempre o mesmo raio', () => {
    for (const s of SEMENTES) {
      for (const t of [3.25, 91.238, 604.5]) {
        expect(relampagoEm(s, t, 1)).toEqual(relampagoEm(s, t, 1))
      }
    }
    // E sementes diferentes têm que discordar em algum instante.
    const a = varrerRaios(1, 120).map((r) => r.clarao)
    const b = varrerRaios(7, 120).map((r) => r.clarao)
    expect(a.some((c, i) => Math.abs(c - b[i]) > 0.1)).toBe(true)
  })

  it('cai raio de vez em quando, não a cada segundo nem uma vez por hora', () => {
    for (const s of SEMENTES) {
      const v = varrerRaios(s, 600, 1)
      // Conta subidas: quantas vezes o clarão passou de fraco pra forte.
      let raios = 0
      for (let i = 1; i < v.length; i++) {
        if (v[i].clarao > 0.5 && v[i - 1].clarao <= 0.5) raios++
      }
      const porMinuto = raios / 10
      expect(porMinuto, `${porMinuto.toFixed(1)} raios por minuto`).toBeGreaterThan(1)
      expect(porMinuto, `${porMinuto.toFixed(1)} raios por minuto`).toBeLessThan(12)
    }
  })

  it('o clarão sobe rápido e apaga — não fica aceso', () => {
    const v = varrerRaios(SEMENTES[2], 600, 1)
    const aceso = v.filter((r) => r.clarao > 0.15).length / v.length
    // ⚠️ ISTO É O QUE IMPEDE O ESTROBOSCÓPIO. Um envelope errado (ou uma janela
    // curta demais) deixaria o céu aceso metade do tempo, e a tempestade viraria
    // um pisca-pisca que ninguém aguenta jogar.
    expect(aceso, `céu aceso ${(aceso * 100).toFixed(1)}% do tempo`).toBeLessThan(0.2)
    expect(aceso, 'o clarão nunca acende').toBeGreaterThan(0.001)
  })

  it('o trovão chega depois do clarão, e mais tarde quanto mais longe', () => {
    expect(atrasoDoTrovao(0)).toBe(0)
    expect(atrasoDoTrovao(1)).toBeCloseTo(1000 / SOM_NO_AR, 5)
    expect(atrasoDoTrovao(3)).toBeGreaterThan(atrasoDoTrovao(1))
    // A distância sorteada tem que caber num intervalo que faça sentido de ouvir:
    // trovão de 30 s de atraso já não se liga ao clarão que o gerou.
    const distancias = varrerRaios(SEMENTES[1], 600, 1)
      .map((r) => r.distanciaKm)
      .filter((d) => d != null)
    expect(Math.min(...distancias)).toBeGreaterThan(0)
    expect(atrasoDoTrovao(Math.max(...distancias))).toBeLessThan(25)
  })

  it('tempestade é o topo da chuva, não um estado à parte', () => {
    expect(tempestadeDe(0)).toBe(0)
    expect(tempestadeDe(0.5), 'chuva média já virou tempestade').toBe(0)
    expect(tempestadeDe(1)).toBe(1)
    expect(tempestadeDe(0.75)).toBeGreaterThan(0)
    expect(tempestadeDe(0.75)).toBeLessThan(1)
  })
})

describe('tempestade — clarão e trovão são do MESMO raio', () => {
  // ⚠️ ESTE TESTE QUASE VIROU DECORAÇÃO, e o que salvou foi rodá-lo contra a
  // implementação que ele deveria reprovar. A forma anterior guardava clarão e
  // distância numa variável só, e eu ia commitar a separação como "conserto de
  // defeito". Rodei o teste contra ela: PASSOU. Porque a mistura só aconteceria
  // se um raio mais velho tivesse clarão maior que o mais novo, e não tem — as
  // janelas são de 5 s e o envelope morre em 0,42 s.
  //
  // O teste continua valendo como TRAVA (a separação passa a ser exigida, não
  // acidental), mas ele precisa provar que sabe reprovar alguém. Por isso o
  // controle abaixo é um MUTANTE escrito à mão: uma versão que pega a distância
  // do raio mais VELHO visível. Se o verificador não reprovar o mutante, o
  // verde na função de verdade não significa nada.
  const FATIA = 5

  /** Mutante: distância do raio mais velho, clarão do mais novo. */
  function relampagoTorto(semente, segundos, forca) {
    const real = relampagoEm(semente, segundos, forca)
    if (real.desdeORaio == null) return real
    // Envelhece a distância em uma janela inteira: é exatamente o erro que o
    // verificador tem que pegar.
    const outro = relampagoEm(semente, segundos - FATIA, forca)
    return { ...real, distanciaKm: outro.distanciaKm ?? real.distanciaKm + 1 }
  }

  /** O verificador, usado no sujeito E no mutante. */
  function distanciaBate(fn, semente, ate = 400) {
    let conferidos = 0
    for (let t = 0; t < ate; t += 1 / 20) {
      const r = fn(semente, t, 1)
      if (r.desdeORaio == null) continue
      const noInstante = relampagoEm(semente, t - r.desdeORaio + 1e-6, 1)
      conferidos++
      if (Math.abs(noInstante.distanciaKm - r.distanciaKm) > 1e-9) return { ok: false, conferidos }
    }
    return { ok: conferidos > 50, conferidos }
  }

  it('o verificador sabe reprovar: o mutante é pego', () => {
    const mutante = distanciaBate(relampagoTorto, SEMENTES[0])
    // O verificador para no PRIMEIRO desacordo, então aqui `conferidos` é 1 de
    // propósito — exigir 50 seria exigir que ele demorasse a perceber. Quem
    // precisa provar cobertura é o sujeito, no teste seguinte.
    expect(mutante.conferidos, 'nem chegou a olhar um raio').toBeGreaterThan(0)
    expect(mutante.ok, 'o mutante passou — o verificador está cego').toBe(false)
  })

  it('a distância pertence ao raio que o desdeORaio aponta', () => {
    for (const s of SEMENTES) {
      const r = distanciaBate(relampagoEm, s)
      expect(r.conferidos, `só ${r.conferidos} raios conferidos na semente ${s}`).toBeGreaterThan(
        50,
      )
      expect(r.ok, `distância de outro raio na semente ${s}`).toBe(true)
    }
  })

  it('o desdeORaio é o do raio MAIS RECENTE, nunca de um mais velho', () => {
    for (const s of SEMENTES) {
      let anterior = null
      for (let t = 0; t < 200; t += 1 / 20) {
        const r = relampagoEm(s, t, 1)
        if (r.desdeORaio == null) {
          anterior = null
          continue
        }
        // Enquanto nenhum raio novo cai, a idade do atual só CRESCE, no mesmo
        // passo do relógio. Se ela pular para trás sem trocar de raio, é sinal
        // de que a função trocou de raio no meio do caminho.
        if (anterior != null && r.desdeORaio > anterior) {
          expect(r.desdeORaio - anterior, `salto de idade em t=${t.toFixed(2)}`).toBeCloseTo(
            1 / 20,
            6,
          )
        }
        anterior = r.desdeORaio
      }
    }
  })
})

describe('clima — o limiar do raio e o perfil do clarão', () => {
  it('hash EXATAMENTE no limiar não vira raio', () => {
    // O limiar é exclusivo de propósito: com `>` no lugar do `>=`, a
    // probabilidade de raio numa janela deixa de ser `forca * TAXA` e passa a
    // incluir o próprio limiar. É a convenção que faz a taxa anunciada valer.
    const forca = 0.5
    const limiar = forca * 0.55
    expect(semRaioNaJanela(limiar, forca)).toBe(true)
    expect(semRaioNaJanela(limiar - Number.EPSILON, forca)).toBe(false)
    expect(semRaioNaJanela(0, forca)).toBe(false)
    expect(semRaioNaJanela(0.999, forca)).toBe(true)
  })

  it('tempestade zero: nenhum sorteio vira raio', () => {
    expect(semRaioNaJanela(0, 0)).toBe(true)
  })

  it('céu sem tempestade não relampeja — em nenhum instante', () => {
    // `forca <= 0` apertado para `<`: a tempestade exatamente ZERO, que é o
    // estado do céu limpo, passa a sortear raio. Clarão em dia de sol é o tipo
    // de coisa que o jogador reporta como "o jogo bugou".
    for (let s = 0; s < 200; s += 3.7) {
      expect(relampagoEm(20260827, s, 0)).toEqual({
        clarao: 0,
        desdeORaio: null,
        distanciaKm: null,
      })
    }
  })

  it('o clarão tem dois picos e uma cauda de 0,42 s', () => {
    // `t > 0.42` afrouxado para `>=` corta a cauda um instante antes do fim —
    // e no fim dela o clarão ainda vale ~0,008, que é o que faz o segundo
    // estouro escoar em vez de sumir de repente.
    expect(envelope(0.42)).toBeGreaterThan(0)
    expect(envelope(0.4200001)).toBe(0)
    expect(envelope(-0.0000001)).toBe(0)

    // O retorno principal é o mais forte, e o secundário reacende por volta de
    // 0,11 s — é isso que separa "um raio" de "uma lâmpada piscando".
    expect(envelope(0)).toBeGreaterThan(envelope(0.05))
    expect(envelope(0.11)).toBeGreaterThan(envelope(0.08))
  })
})
