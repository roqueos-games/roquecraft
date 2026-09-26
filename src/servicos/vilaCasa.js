//
// A CASA DA VILA — o que ela é por dentro e por fora.
//
// ⚠️ ANTES ELA ERA UMA CAIXA, e o founder disse isso olhando a tela: sete por
// sete, paredes retas, TELHADO PLANO de tábua, três janelas e um vão de porta.
// Cinco delas em anel. A suíte passava verde porque media se a caixa tinha a
// forma que o código dizia que a caixa tinha.
//
// O que uma casa precisa ter para ler como casa, e não como depósito:
//
//   · TELHADO INCLINADO. É a silhueta. Telhado plano lido de longe é laje, e
//     laje é galpão. As escadas já existem no catálogo em quatro orientações e
//     duas metades — nenhuma arte nova, que está congelada.
//   · BEIRAL. Telhado que termina exatamente na parede parece corte de faca. Um
//     bloco de avanço é o que dá sombra na parede e profundidade na silhueta.
//   · VIGA DE CANTO. Quatro troncos nas quinas quebram o plano de tábua e dão
//     escala: sem eles, uma parede de 7 e uma de 9 parecem a mesma parede.
//   · BATENTE. A porta era um buraco. Dois troncos ladeando dizem "entrada".
//   · CAMA. É o que separa casa de barraco — e ela também é o que faz o aldeão
//     ter onde morar em vez de ficar em pé no meio do cômodo.
//   · PLANTAS DIFERENTES. Cinco casas idênticas em anel leem como cenário de
//     tabuleiro. Quatro plantas e o hash escolhendo é o mínimo para a vila
//     parecer construída por pessoas.
//
// ⚠️ TUDO AQUI É FUNÇÃO PURA DA COORDENADA. Mesma regra da aldeia e da
// cachoeira: `runFeatures` roda para os NOVE chunks vizinhos e cada um precisa
// chegar à MESMA resposta. Nada de `rnd()`, nada de ler o buffer.

import { ID, VARIANTE_DE_ESCADA, BITS_DA_CERCA, VARIANTE_DE_CERCA } from './blocks.js'
import { idDaPorta } from './porta.js'

/** A porta da casa: fechada, folha na face de −Z (a de fora), duas metades. */
const ID_DA_PORTA = {
  baixo: idDaPorta('oakDoor', 5, false, false),
  cima: idDaPorta('oakDoor', 5, false, true),
}

/** Ar EXPLÍCITO: "aqui é vazio", diferente de `null` ("deixe o terreno"). */
export const AR = 0

/**
 * As plantas. `lx`/`lz` são METADES: a pegada é `2*l+1`.
 *
 * ⚠️ `lx` NÃO PASSA DE 4 e `lz` não passa de 3, e isso é medido, não gosto: com
 * o beiral a casa mais larga ocupa 11 colunas, e `casasDe` garante 15 blocos
 * entre vizinhas (2·d·sen 36° com d mínimo de 13). Uma planta de `lx: 5` faria
 * duas casas se atravessarem na quinta aldeia da varredura, que foi exatamente
 * o defeito que os ângulos exatos consertaram na rodada passada.
 *
 * `eixo` é a direção da CUMEEIRA. Com 'x' a cumeeira corre no X e o telhado
 * desce no Z; as empenas (os triângulos) ficam nas paredes de |dx| máximo.
 */
export const PLANTAS = Object.freeze([
  { nome: 'pequena', lx: 2, lz: 3, pe: 4, eixo: 'x' },
  { nome: 'larga', lx: 3, lz: 3, pe: 4, eixo: 'x' },
  { nome: 'funda', lx: 3, lz: 2, pe: 5, eixo: 'z' },
  { nome: 'mestra', lx: 4, lz: 3, pe: 4, eixo: 'x', chamine: true },
])

/** O maior avanço de uma casa a partir do centro dela, beiral incluso. */
export const BORDA_DA_CASA = Math.max(...PLANTAS.map((p) => Math.max(p.lx, p.lz))) + 1

/**
 * Os materiais, por bioma.
 *
 * ⚠️ MESMA MADEIRA NOS DOIS BIOMAS SERIA DESPERDÍCIO DE CATÁLOGO: o pinho e a
 * pedra-tijolo já existem, já têm escada e já têm textura. Savana com casa de
 * carvalho e planície com casa de carvalho leem como o mesmo lugar duas vezes.
 */
export const MATERIAIS = Object.freeze({
  carvalho: {
    parede: 'oakPlanks',
    viga: 'oakLog',
    escada: 'oakStairs',
    base: 'cobblestone',
    piso: 'oakPlanks',
  },
  pinho: {
    parede: 'sprucePlanks',
    viga: 'spruceLog',
    escada: 'spruceStairs',
    base: 'stoneBricks',
    piso: 'sprucePlanks',
  },
})

/** A planta desta casa, escolhida pelo hash da coordenada dela. */
export const plantaDe = (hash, casa) =>
  PLANTAS[Math.floor(hash(casa.x, casa.z, 77) * PLANTAS.length) % PLANTAS.length]

/**
 * A escada certa para a água do telhado.
 *
 * ⚠️ A ORIENTAÇÃO SAI DA GEOMETRIA, e ela está escrita em `formas.js`: a forma
 * base (`ESCADA_NZ`, orientação 5) tem o degrau ALTO no lado +Z. Então a água
 * que desce para −Z quer a orientação 5, e a que desce para +Z quer a 4, que é
 * a mesma forma com meia volta. Inverter isso faz o telhado nascer em degrau
 * invertido — bonito de longe, buraco de perto.
 */
const escadaDoTelhado = (material, descePara) =>
  ID[VARIANTE_DE_ESCADA[`${material.escada}|${descePara < 0 ? 5 : 4}|b`]]

/** A cerca com a conexão certa para um poste solto da varanda. */
export const cercaSolta = () =>
  ID[VARIANTE_DE_CERCA[`oakFence|${BITS_DA_CERCA.nz | BITS_DA_CERCA.pz}`]]

/**
 * O bloco desta célula da casa, `AR` para vazio dela, ou `null` para "não é
 * comigo".
 *
 * @param casa  `{ x, z, profissao, planta, material }`
 * @param chao  o nível do chão da aldeia
 */
export function blocoDaCasa(casa, chao, x, y, z) {
  const p = casa.planta ?? PLANTAS[1]
  const m = casa.material ?? MATERIAIS.carvalho
  const dx = x - casa.x
  const dz = z - casa.z
  const adx = Math.abs(dx)
  const adz = Math.abs(dz)
  // Além do beiral não é assunto da casa.
  if (adx > p.lx + 1 || adz > p.lz + 1) return null

  const piso = chao
  const topoDaParede = chao + p.pe // a última fiada de parede

  // ── O telhado ────────────────────────────────────────────────────────────
  //
  // A água desce no eixo TRANSVERSAL à cumeeira. Com `eixo: 'x'` a cumeeira
  // corre no X, então quem manda na altura é `dz`.
  const transversal = p.eixo === 'x' ? dz : dx
  const meioTransversal = p.eixo === 'x' ? p.lz : p.lx
  const aoLongo = p.eixo === 'x' ? dx : dz
  const meioAoLongo = p.eixo === 'x' ? p.lx : p.lz
  const at = Math.abs(transversal)
  // Beiral: uma fiada além da parede, nos dois sentidos.
  const noTelhado = at <= meioTransversal + 1 && Math.abs(aoLongo) <= meioAoLongo + 1
  const alturaDoTelhado = topoDaParede + 1 + (meioTransversal + 1 - at)

  if (noTelhado && y === alturaDoTelhado) {
    // A cumeeira é bloco cheio: duas escadas encostadas de topo deixariam um
    // sulco no meio da casa, e chuva entra por sulco.
    if (at === 0) return ID[m.parede]
    return escadaDoTelhado(m, transversal)
  }
  if (y > alturaDoTelhado) return null
  if (y > topoDaParede) {
    // Debaixo do telhado: empena fechada nas pontas, sótão vazio no miolo.
    //
    // ⚠️ SEM A EMPENA A CASA É UM ALPENDRE. O triângulo entre o topo da parede e
    // a água do telhado fica ABERTO nas duas pontas, e de lado dá pra ver a sala
    // inteira por baixo do beiral. Foi o primeiro defeito que a foto pegou.
    if (Math.abs(aoLongo) > meioAoLongo || at > meioTransversal) return null
    if (Math.abs(aoLongo) === meioAoLongo) return ID[m.parede]
    return AR
  }

  // ── Fora da pegada da parede (só o beiral chega aqui) ────────────────────
  if (adx > p.lx || adz > p.lz) return null

  // ── O piso e a fundação ──────────────────────────────────────────────────
  if (y === piso) return ID[m.base]
  if (y < piso) return null

  const naParede = adx === p.lx || adz === p.lz

  // ── O miolo: o que mobilia a casa ────────────────────────────────────────
  if (!naParede) {
    const mob = mobiliaDaCasa(p, dx, dz, y - piso, casa.profissao)
    return mob ?? AR
  }

  // ── A parede ─────────────────────────────────────────────────────────────
  //
  // A porta fica na parede de −Z, no meio, com duas células de altura. Casa sem
  // entrada é caixa: o jogador quebra a parede para entrar e a estrutura deixa
  // de ser um lugar para virar obstáculo.
  // ⚠️ E AGORA A PORTA É UMA PORTA (Goal 21). Até 18/09 o vão era AR: o
  // aldeão não tinha casa fechada, e o zumbi entrava pela frente. A folha fica
  // na face de −Z da célula (orient 5 = a forma-base de `formas.js`), que é a
  // face de fora da parede: fechada, ela cobre o vão; aberta, gira para dentro.
  const naPortaX = dz === -p.lz && dx === 0
  if (naPortaX && y === piso + 1) return ID_DA_PORTA.baixo
  if (naPortaX && y === piso + 2) return ID_DA_PORTA.cima
  // O batente: dois troncos ladeando o vão, e a verga por cima.
  if (dz === -p.lz && adx === 1 && y <= piso + 3) return ID[m.viga]
  if (naPortaX && y === piso + 3) return ID[m.viga]

  // As vigas de canto sobem a parede inteira.
  if (adx === p.lx && adz === p.lz) return ID[m.viga]

  // ⚠️ DUAS JANELAS POR PAREDE, E NENHUMA NA DA PORTA. A versão anterior tinha
  // UMA por parede, no meio, e a nota dela dizia que quatro seria "gaiola". Com
  // a casa maior e a viga de canto quebrando o plano, o problema virou o
  // contrário: uma janela só, centrada, numa parede de nove, lê como respiradouro
  // de porão. As ímpares (±1, ±3) dão ritmo e nunca caem na quina.
  const aoLongoDaParede = adx === p.lx ? dz : dx
  const ehParedeDaPorta = dz === -p.lz
  if (!ehParedeDaPorta && y === piso + 2 && Math.abs(aoLongoDaParede) % 2 === 1) {
    return ID.glass
  }

  // A chaminé da casa mestra: uma coluna de pedregulho colada na parede de +X,
  // que passa do telhado. É o que dá altura e assimetria à silhueta da vila.
  if (p.chamine && dx === p.lx && dz === 1 && y >= piso + 1) return ID.cobblestone

  return ID[m.parede]
}

/**
 * ⚠️ A CHAMINÉ PASSA DO TELHADO, e por isso ela não cabe na função da parede
 * sozinha: acima do topo da parede, aquela coluna já caiu no ramo do telhado.
 * Esta função responde pelo trecho que sobe além dele.
 */
export function blocoDaChamine(casa, chao, x, y, z) {
  const p = casa.planta ?? PLANTAS[1]
  if (!p.chamine) return null
  if (x - casa.x !== p.lx || z - casa.z !== 1) return null
  const topo = chao + p.pe + 1 + (p.lz + 1) + 1
  if (y <= chao + p.pe || y > topo) return null
  return ID.cobblestone
}

/**
 * A mobília, em coordenada RELATIVA ao centro da casa e ao chão.
 *
 * ⚠️ A CAMA SÃO DUAS CÉLULAS E DUAS IDS, e as duas metades apontam para lados
 * OPOSTOS — é isso que põe os quatro pés nas quatro quinas do móvel. A
 * cabeceira vai encostada na parede de +Z (o fundo do cômodo), então a ponta de
 * fora DELA aponta para +Z e a do pé para −Z. Trocar isso dá uma cama com dois
 * pés no meio, que foi como ela nasceu na rodada 8.
 *
 * ⚠️ E ELA NÃO PODE ENCOSTAR NA PORTA. A porta é em −Z; a cama no fundo, em +Z.
 * Um móvel no vão de entrada tranca o aldeão dentro de casa.
 */
export function mobiliaDaCasa(p, dx, dz, dy, profissao) {
  if (dy !== 1) return null
  const fundo = p.lz - 1
  const canto = -(p.lx - 1)
  if (dx === canto && dz === fundo) return ID.bedHeadPz
  if (dx === canto && dz === fundo - 1) return ID.bed
  // ⚠️ O BLOCO DE OFÍCIO É O QUE LIGA A CASA AO COMÉRCIO. O ferreiro vendia
  // ferro numa casa sem fornalha e o bibliotecário vendia livro numa casa sem
  // estante: a troca funcionava e mesmo assim mentia, porque o lugar não
  // sustentava o que oferecia. Ele fica na parede oposta à cama, longe da
  // porta, e é o mesmo bloco que a oferta daquela profissão cita.
  if (dx === p.lx - 1 && dz === fundo) return BLOCO_DE_OFICIO[profissao] ?? ID.craftingTable
  // A bancada é de todo mundo: é a peça que diz "aqui se faz alguma coisa".
  if (dx === p.lx - 1 && dz === fundo - 1) return ID.craftingTable
  return null
}

/**
 * ⚠️ O BLOCO SAI DA OFERTA, não do gosto. Cada um destes aparece nas ofertas da
 * profissão correspondente em `comercio.js`: estante do bibliotecário, alambique
 * do clérigo, fornalha do ferreiro. O fazendeiro não tem bloco próprio no
 * catálogo, e o baú é o mais honesto — ele guarda o que a leira produz.
 */
export const BLOCO_DE_OFICIO = Object.freeze({
  ferreiro: ID.furnace,
  bibliotecario: ID.bookshelf,
  clerigo: ID.brewingStand,
  fazendeiro: ID.chest,
})
