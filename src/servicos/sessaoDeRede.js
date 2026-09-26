// RoqueCraft - A PONTE ENTRE O JOGO E O MULTIJOGADOR.
//
// `useRoqueCraftMultijogador` não conhece `world`, `player`, `entidades` nem
// `settings`: ele pede à "sessão" o que precisa, e quem responde é isto aqui.
// Publicar campo a campo era o que espalhava `player`, `yaw`, `survival`,
// `heldItem` e `settings` pelo multijogador inteiro.
//
// ⚠️ SAIU DO `.vue` QUANDO A RESTAURAÇÃO DE SESSÃO ENTROU (RC-03, 12/09/2026).
// O objeto tinha 45 linhas de fiação e o conserto do RC-03 acrescentaria mais
// 30; o guard de tamanho de componente reprovou, e estava certo. A fiação é do
// componente por natureza — o que mudou é que esta ponte deixou de ser fiação e
// virou um CONTRATO: o multijogador depende de cada um destes nomes, e quem
// esquecer um só descobre pelo jogador. Com dono próprio, ela ganha teste.
//
// ⚠️ TODO `let` DO COMPONENTE ENTRA POR GETTER, e os que este módulo ESCREVE
// entram por par getter+setter. A regra é a 44, e a razão é concreta: `world`,
// `mobilia`, `noiseCtx`, `ticks`, `yaw` e `pitch` são reatribuídos em quatro
// lugares (entrar na sala, sair, trocar de qualidade, desmontar). Recebidos por
// valor, este módulo trabalharia sobre uma partida morta, em silêncio.

import { restaurarSessaoSolo } from './sessaoSolo.js'

/**
 * @param {object} a  acesso ao mundo vivo, tudo por função
 */
export function criarSessaoDeRede(a) {
  return {
    instantaneo: () => ({
      x: a.player().x,
      y: a.player().y,
      z: a.player().z,
      yaw: a.yaw(),
      health: a.survival().health,
      item: a.itemNaMao(),
      skin: a.skin(),
      act: a.minerando() ? 'dig' : '',
    }),
    criaturas: () => a.entidades().mobs(),
    definirCriaturas: (lista) => a.entidades().definirMobs(lista),
    // Golpe que chegou pela rede: o anfitrião é a fonte da verdade das
    // criaturas. Desde a Onda 6.4 a intenção é VALIDADA antes (`intencao.js`):
    // o composable passa a posição do atacante e este módulo a do alvo.
    posicaoDaCriatura: (mobId) => {
      const m = a
        .entidades()
        .mobs()
        .find((x) => x.id === mobId)
      return m ? { x: m.x, y: m.y, z: m.z } : null
    },
    golpear: (mobId, dano) => {
      const m = a
        .entidades()
        .mobs()
        .find((x) => x.id === mobId)
      if (m && a.ferirCriatura(m, dano)) {
        a.entidades().spawnDropsFrom(m)
        a.entidades().remover(m)
      }
    },
    aplicarEdicoes: (lista) => a.world().editBatch(lista),
    // Onda 6.3: a mobília é da sala.
    mobiliaSerializada: () => a.mobiliaSerializada(),
    entradaDeMobilia: (k) => a.entradaDeMobilia(k),
    entradaParaEnvio: (k) => a.entradaParaEnvio(k),
    aplicarMobilia: (k, dado) => a.aplicarMobilia(k, dado),
    temMundo: () => !!a.world(),
    liquidoEm: (x, y, z) => a.world().liquidAt(x, y, z),
    audio: () => a.audio(),
    semente: () => a.seed(),
    modo: () => a.modo(),
    edicoes: () => a.editsMap(),
    instante: () => a.ticks(),
    // Onda 6.1: o relógio e a sobrescrita do tempo são do anfitrião.
    acertarRelogio: (ticks) => a.definirInstante(ticks),
    climaForcado: () => a.climaForcado(),
    acertarClima: (chuva) => a.forcarClima(chuva),
    raioDeSync: () => a.raioDeSync(),
    centroEmChunk: () => a.centroEmChunk(),
    /**
     * Recomeça a partida numa semente — "abrir outro mundo".
     *
     * ⚠️ NÃO CONFUNDIR COM `restaurarSolo`. Aqui o mundo é OUTRO: o convidado
     * que entra numa sala de semente diferente joga o mundo do anfitrião, então
     * o terreno é regenerado LIMPO (`reset(semente, null)`) e as criaturas
     * somem. O inventário e a vida do jogador continuam dele, de propósito —
     * quem muda é o mundo, não a pessoa.
     */
    recomecarEm: (semente) => {
      // O instante NÃO vem aqui: o relógio é do anfitrião (Onda 6.1) e chega
      // pela assinatura, dentro de 2 s da entrada.
      a.definirSemente(semente)
      const ruido = a.criarRuido(semente)
      a.definirRuido(ruido)
      a.world().reset(semente, null)
      a.posicionarJogador(a.procurarSpawn())
      a.entidades().limpar()
      // A mobília é do MUNDO: a do convidado ficaria em coordenadas de outro
      // terreno. A da sala chega pela assinatura.
      a.limparMobilia()
    },
    guardar: () => a.guardar(),
    definirSkin: (id) => a.definirSkin(id),

    // RC-03: a sessão que volta da sala é o payload INTEIRO do save, e não
    // `{ semente, instante }`. `sessaoSolo.js` tem a lista e a ordem.
    instantaneoCompleto: () => a.payloadDoSave(),
    restaurarSolo: (salvo) =>
      restaurarSessaoSolo(salvo, {
        definirEstado: (i, cru) => a.aplicarEstado(i, cru),
        definirEdicoes: (edits) => a.aplicarEdicoes(edits),
        definirEntidades: (cru) => a.entidades().restaurarDoSave(cru),
        definirJogador: (p) => a.posicionarJogador(p),
        // Com as edições, e não `null`: sem elas o terreno volta limpo.
        reiniciarMundo: (semente) => a.world().reset(semente, a.editsMap()),
      }),
  }
}
