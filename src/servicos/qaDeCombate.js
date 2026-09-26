// GANCHO DE QA: O GOLPE, O DANO E A FLECHA.
//
// COMBATE, pra sonda poder medir o golpe em vez de eu olhar a barra e achar.
// Devolve o estado cru: recarga que falta, régua da arma na mão, e o último
// golpe resolvido com carga e crítico.
//
// ⚠️ `attackCooldown`, `recargaAtual` e `ultimoGolpe` são variáveis de módulo
// do componente e mudam a cada quadro. Entram por GETTER; capturá-las daria à
// sonda o estado do instante da criação do gancho, que é sempre "recarga zero,
// nenhum golpe" - e o teste passaria feliz medindo nada.
//
// É SERVIÇO E NÃO COMPOSABLE: só lê e delega. Nada pra desligar.

import { PECAS, pontosDe } from './armadura.js'
import { efeitosAtivos, limparEfeitos } from './efeitos.js'
import { cargaDe } from './combate.js'

/**
 * @param {object} ctx
 * @param {() => number} ctx.restante  segundos de recarga que faltam
 * @param {() => number} ctx.total  recarga da arma na mão
 * @param {() => object|null} ctx.ultimo  o último golpe resolvido
 * @param {() => void} ctx.atacar  o MESMO caminho do clique (`tryAttack`)
 * @param {(n: number, fonte: string, de?: {x:number,z:number}) => {aparado: boolean, aplicado: number}} ctx.machucar
 *   o dano do jogo. DEVOLVE se a guarda aparou CHEIO — é por esse campo que
 *   `useRoqueCraftEntidades` decide se o empurrão vem junto. `hurt` repassa.
 * @param {() => boolean} [ctx.guardaLevantada]  a guarda (escudo/braço) está de pé?
 * @param {object} ctx.survival  estado reativo de vida/fome
 * @param {() => Array} ctx.flechas  GETTER: `flechas` é `let` no componente
 *   e é reatribuída ao entrar/sair do multiplayer e ao desmontar o jogo.
 */
export function criarQaDeCombate({
  restante,
  total,
  ultimo,
  atacar,
  machucar,
  survival,
  darNivel,
  efeitos,
  tomarEfeito,
  flechas,
  guardaLevantada = () => false,
}) {
  return {
    combateInfo: () => {
      const golpe = ultimo()
      return {
        restante: restante(),
        total: total(),
        carga: cargaDe(restante(), total()),
        ultimo: golpe ? { carga: golpe.carga, critico: golpe.critico } : null,
      }
    },

    // Dispara o MESMO caminho do clique. Uma sonda que chamasse `hurtMob`
    // direto testaria o módulo de novo e pularia justamente a fiação - que é
    // onde mora o defeito quando os testes de unidade estão verdes.
    attack: () => atacar(),

    // Com a FONTE: a armadura ameniza 'mob', 'arrow', 'explosion' e 'cactus',
    // e não 'fall' nem 'generic' — a sonda precisa dizer de onde veio o dano.
    // Com a ORIGEM `{x, z}`: a guarda só apara o que vem pela frente.
    hurt: (n, fonte = 'generic', de = null) => machucar(n, fonte, de),

    /** A guarda está levantada (botão direito segurado com escudo ou mão vazia)? */
    guardaLevantada: () => guardaLevantada(),

    /** O que está vestido: `{ helmet: 'iron_helmet' | null, ... }` e os pontos. */
    armaduraVestida: () => ({
      pecas: Object.fromEntries(PECAS.map((p) => [p, survival.armadura?.[p]?.item ?? null])),
      pontos: pontosDe(survival.armadura),
    }),

    // Sobe o nível do jogador pelo caminho do jogo. A mesa de encantamento é o
    // primeiro consumidor de XP que existe, e sem isto nenhuma sonda consegue
    // chegar em `survival.level` alto o bastante pra pagar um encanto.
    darNivel: (alvo) => darNivel(alvo),

    // Os efeitos com prazo ativos, e o caminho de BEBER. A sonda usa o segundo:
    // escrever no mapa direto testaria o mapa, e o que precisa de prova é a
    // fiação — que a velocidade chegue na física e o veneno na vida.
    efeitosInfo: () => efeitosAtivos(efeitos()),
    darEfeito: (nome, nivel = 1, duracao = null) => tomarEfeito(nome, nivel, duracao),
    limparEfeitos: () => limparEfeitos(efeitos()),

    matar: () => {
      machucar(999, 'generic')
      return survival.dead
    },

    // As flechas no ar. A sonda precisa disto pra saber QUANDO fotografar: sem
    // ele teria que cronometrar por fora e fotografaria o céu vazio achando que
    // fotografava um tiro.
    flechasInfo: () =>
      flechas().map((f) => ({
        id: f.id,
        x: +f.x.toFixed(2),
        y: +f.y.toFixed(2),
        z: +f.z.toFixed(2),
        idade: +f.idade.toFixed(2),
        forma: f.forma ?? 'flecha',
      })),
  }
}
