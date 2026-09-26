//
// A PAISAGEM — o que se ouve e a espuma que se vê, por quadro.
//
// A MISTURA em si mora em `ambiente.js`: qual leito toca e com que força é regra
// pura. Aqui fica a camada que o componente sabia e o serviço não — quem é o
// mundo, onde está o jogador, que horas são — e as DUAS CADÊNCIAS, que são o
// motivo deste arquivo existir.
//
// ⚠️ TRÊS RELÓGIOS DIFERENTES, E MISTURÁ-LOS É O DEFEITO:
//
//   · a névoa do borrifo anda a cada QUADRO, porque é animação;
//   · a varredura que ACHA a cachoeira anda a 1 Hz, porque achar quedas é
//     varrer um cubo de raio 14 — 24.389 células por passada — e a resposta
//     muda devagar: cachoeira não aparece entre um quarto de segundo e o outro;
//   · a mistura de ambiente anda a 4 Hz, junto do painel.
//
// Com uma cadência só, ou o borrifo engasga, ou o jogo paga cem mil leituras
// por segundo para responder a mesma coisa.
//
// ⚠️ E O SOM E A ESPUMA SAEM DA MESMA QUEDA. Se as duas contas divergissem, o
// jogador veria espuma num canto e ouviria a água no outro.
//
import { acharQuedas, forcaDaCachoeira, quedaDominante } from './cachoeira.js'
import { quantasNascem, nascerBorrifo, passoDoBorrifo, juntar } from './borrifo.js'
import { mixDeAmbiente, estaSobATerra } from './ambiente.js'
import { BIOME_NAMES } from './worldgen.js'

/** Quantas chamadas de `atualizar` entre duas varreduras de queda. */
export const PASSADAS_ATE_VARRER_QUEDA = 4

/**
 * @param {object} ctx
 * @param {() => object} ctx.mundo    cliente de mundo VIVO (pode ser nulo)
 * @param {() => object} ctx.motorDeEntidades  quem recebe o borrifo
 * @param {() => object} ctx.audio    motor de áudio VIVO
 * @param {object} ctx.jogador        posição, por referência
 * @param {() => boolean} ctx.pausado
 * @param {() => boolean} ctx.noite
 * @param {() => boolean} ctx.submerso
 * @param {() => number} ctx.chuva
 */
export function criarPaisagemSonora(ctx) {
  let passadas = 0
  let forcaDaQueda = 0
  let quedaDoBorrifo = null
  let gotas = []
  let sobra = 0

  function varrerCachoeira() {
    quedaDoBorrifo = null
    const w = ctx.mundo()
    if (!w) return 0
    const jogador = ctx.jogador
    const quedas = acharQuedas({ jogador, blocoEm: (x, y, z) => w.getBlock(x, y, z) })
    quedaDoBorrifo = quedaDominante({ quedas, jogador })
    return forcaDaCachoeira({ quedas, jogador })
  }

  /** Um quadro de borrifo. */
  function passo(dt) {
    const entidades = ctx.motorDeEntidades()
    if (!entidades) return
    gotas = passoDoBorrifo(gotas, dt)
    if (quedaDoBorrifo && !ctx.pausado()) {
      const r = quantasNascem(quedaDoBorrifo.forca, dt, sobra)
      sobra = r.sobra
      if (r.quantas)
        gotas = juntar(gotas, nascerBorrifo(quedaDoBorrifo.base, r.quantas, quedaDoBorrifo.forca))
    }
    entidades.syncBorrifo(gotas)
  }

  /** Uma passada de ambiente (4 Hz). Varre a queda a cada quatro. */
  function atualizar(bioma) {
    const a = ctx.audio()
    if (!a) return
    if (passadas++ % PASSADAS_ATE_VARRER_QUEDA === 0) forcaDaQueda = varrerCachoeira()
    const w = ctx.mundo()
    const jogador = ctx.jogador
    a.setAmbiente(
      mixDeAmbiente({
        bioma: BIOME_NAMES[bioma] || '',
        noite: ctx.noite(),
        subterraneo: estaSobATerra(
          jogador.y,
          w?.heightAt(Math.floor(jogador.x), Math.floor(jogador.z)),
        ),
        submerso: ctx.submerso(),
        altura: jogador.y,
        chuva: ctx.chuva(),
        cachoeira: forcaDaQueda,
      }),
    )
  }

  return { passo, atualizar, gotas: () => gotas, forcaDaQueda: () => forcaDaQueda }
}
