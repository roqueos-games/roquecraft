//
// O ALDEÃO — que era o zumbi com outra paleta.
//
// ⚠️ O FOUNDER DISSE QUE ELE "NÃO TEM NADA A VER" COM UM ALDEÃO, E O CÓDIGO
// CONCORDAVA. `buildMobModel` despachava `zombie | skeleton | aldeao` para o
// MESMO `montarHumanoide`; só a paleta mudava. Sem nariz, sem avental, sem
// chapéu, e — o pior — SEM VARIAÇÃO POR OFÍCIO: os quatro ofícios mudavam a
// casa e as ofertas, e nunca o boneco. Quatro aldeões idênticos numa praça,
// cada um vendendo outra coisa, obrigam a clicar em todos para saber quem é.
//
// ⚠️ E O COMENTÁRIO DE `CORPOS.aldeao` PROMETIA "túnica marrom, avental" —
// descrevia uma intenção que o código nunca cumpriu. Este arquivo passa a
// cobrar a promessa.
import { describe, it, expect } from 'vitest'
import { TRAJE_DO_OFICIO, buildMobModel, trajeDe } from '../../src/servicos/render/entities.js'
import { NOMES_DE_PROFISSAO } from '../../src/servicos/comercio.js'

// jsdom não tem canvas 2D e o grão procedural precisa de um. Mesmo ctx de
// mentira de `mobModelo.spec.js`, e no topo do módulo pelo mesmo motivo: os
// modelos são montados durante a COLETA, antes de qualquer `beforeAll`.
{
  const ctx2d = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    measureText: () => ({ width: 80 }),
    fillText: () => {},
    fillRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    set font(_v) {},
    set fillStyle(_v) {},
    set textAlign(_v) {},
    set textBaseline(_v) {},
  }
  HTMLCanvasElement.prototype.getContext = () => ctx2d
}

/** Quantas malhas o modelo tem, contando filhos de filhos. */
const contar = (g) => {
  let n = 0
  g.traverse(() => n++)
  return n
}

describe('o aldeão não é mais o zumbi repintado', () => {
  it('tem mais peças que o zumbi', () => {
    // A afirmação direta da queixa. Enquanto os dois saíam do mesmo molde, a
    // contagem era idêntica — e nada no repositório dizia isso em voz alta.
    const zumbi = contar(buildMobModel('zombie', false))
    const aldeao = contar(buildMobModel('aldeao', false, 'ferreiro'))
    expect(aldeao, 'o aldeão voltou a ter o corpo do zumbi').toBeGreaterThan(zumbi)
  })

  it('e ganha pelo menos rosto, avental e chapéu', () => {
    // Seis caixas a mais: nariz, sobrancelha, avental, duas alças, chapéu.
    const zumbi = contar(buildMobModel('zombie', false))
    const aldeao = contar(buildMobModel('aldeao', false, 'clerigo'))
    expect(aldeao - zumbi).toBeGreaterThanOrEqual(6)
  })

  it('o zumbi e o esqueleto não ganharam avental', () => {
    // A onda é do aldeão. Se o traje vazou para o molde compartilhado, os
    // monstros passam a usar avental de ofício — que é o mesmo erro ao contrário.
    for (const t of ['zombie', 'skeleton']) {
      expect(buildMobModel(t, false).userData.traje, `${t} ganhou traje`).toBeUndefined()
    }
  })
})

describe('cada ofício se reconhece de longe', () => {
  it('as quatro profissões do comércio têm traje', () => {
    // ⚠️ ÂNCORA NA FONTE. `comercio.js` é quem decide quais ofícios existem; um
    // ofício novo sem traje sairia como fazendeiro e ninguém veria.
    for (const p of NOMES_DE_PROFISSAO) {
      expect(TRAJE_DO_OFICIO[p], `ofício sem traje: ${p}`).toBeDefined()
    }
    expect(NOMES_DE_PROFISSAO.length).toBe(Object.keys(TRAJE_DO_OFICIO).length)
  })

  it('nenhum ofício usa o mesmo avental de outro', () => {
    const vistos = new Set(Object.values(TRAJE_DO_OFICIO).map((t) => t.avental))
    expect(vistos.size, 'dois ofícios com o mesmo avental: é o defeito de novo').toBe(
      Object.keys(TRAJE_DO_OFICIO).length,
    )
  })

  it('a profissão CHEGA no modelo, e cada uma chega diferente', () => {
    // ⚠️ ESTE É O TESTE DA ONDA. O defeito não era a tabela — era que
    // `buildMobModel(type, shadows)` não tinha um terceiro parâmetro, e
    // `syncMobs` nunca passou `m.profissao`. A cor final mora numa textura
    // procedural que não se lê de volta, então o que se afirma é a FIAÇÃO.
    const trajes = NOMES_DE_PROFISSAO.map(
      (p) => buildMobModel('aldeao', false, p).userData.traje.avental,
    )
    expect(new Set(trajes).size, 'dois ofícios chegaram com o mesmo avental').toBe(trajes.length)
    expect(buildMobModel('aldeao', false, 'ferreiro').userData.oficio).toBe('ferreiro')
  })

  it('ofício desconhecido não some: cai no fazendeiro', () => {
    expect(trajeDe('pirata')).toEqual(TRAJE_DO_OFICIO.fazendeiro)
    expect(trajeDe(null)).toEqual(TRAJE_DO_OFICIO.fazendeiro)
    expect(contar(buildMobModel('aldeao', false, null))).toBeGreaterThan(
      contar(buildMobModel('zombie', false)),
    )
  })
})

describe('parado, ele não é uma estátua', () => {
  it('o aldeão tem movimento de ocioso e o zumbi não', () => {
    // ⚠️ `ocioso` só era preenchido pela galinha. Humanoide sem velocidade tem
    // amplitude zero no passo e CONGELA — e é assim que um aldeão passa a maior
    // parte do tempo, porque ele fica na vila esperando alguém chegar.
    const aldeao = buildMobModel('aldeao', false, 'fazendeiro')
    expect(aldeao.userData.ocioso.length, 'o aldeão voltou a congelar parado').toBeGreaterThan(0)
    expect(buildMobModel('zombie', false).userData.ocioso.length).toBe(0)
  })

  it('o ocioso mexe em eixo que o passo não escreve, ou em peça que ele não toca', () => {
    // O laço do passo escreve `rotation.x` das pernas e dos braços a cada
    // quadro. Um ocioso no mesmo eixo da mesma peça seria apagado e o aldeão
    // continuaria estátua — com um teste verde por cima.
    const aldeao = buildMobModel('aldeao', false, 'fazendeiro')
    const doPasso = new Set((aldeao.userData.andar || []).map((a) => `${a.mesh.uuid}|${a.eixo}`))
    for (const o of aldeao.userData.ocioso) {
      expect(doPasso.has(`${o.mesh.uuid}|${o.eixo}`), 'ocioso apagado pelo passo').toBe(false)
    }
  })
})
