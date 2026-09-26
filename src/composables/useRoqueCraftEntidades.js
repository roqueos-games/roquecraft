// RoqueCraft - ENTIDADES: as criaturas, os itens no chao e as flechas.
//
// Tudo que EXISTE no mundo alem do terreno e do jogador, mais os passos que as
// movem a cada quadro.
//
// E COMPOSABLE E NAO SERVICO porque e DONO de estado que vive enquanto a
// partida vive: as tres listas, os contadores de id e o relogio de nascimento.
// Um servico puro recebe e devolve; aqui as listas nascem, sao trocadas em
// mundo novo e morrem no desmonte, e ha um `limpar()` pra isso.
//
// ⚠️ POR QUE ESTADO E LOGICA SAIRAM JUNTOS. A tentativa anterior de separar
// mandava a logica pra um servico e deixava `mobs`, `drops` e `flechas` no
// componente. O resultado eram vinte fios de contexto e um `frame` que
// continuava com 48 dependencias. Estado que fica pra tras nao separa nada:
// so muda o endereco da logica.
//
// O CONTRATO SAO TRES GRUPOS COM NOME, e nao uma lista de variaveis:
// entidades vivem NUM mundo, interagem COM um jogador, dentro de uma PARTIDA.

import {
  MOB_TYPES,
  MAX_MOBS,
  MAX_HOSTIS,
  createMob,
  stepMob,
  hurtMob,
  shouldDespawn,
  mobDrops,
  pickSpawn,
  mobNoRaio,
  alturaDeMira,
  restaurarMobs,
  reidratarAldeoes,
  empurrar,
  FORCA_EMPURRAO,
  alturaDoApoio,
} from '../servicos/mobs.js'
import { pickSpawnAquatico } from '../servicos/nadoSpawn.js'
import { acharCasal, procriar, TEMPO_DE_BEBE } from '../servicos/pecuaria.js'
import {
  mirar,
  criarFlecha,
  passoDaFlecha,
  DANO_DA_FLECHA,
  RAIO_DE_ACERTO,
} from '../servicos/flechas.js'
import {
  criarArco,
  armar,
  soltar,
  cargaDe,
  flechaDoJogador,
  criaturaAtingida,
} from '../servicos/arco.js'
import { frascoDoJogador, estilhacar, RAIO_DO_FRASCO } from '../servicos/arremesso.js'
import { ehInstantaneo, pontosInstantaneos } from '../servicos/efeitos.js'
import {
  blocosDaExplosao,
  podeExplodir,
  exposicaoEntre,
  danoDaExplosao,
} from '../servicos/explosao.js'
import { addItem, espacoPara, countItem, removeItem } from '../servicos/inventory.js'
import { addXp } from '../servicos/survival.js'
import { blockDef, BLOCO_DA_CERCA } from '../servicos/blocks.js'
import { virarPorta } from '../servicos/porta.js'
import { centroDoVao } from '../servicos/formas.js'
import { blockTintColor } from '../servicos/aparencia.js'
import { dayFactor, isNight } from '../servicos/daycycle.js'
import {
  BIOME_NAMES,
  biomeAt,
  createNoiseContext,
  solidTopAt,
  terrainHeight,
} from '../servicos/worldgen.js'
import { hash3, mulberry32 } from '../servicos/noise.js'
import { SEA_LEVEL, toChunkCoord } from '../servicos/constants.js'
import {
  BIOMAS_DA_ALDEIA,
  planoDoAssentamento,
  aldeoesQueFaltam,
  animaisQueFaltam,
} from '../servicos/aldeia.js'
import { MATERIAIS } from '../servicos/vilaCasa.js'
import { sortearOfertas } from '../servicos/comercio.js'
import { criarNpc } from '../servicos/npc.js'

/** Segundos entre duas tentativas de nascimento. */
export const PASSO_DO_NASCIMENTO = 2.2
/** Segundos ate um item no chao sumir. */
export const VIDA_DO_ITEM = 240
/** Distancia de coleta, em blocos. */
export const ALCANCE_DA_COLETA = 1.5
/** Carencia antes de o item poder ser coletado (senao ele volta pra mao na hora). */
export const CARENCIA_DA_COLETA = 0.4
/**
 * ⚠️ O QUE O JOGADOR LARGA DE PROPÓSITO ESPERA MAIS. Com 0,4 s e o item caindo
 * a 1,1 bloco do peito (dentro do alcance de 1,5), apertar Q parado devolvia o
 * item para a mão antes de o jogador ver o que aconteceu — medido pela sonda
 * do toque em 18/09: o inventário ia de 64 a 63 e VOLTAVA a 64 em menos de um
 * segundo. É o `carencia` que `soltarItem` aceita em `extras`; o drop de bloco
 * quebrado continua com os 0,4 s, que é o que faz cavar render na hora.
 */
export const CARENCIA_DE_QUEM_LARGA = 1.5

/**
 * @param {object} ctx
 * @param {object} ctx.mundo  `{ vivo, motor, particulas, editar }`
 * @param {object} ctx.jogador  `{ corpo, survival, inventario, modo, naMao, machucar, instante }`
 * @param {object} ctx.partida  `{ semente, simulando, guardar }`
 */
export function useRoqueCraftEntidades({ mundo, jogador, partida }) {
  let mobs = []
  let drops = []
  let flechas = []
  let dropId = 1
  let flechaId = 1
  let relogioDoNascimento = 3

  const jog = jogador.corpo
  const emSobrevivencia = () => jogador.modo() === 'survival'

  // ── Itens no chao ─────────────────────────────────────────────────────────
  /**
   * Poe um item solto no chao. UM lugar so.
   *
   * ⚠️ Tres outros trechos (morrer, quebrar mobilia, largar da mao) escreviam
   * o MESMO objeto de nove campos direto no array, apesar de esta funcao ja
   * existir com este comentario. Quem esquecesse `age` ou `phase` criava um
   * item que nunca some ou que nao balanca. Na extracao os tres passaram por
   * aqui, que era o que a funcao dizia desde o inicio.
   */
  /**
   * O JOGADOR LARGA O ITEM DA MÃO (o Q, ou segurar o slot no toque): cai um
   * pouco à frente do peito, com a carência longa — ver `CARENCIA_DE_QUEM_LARGA`.
   * Morava no componente; a regra de "onde cai e quando volta" é de entidade.
   */
  function largarAFrente(item, { origin, dir }) {
    soltarItem(item, 1, origin.x + dir.x * 1.1, origin.y - 0.3, origin.z + dir.z * 1.1, 0xcccccc, {
      carencia: CARENCIA_DE_QUEM_LARGA,
    })
  }

  function soltarItem(item, count, x, y, z, color, extras) {
    drops.push({
      id: `d${dropId++}`,
      item,
      count,
      x,
      y,
      z,
      phase: Math.random() * 6,
      color,
      age: 0,
      // `extras` existe por causa da ferramenta guardada em bau: ela tem `dur`
      // (durabilidade gasta), e largar uma picareta usada como se fosse nova
      // seria fabricar durabilidade do nada.
      ...extras,
    })
  }

  /**
   * O espólio da morte vai ao chão COM o que cada pilha carrega: `dur`, encanto
   * e poção. O componente passava só `dur` — a espada afiada morria comum.
   */
  function largarEspolio(lista) {
    for (const d of lista) {
      const extras = {}
      if (d.dur != null) extras.dur = d.dur
      if (d.enc) extras.enc = d.enc
      if (d.pocao) extras.pocao = d.pocao
      soltarItem(d.item, d.count, d.x, d.y, d.z, d.cor, extras)
    }
  }

  function spawnDropsFrom(m) {
    for (const d of mobDrops(m)) {
      soltarItem(d.item, d.count, m.x, m.y + 0.4, m.z, MOB_TYPES[m.type].color)
    }
    if (emSobrevivencia()) addXp(jogador.survival, MOB_TYPES[m.type].xp || 1)
  }

  function passoDosItens(dt) {
    const world = mundo.vivo()
    if (!world) return
    const inv = jogador.inventario
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.age += dt
      // CAI ATE O CHAO - o chao de VERDADE, nao o topo da celula.
      //
      // ⚠️ MESMA RAIZ DO REBANHO VOANDO: `solidAt` devolve o topo solido, nao um
      // sim-ou-nao. Lido como booleano, o item parava assim que a celula abaixo
      // "era solida" - sobre uma camada de neve isso e quase UM BLOCO no ar. O
      // defeito era irmao do que o founder fotografou, e estava a dez linhas de
      // distancia.
      const celula = Math.floor(d.y - 0.1)
      const topo = alturaDoApoio(
        world.solidAt(Math.floor(d.x), celula, Math.floor(d.z)),
        d.x - Math.floor(d.x),
        d.z - Math.floor(d.z),
      )
      const apoio = topo > 0 ? celula + topo : -Infinity
      if (d.y - 0.1 > apoio) d.y = Math.max(apoio + 0.1, d.y - 6 * dt)
      // coleta por proximidade
      if (
        d.age > (d.carencia ?? CARENCIA_DA_COLETA) &&
        Math.hypot(d.x - jog.x, d.y - jog.y - 0.8, d.z - jog.z) < ALCANCE_DA_COLETA
      ) {
        // COLETA PARCIAL: leva o que cabe e DEIXA o resto no chao.
        //
        // Era `addItem` e, se qualquer coisa tivesse entrado, `splice` no drop
        // inteiro - a sobra evaporava. Com a mochila cheia, passar por cima de
        // uma pilha de 32 apagava 30 blocos em silencio.
        const cabe = Math.min(d.count, espacoPara(inv.value, d.item))
        if (cabe > 0) {
          // COM O QUE O DROP CARREGA: `dur`, encanto e poção. Sem isso a
          // picareta usada voltava NOVA ao ser catada — o espólio da morte
          // guardava a durabilidade e a coleta a jogava fora.
          addItem(inv.value, d.item, cabe, d.dur ?? null, { enc: d.enc, pocao: d.pocao })
          d.count -= cabe
          inv.value = inv.value.slice()
          partida.guardar()
          if (d.count <= 0) {
            drops.splice(i, 1)
            continue
          }
        }
      }
      if (d.age > VIDA_DO_ITEM) drops.splice(i, 1)
    }
  }

  // ── Flechas ───────────────────────────────────────────────────────────────
  /**
   * O TIRO DO ESQUELETO.
   *
   * ⚠️ A FLECHA SAI DA ALTURA DO ARCO, e mira o PEITO do jogador. Saindo do pe
   * da criatura, o primeiro degrau de terreno barraria todo tiro; mirando o pe
   * do jogador, ela passaria por baixo de quem esta de pe. As duas alturas
   * moram em `mobs.js`/`flechas.js` porque sao regra, nao desenho.
   */
  function atirarFlecha(atirador) {
    const def = MOB_TYPES[atirador.type]
    const oy = atirador.y + alturaDeMira(def)
    const v = mirar(atirador.x, oy, atirador.z, jog.x, jog.y + 0.9, jog.z)
    const f = criarFlecha(`f${flechaId++}`, atirador.x, oy, atirador.z, v, atirador.id)
    if (f) flechas.push(f)
  }

  /**
   * As flechas no ar.
   *
   * ⚠️ SO MACHUCA EM SOBREVIVENCIA, mas VOA SEMPRE. Parar de simular no criativo
   * economizaria nada e esconderia o defeito: quem testa o esqueleto no criativo
   * veria o arco disparar e nenhuma flecha sair.
   */
  function passoDasFlechas(dt) {
    if (!partida.simulando()) return
    const world = mundo.vivo()
    if (!world) return
    const alvo = emSobrevivencia() ? { x: jog.x, y: jog.y + 0.9, z: jog.z } : null
    const alturaDe = (c) => MOB_TYPES[c.type]?.height ?? 1.8
    for (let i = flechas.length - 1; i >= 0; i--) {
      const f = flechas[i]
      // O FRASCO voa como flecha e QUEBRA no que encontrar: bloco, criatura ou
      // o fim da vida. Não fere ninguém ao bater; quem fere é a dose.
      if (f.forma === 'frasco') {
        const fim = passoDaFlecha(f, dt, { solidAt: world.solidAt })
        if (fim === 'voando' && !criaturaAtingida(f, mobs, RAIO_DO_FRASCO, alturaDe)) continue
        borrifar(f, alturaDe)
        flechas.splice(i, 1)
        continue
      }
      // A flecha do JOGADOR não mira o jogador: ela procura criatura.
      const doJogador = f.dono === 'jogador'
      const fim = passoDaFlecha(f, dt, { solidAt: world.solidAt, alvo: doJogador ? null : alvo })
      if (doJogador && fim === 'voando') {
        const m = criaturaAtingida(f, mobs, RAIO_DE_ACERTO, alturaDe)
        if (!m) continue
        hurtMob(m, f.dano, true)
        empurrar(m, f.vx, f.vz, FORCA_EMPURRAO * 0.5)
        flechas.splice(i, 1)
        continue
      }
      if (fim === 'voando') continue
      if (fim === 'alvo') {
        // ⚠️ APARADO NÃO EMPURRA. A guarda cortava o dano e o tranco passava
        // inteiro: o escudo parava a flecha e o jogador voava do mesmo jeito.
        const r = jogador.machucar(DANO_DA_FLECHA, 'arrow', { x: f.x - f.vx, z: f.z - f.vz })
        if (!r?.aparado) empurrar(jog, f.vx, f.vz, FORCA_EMPURRAO * 0.5)
      }
      // PENDENCIA ASSUMIDA: flecha cravada nao vira item no chao. O item `arrow`
      // precisa de um icone novo na folha `items.png`, e arte esta congelada.
      flechas.splice(i, 1)
    }
  }

  // ── O arco do jogador ─────────────────────────────────────────────────────
  //
  // Apertar arma; soltar atira com a carga do tempo segurado (`arco.js`). A
  // flecha sai do inventário e o arco se gasta AQUI, no soltar, porque é o
  // soltar que decide se o tiro saiu: um toque curto não gasta nada.
  const arco = criarArco()
  const agora = () => performance.now() / 1000
  function armarArco() {
    if (!countItem(jogador.inventario.value, 'arrow') && emSobrevivencia()) return false
    armar(arco, agora())
    return true
  }
  /** `dir` null cancela (a janela perdeu o foco no meio da carga). */
  function soltarArco(dir) {
    const carga = soltar(arco, agora())
    if (carga === null || !dir) return null
    if (emSobrevivencia()) {
      if (!countItem(jogador.inventario.value, 'arrow')) return null
      removeItem(jogador.inventario.value, 'arrow', 1)
      jogador.inventario.value = jogador.inventario.value.slice()
      jogador.gastarFerramenta?.()
    }
    const f = flechaDoJogador(`f${flechaId++}`, jog, dir, carga)
    flechas.push(f)
    return f
  }
  const arcoArmado = () => arco.armadoEm !== null

  // ── A poção arremessável ──────────────────────────────────────────────────
  /** Joga o frasco na direção da mira. Devolve o frasco (a garrafa sai pelo chamador). */
  function arremessar(item, pocao, dir) {
    if (!dir) return null
    const f = frascoDoJogador(`f${flechaId++}`, jog, dir, item, pocao)
    flechas.push(f)
    return f
  }
  /**
   * O BORRIFO. O jogador recebe a dose inteira pelo caminho de `tomarEfeito`
   * (nível e prazo já minguados pela distância). Nas criaturas só o
   * INSTANTÂNEO chega — cura sobe a vida, dano desce por `hurtMob` — porque a
   * criatura não tem mapa de efeitos com prazo. PENDÊNCIA ASSUMIDA: veneno e
   * lentidão em criatura.
   */
  function borrifar(f, alturaDe) {
    const jogadorCorpo = { x: jog.x, y: jog.y, z: jog.z, type: null }
    const alvos = estilhacar(f, [jogadorCorpo, ...mobs], (c) => (c.type ? alturaDe(c) : 1.8))
    for (const a of alvos) {
      // O instantâneo minga com a distância como o prazo: 1 ponto no mínimo.
      const instantaneo = ehInstantaneo(a.efeito)
      const pontos = instantaneo
        ? Math.max(1, Math.round(pontosInstantaneos(a.nivel) * a.alcance))
        : null
      if (a.corpo === jogadorCorpo) {
        if (emSobrevivencia()) jogador.tomarEfeito?.(a.efeito, a.nivel, a.duracao || null, pontos)
        continue
      }
      if (!instantaneo) continue
      if (a.efeito === 'dano') hurtMob(a.corpo, pontos, true)
      else if (a.efeito === 'cura') {
        a.corpo.health = Math.min(MOB_TYPES[a.corpo.type]?.health ?? 20, a.corpo.health + pontos)
      }
    }
    mundo.motor()?.ondularAgua?.(f.x, f.z, 0.2)
  }
  const cargaDoArco = () => (arco.armadoEm === null ? 0 : cargaDe(agora() - arco.armadoEm))

  // ── Explosao ──────────────────────────────────────────────────────────────
  /**
   * O ESTOURO - onde a regra pura de `explosao.js` encosta no mundo.
   *
   * Aqui nao mora decisao nenhuma: quem decide quais blocos vao e quanto dano
   * chega e o servico. Este trecho so empresta o mundo (o que e destrutivel, o
   * que e opaco) e aplica o resultado.
   *
   * ⚠️ OS BLOCOS SAEM POR `editar`, o MESMO caminho de quebrar um bloco a mao.
   * Escrever direto no mundo seria mais rapido e deixaria o buraco fora do save,
   * fora da rede e sem acordar a areia em volta - tres defeitos silenciosos de
   * uma vez.
   */
  function explodir(cx, cy, cz, potencia, alturaDoOlho) {
    const world = mundo.vivo()
    if (!world) return
    const alvos = blocosDaExplosao(
      {
        potencia,
        ehDestrutivel: (x, y, z) => podeExplodir(blockDef(world.getBlock(x, y, z))),
        rnd: Math.random,
      },
      cx,
      cy,
      cz,
    )
    // Estilhaco so nos primeiros: cada `spawnBreak` e uma malha instanciada, e
    // sessenta de uma vez engasgam o quadro no celular justamente no instante
    // em que o jogador mais precisa dele. A lista vem ordenada do centro pra
    // fora, entao estes sao os do miolo - os que o olho segue.
    const particulas = mundo.particulas()
    for (let i = 0; i < alvos.length; i++) {
      const [x, y, z] = alvos[i]
      if (i < 8) particulas?.spawnBreak(x, y, z, blockTintColor(blockDef(world.getBlock(x, y, z))))
      mundo.editar(x, y, z, 0)
    }

    // ⚠️ O ALVO E O PEITO, NAO OS PES. Medindo ate `jog.y` (a base da caixa), um
    // creeper no andar de cima faria dano cheio em quem esta embaixo do piso.
    const alvoY = jog.y + alturaDoOlho * 0.55
    const dist = Math.hypot(jog.x - cx, alvoY - cy, jog.z - cz)
    const ehOpaco = (x, y, z) => !!world.opaqueAt(x, y, z)
    const exposicao = exposicaoEntre(ehOpaco, cx, cy, cz, jog.x, alvoY, jog.z)
    const dano = danoDaExplosao(potencia, dist, exposicao)
    if (dano > 0) {
      const r = jogador.machucar(dano, 'explosion', { x: cx, z: cz })
      // O tranco e o que ensina onde o estouro foi. Sem ele, sobrar vivo a
      // quatro blocos parece bug em vez de escapada. Mas quem aparou o estouro
      // de escudo segurou o tranco junto: e o que o escudo promete.
      if (!r?.aparado) empurrar(jog, jog.x - cx, jog.z - cz, FORCA_EMPURRAO * 1.6)
    }

    // A explosao nao escolhe lado: pega o rebanho e os outros hostis junto,
    // como no original. E por isso que da pra usar creeper como arma.
    for (const outro of mobs) {
      const d = Math.hypot(outro.x - cx, outro.y - cy, outro.z - cz)
      const n = danoDaExplosao(potencia, d, 1)
      if (n > 0) {
        hurtMob(outro, n)
        empurrar(outro, outro.x - cx, outro.z - cz, FORCA_EMPURRAO * 1.4)
      }
    }

    // PENDENCIA ASSUMIDA: chiado e estouro. O banco de audio e de amostras em
    // `public/games/roquecraft/audio/`, e som novo e asset novo - precisa ser
    // CC0 e passar pelo mesmo cuidado de licenca dos outros.
    mundo.motor()?.ondularAgua?.(cx, cz, 0.35)
  }

  // ── Criaturas ─────────────────────────────────────────────────────────────
  /** O mundo como a IA das criaturas o enxerga. */
  function ambiente() {
    const world = mundo.vivo()
    const ticks = jogador.instante()
    return {
      solidAt: world.solidAt,
      // Sem isto, `pickSpawn` nao tem como distinguir "duas celulas de ar" de
      // "duas celulas de agua": as duas respondem nao-solido.
      liquidAt: world.liquidAt,
      // O arqueiro usa isto pra saber se tem linha de tiro. `ehOpaco` e nao
      // `solidAt` porque folha e vidro sao solidos e NAO tapam a vista: com
      // `solidAt` o esqueleto ficaria mudo dentro de qualquer floresta.
      ehOpaco: (x, y, z) => !!world.opaqueAt(x, y, z),
      // O que esta na mao do jogador. E por aqui que o rebanho enxerga o trigo
      // e vem atras - a regra mora em `pecuaria.js`, aqui fica so o espelho.
      // `||` e não `??` de propósito: id vazio NÃO é id. O `?? ` deixava um
      // `item: ''` passar como se fosse alguma coisa na mão, e a comparação
      // com 'wheat' lá em `pecuaria.js` falharia de um jeito silencioso. Mão
      // vazia e id vazio querem dizer a mesma coisa aqui.
      itemNaMao: jogador.naMao()?.item || null,
      // A criatura sobe degrau de terra sem pensar - e subiria a cerca do mesmo
      // jeito. E esta pergunta que faz o curral segurar o rebanho.
      ehCerca: (x, y, z) => {
        const def = blockDef(world.getBlock(x, y, z))
        if (!def) return false
        // Portao FECHADO conta como cerca; aberto nem e solido, entao a
        // criatura simplesmente atravessa - que e o que um portao aberto tem
        // que fazer.
        return !!BLOCO_DA_CERCA[def.key] || (!!def.portao && !def.portao.aberto)
      },
      // A porta, para quem sabe abrir (`def.abrePortas` em `mobs.js`). Abrir e
      // fechar saem por `mundo.editar`, o MESMO caminho do clique do jogador:
      // as duas metades viram juntas, o save registra e o multijogador ve. A
      // decisao (qual porta, quando fechar) mora em `mobs.js`; aqui e so o mundo.
      portaFechadaEm: (x, y, z) => {
        const def = blockDef(world.getBlock(x, y, z))
        return !!def?.porta && !def.porta.aberta
      },
      abrirPorta: (x, y, z) => {
        const id = world.getBlock(x, y, z)
        if (!blockDef(id)?.porta || blockDef(id).porta.aberta) return
        for (const e of virarPorta(id, x, y, z, world.getBlock)) mundo.editar(e.x, e.y, e.z, e.id)
      },
      // Onde e o VAO da porta aberta em (x,y,z), em coordenada de mundo, ou
      // null. E por aqui que o aldeao se alinha pra passar (ver `mobs.js`).
      vaoDaPorta: (x, y, z) => {
        const c = centroDoVao(world.getBlock(x, y, z))
        return c && { x: x + c.x, z: z + c.z }
      },
      // So fecha o que ainda esta aberto: se o jogador fechou antes, virar de
      // novo ABRIRIA a porta que ele acabou de fechar.
      fecharPorta: (x, y, z) => {
        const id = world.getBlock(x, y, z)
        if (!blockDef(id)?.porta?.aberta) return
        for (const e of virarPorta(id, x, y, z, world.getBlock)) mundo.editar(e.x, e.y, e.z, e.id)
      },
      // A LUZ DE VERDADE, vinda do espelho que o worker manda pra perto do
      // jogador. Era `() => 15` - uma linha que anulava as 430 de `mobs.js`:
      // `pickSpawn` lia 15, concluia "esta claro", e nada hostil nascia nunca.
      lightAt: (x, y, z) => world.luzCombinada(x, y, z, dayFactor(ticks)),
      isDay: !isNight(ticks),
      player: { x: jog.x, y: jog.y, z: jog.z },
      skyExposed: (x, y, z) => world.skyExposed(x, y, z),
      surfaceY: (x, z) => world.surfaceY(x, z),
      biomeAt: (x, z) => BIOME_NAMES[world.biomeAt(x, z)] || null,
      allowHostile: emSobrevivencia(),
      // O hostil mais perto de (x, z) dentro de `raio`, ou null. E o que faz o
      // aldeao FUGIR do zumbi (`rotina.js`). Varre a lista inteira por
      // aldeao por quadro: sao poucos aldeoes e no maximo MAX_MOBS criaturas.
      ameacaPerto: (x, z, raio) => {
        let melhor = null
        let dm = raio
        for (const m of mobs) {
          if (!MOB_TYPES[m.type]?.hostile) continue
          const d = Math.hypot(m.x - x, m.z - z)
          if (d < dm) {
            dm = d
            melhor = { x: m.x, z: m.z }
          }
        }
        return melhor
      },
    }
  }

  function passoDasCriaturas(dt, alturaDoOlho) {
    // no multijogador so o ANFITRIAO roda a IA; o convidado renderiza o espelho
    if (!partida.simulando()) return
    const world = mundo.vivo()
    if (!world) return
    const env = ambiente()
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i]
      const evs = stepMob(m, env, dt)
      if (evs.includes('explode')) {
        // ⚠️ SAI DA LISTA ANTES DE ESTOURAR. Se ele continuasse dentro, a
        // propria explosao o acharia no laco de dano e chamaria `hurtMob` num
        // bicho ja morto - e o `spawnDropsFrom` la embaixo entregaria a polvora
        // de quem estourou, que e justamente o que o original nao da.
        mobs.splice(i, 1)
        const def = MOB_TYPES[m.type]
        explodir(m.x, m.y + def.height * 0.5, m.z, def.explode.potencia, alturaDoOlho)
        continue
      }
      if (evs.includes('shoot')) atirarFlecha(m)
      if (evs.includes('attack') && emSobrevivencia()) {
        const r = jogador.machucar(MOB_TYPES[m.type].damage || 2, 'mob', { x: m.x, z: m.z })
        // Levar pancada EMPURRA. Sem isto o zumbi encosta e fica parado dentro
        // de voce, e a briga vira uma barra encolhendo no canto da tela. Com a
        // guarda CHEIA (escudo) o tranco não vem: segurar o escudo é segurar o
        // chão. Com a mão vazia a guarda só corta metade, e o tranco fica.
        if (!r?.aparado) empurrar(jog, jog.x - m.x, jog.z - m.z)
      }
      if (m.health <= 0 || evs.includes('died') || shouldDespawn(m, jog)) {
        if (m.health <= 0) spawnDropsFrom(m)
        if (m.health <= 0 && MOB_TYPES[m.type]?.voa) partida.dragaoCaiu?.()
        mobs.splice(i, 1)
      }
    }

    // ── O DRAGÃO ────────────────────────────────────────────────────────────
    //
    // No Fim, e enquanto o save disser que ele não caiu, ele existe: UM. A
    // lista é zerada a cada troca de dimensão, então é aqui, no passo, que ele
    // volta a nascer ao chegar — sobre a fonte, no anel de voo.
    if (world.dimensao === 'end' && partida.dragaoDeveExistir?.()) {
      if (!mobs.some((m) => MOB_TYPES[m.type]?.voa)) {
        const d = createMob('dragao', 0, 85, 0, partida.semente())
        if (d) mobs.push(d)
      }
    }

    // ⚠️ A PROCRIACAO RODA UMA VEZ POR QUADRO, NAO POR CRIATURA. Dentro do laco
    // acima, um curral com oito vacas apaixonadas geraria oito filhotes no
    // MESMO quadro - e o teto de criaturas estouraria antes de o jogador ver o
    // primeiro. Um casal por quadro e bem mais que suficiente: o gargalo real
    // e o trigo.
    if (mobs.length < MAX_MOBS) {
      const casal = acharCasal(mobs)
      if (casal) {
        const berco = procriar(casal[0], casal[1])
        const filhote = createMob(
          berco.type,
          berco.x,
          berco.y,
          berco.z,
          partida.semente() + mobs.length,
        )
        if (filhote) {
          filhote.bebe = TEMPO_DE_BEBE
          mobs.push(filhote)
          if (emSobrevivencia()) addXp(jogador.survival, 1)
          partida.guardar()
        }
      }
    }

    relogioDoNascimento -= dt
    if (relogioDoNascimento > 0) return
    relogioDoNascimento = PASSO_DO_NASCIMENTO

    // ── OS MORADORES DA ALDEIA ──────────────────────────────────────────────
    //
    // ⚠️ ANTES do teto de `MAX_MOBS` e FORA do `emSobrevivencia()`. Aldeão não
    // é bicho de campo: ele vem da ESTRUTURA, e uma aldeia que amanhece vazia
    // porque o curral do jogador ocupou as trinta vagas é uma cidade fantasma
    // que ninguém entende. No criativo ele também existe — é onde se testa.
    povoarAldeiaPerto()

    if (mobs.length >= MAX_MOBS || !emSobrevivencia()) return

    const cand = pickSpawn(env)
    // ⚠️ TETO DE HOSTIS SEPARADO DO TETO TOTAL. Com um so, um curral de vinte
    // vacas ocupava as vagas todas e a noite parava de nascer bicho: o jogador
    // "resolveria" o perigo criando gado - um exploit que ninguem planejou e
    // que ninguem entenderia como defeito.
    const hostisVivos = mobs.reduce((n, m) => n + (MOB_TYPES[m.type].hostile ? 1 : 0), 0)
    const ehHostil = cand && MOB_TYPES[cand.type]?.hostile
    if (cand && !(ehHostil && hostisVivos >= MAX_HOSTIS)) {
      const m = createMob(cand.type, cand.x, cand.y, cand.z, partida.semente() + mobs.length)
      if (m) mobs.push(m)
    }

    // ── VIDA MARINHA ────────────────────────────────────────────────────────
    //
    // Sorteio SEPARADO, e nao uma entrada a mais na piscina do `pickSpawn`.
    //
    // A regra de terra recusa celula com liquido (foi assim que zumbi saiu do
    // fundo do mar); a de agua exige exatamente isso. Enfiar peixe na mesma
    // funcao significaria um booleano cortando o corpo dela ao meio, e a
    // proxima regra de terra escrita ali valeria pro peixe por omissao.
    //
    // Devolve um GRUPO - cardume - e nao um bicho: um peixe sozinho num oceano
    // e um detalhe que ninguem encontra.
    if (mobs.length < MAX_MOBS - 6) {
      const cardume = pickSpawnAquatico(env)
      for (const c of cardume || []) {
        if (mobs.length >= MAX_MOBS) break
        const m = createMob(c.type, c.x, c.y, c.z, partida.semente() + mobs.length)
        if (m) mobs.push(m)
      }
    }
  }

  /**
   * Põe em pé os aldeões que faltam na aldeia mais próxima.
   *
   * O plano da aldeia é o MESMO que o gerador usou (`aldeia.js`, tudo função
   * pura da coordenada e da semente), então os moradores nascem dentro das
   * casas que já estão no mundo — e não em cima delas.
   */
  /**
   * O RUÍDO DO MUNDO, memorizado por semente — a mesma fonte do gerador.
   *
   * ⚠️ ISTO CONSERTA UM DEFEITO QUE DEIXAVA TODA VILA VAZIA, e ele é do tipo
   * que só uma sonda dentro do jogo acha. `povoarAldeiaPerto` perguntava a
   * altura do chão ao MUNDO VIVO (`w.surfaceY`). Só que quando o jogador chega
   * à vila ela JÁ ESTÁ CONSTRUÍDA: `surfaceY` devolve o telhado da casa, não o
   * terreno. O plano então via um relevo cheio de degraus de cinco blocos,
   * recusava o sítio, e `aldeoesQueFaltam` recebia `null`.
   *
   * Medido em 15/09/2026, na vila de semente 1337 em (152, −104): o gerador diz
   * que ali o chão é 66, e o mundo vivo respondia 66, 71, 66, 70, 66, 66, 66 —
   * os 71 são as casas. A vila existia, desenhada, com balcão e cama, e nunca
   * teve um morador; o defeito estava lá desde que a aldeia nasceu e nenhum
   * teste podia vê-lo, porque todo teste de unidade entrega um mundo plano.
   *
   * `solidTopAt` e `biomeAt` são funções puras da coordenada e da semente — as
   * MESMAS que o `worldgen` usa para decidir onde a vila fica. Perguntar a elas
   * concorda com o mundo por construção, e não muda de resposta depois que a
   * vila é levantada.
   */
  let ruidoDoMundo = null
  let ruidoDaSemente = null
  const ruido = () => {
    if (ruidoDoMundo === null || ruidoDaSemente !== partida.semente()) {
      ruidoDoMundo = createNoiseContext(partida.semente())
      ruidoDaSemente = partida.semente()
    }
    return ruidoDoMundo
  }

  function povoarAldeiaPerto() {
    const w = mundo.vivo()
    if (!w) return
    const jog = jogador.corpo
    const cx = toChunkCoord(Math.floor(jog.x))
    const cz = toChunkCoord(Math.floor(jog.z))
    const hash = (a, b, c) => hash3(a, b, c, partida.semente())
    const n = ruido()
    const biomaDo = (x, z) => biomeAt(n, x, z, terrainHeight(n, x, z))
    // ⚠️ `planoDoAssentamento`, NÃO `planoDaAldeia`: com o segundo (porte
    // 'vila' por padrão) só a vila ganhava moradores. A cidade nascia com 26
    // casas, igreja e feira — e vazia; a aldeia idem. Achado ao fotografar a
    // cidade pela primeira vez (Goal 21, 2.4).
    const plano = planoDoAssentamento(
      hash,
      {
        alturaEm: (x, z) => solidTopAt(n, x, z),
        nivelDoMar: SEA_LEVEL,
        biomaEm: biomaDo,
        biomaAceito: (b) => BIOMAS_DA_ALDEIA.includes(BIOME_NAMES[b]),
        materialDaVila: (c) =>
          BIOME_NAMES[biomaDo(c.x, c.z)] === 'savanna' ? MATERIAIS.pinho : MATERIAIS.carvalho,
      },
      cx,
      cz,
    )
    const faltam = aldeoesQueFaltam(plano, jog, (x, z, r) =>
      mobs.reduce(
        (n, m) => n + (m.type === 'aldeao' && Math.abs(m.x - x) <= r && Math.abs(m.z - z) <= r),
        0,
      ),
    )
    for (const a of faltam) {
      const m = createMob('aldeao', a.x, a.y, a.z, partida.semente() + mobs.length)
      if (!m) continue
      m.profissao = a.profissao
      m.ofertas = sortearOfertas(a.profissao, mulberry32(Math.round(a.x * 31 + a.z)))
      // ⚠️ O NOME SAI DO HASH DA POSIÇÃO, e não do contador de mobs. O mesmo
      // aldeão, na mesma casa, precisa ser a mesma pessoa em toda partida com
      // aquela semente — senão "o ferreiro Benedito" é uma coisa diferente a
      // cada boot e não há caminho de volta para ninguém.
      m.npc = criarNpc(hash, { x: a.x, z: a.z, profissao: a.profissao })
      m.origemX = Math.round(a.x)
      m.origemZ = Math.round(a.z)
      // Morador nunca some: a aldeia não pode evaporar quando o jogador vira as
      // costas, e é o mesmo campo que protege o rebanho criado à mão.
      m.domestica = true
      mobs.push(m)
    }

    // ── O REBANHO DO CURRAL ─────────────────────────────────────────────────
    //
    // ⚠️ PELA MESMA PORTA DOS ALDEÕES, e não pelo spawn de bioma. Vaca de bioma
    // aparece onde o campo permite e SOME quando o jogador se afasta: o curral
    // amanheceria vazio, com a cerca, o portão e o cocho de pé em volta de nada
    // — que é pior que não ter curral. Estes vêm da ESTRUTURA, ficam onde ela
    // está, e são `domestica` como o morador.
    const bichos = animaisQueFaltam(plano, jog, (x, z, r) =>
      mobs.reduce(
        (n, m) =>
          n +
          ((m.type === 'cow' || m.type === 'pig') &&
            Math.abs(m.x - x) <= r &&
            Math.abs(m.z - z) <= r),
        0,
      ),
    )
    for (const a of bichos) {
      const m = createMob(a.tipo, a.x, a.y, a.z, partida.semente() + mobs.length)
      if (!m) continue
      m.domestica = true
      mobs.push(m)
    }
  }

  // ── Ciclo de vida das listas ──────────────────────────────────────────────
  /** Mundo novo, morte da partida, entrar e sair do multijogador. */
  function limpar() {
    mobs = []
    drops = []
    flechas = []
  }

  function restaurarDoSave(saved) {
    // Flecha no ar e estado EFEMERO, nao estado de jogo: ninguem sente falta de
    // uma flecha a meio caminho depois de recarregar, e restaura-la so daria um
    // tiro vindo do nada no primeiro quadro.
    flechas = []
    // O REBANHO volta. A regra mora em `restaurarMobs`; aqui so se diz COMO
    // nascer uma criatura neste mundo (semente por indice, pra elas nao andarem
    // em fila militar com o mesmo gerador aleatorio).
    mobs = restaurarMobs(saved?.mobs, (t, x, y, z, i) =>
      createMob(t, x, y, z, partida.semente() + i),
    )
    // ⚠️ E O ALDEÃO VOLTA A SER ALGUÉM. Sem esta linha ele vinha do save com
    // profissão crua e `ofertas: null`: `aldeoesQueFaltam` já o contava como
    // presente, ninguém nascia no lugar, e a vila inteira ficava muda depois de
    // um recarregamento. Só a semente reconstrói nome e sorteio, e ela está
    // aqui, não no desserializador.
    reidratarAldeoes(
      mobs,
      (a, b, c) => hash3(a, b, c, partida.semente()),
      (semente) => mulberry32(semente),
    )
    // ⚠️ ITEM NO CHAO VOLTA COM A IDADE QUE TINHA, e por isso NAO passa por
    // `soltarItem` (que nasce com idade zero). Sem restaurar `age`, recarregar
    // daria vida nova a tudo que estava quase sumindo, e o chao de uma base
    // antiga viraria deposito permanente.
    drops = []
    for (const d of saved?.drops || []) {
      drops.push({
        id: `d${dropId++}`,
        item: d.item,
        count: d.count,
        x: d.x,
        y: d.y,
        z: d.z,
        phase: Math.random() * 6,
        color: d.color,
        age: d.age,
      })
    }
  }

  return {
    // as listas, sempre por GETTER: elas sao reatribuidas em mundo novo
    mobs: () => mobs,
    drops: () => drops,
    flechas: () => flechas,
    definirMobs: (l) => {
      mobs = l
    },
    /** Tira uma criatura da lista (golpe do jogador, golpe que veio da rede). */
    remover: (m) => {
      mobs = mobs.filter((x) => x !== m)
    },
    /** Tira todos os hostis (o que amanhecer faz). */
    removerHostis: () => {
      mobs = mobs.filter((m) => !MOB_TYPES[m.type].hostile)
    },
    mirado: (origem, dir, alcance) => mobNoRaio(mobs, origem, dir, alcance),
    ambiente,
    soltarItem,
    largarAFrente,
    spawnDropsFrom,
    atirarFlecha,
    explodir,
    passoDasCriaturas,
    passoDosItens,
    passoDasFlechas,
    armarArco,
    soltarArco,
    arremessar,
    largarEspolio,
    arcoArmado,
    cargaDoArco,
    limpar,
    restaurarDoSave,
  }
}
