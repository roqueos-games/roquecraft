// RoqueCraft - mesher GREEDY com oclusão de ambiente e luz suave.
//
// Convenção: o bloco (x,y,z) ocupa o cubo [x,x+1] × [y,y+1] × [z,z+1]. (A
// versão antiga usava voxel CENTRADO no inteiro; a de canto é a padrão do
// gênero e simplifica greedy meshing, raycast e AABB.)
//
// O que este mesher faz de diferente do anterior:
//
//  1. GREEDY - faces coplanares adjacentes com o MESMO descritor (bloco, luz,
//     AO, tint) viram UM retângulo. Um chão plano de 16×16 sai como 1 quad em
//     vez de 256. É o que permite distância de renderização grande.
//  2. LUZ SUAVE - cada vértice recebe a média da luz das 4 células à frente,
//     separando skylight de luz de bloco. O shader multiplica o skylight pela
//     hora do dia: o mesmo mundo fica dourado ao entardecer e azul à noite sem
//     remalhar nada.
//  3. AO por vértice - o clássico "3 vizinhos do canto", com escolha da
//     diagonal do quad pelo AO (mata o artefato de AO anisotrópico).
//  4. TEXTURE ARRAY - cada vértice carrega a CAMADA da textura, então o mundo
//     inteiro é UM material e UM draw call por seção, sem sangramento de atlas.
//  5. TINT por bioma - a cor de grama/folha entra como atributo de vértice,
//     interpolando entre biomas vizinhos sem costura.
//
// Puro: recebe acessores, devolve typed arrays transferíveis. Roda em worker.

import { CHUNK_SIZE, SECTION_HEIGHT, AIR } from './constants.js'
import {
  BLOCKS,
  FACE_LAYERS,
  IS_OPAQUE,
  IS_PLANT,
  IS_LIQUID,
  IS_AGUADO,
  IS_CUTOUT,
  IS_TRANSLUCENT,
  VENTO_DE_BLOCO,
  FORMA_BASE,
  FORMA_TOPO,
  FACE_NA_BORDA,
  EH_PARCIAL,
  ALTURA_LIQUIDA,
} from './blocks.js'
import { FACES_DE_BLOCO, EH_FORMA_LIVRE, PULA_GREEDY } from './formas.js'

// Recuo de 1/64 de bloco nas pontas da cruz de planta.
//
// Não é estético — é o que ANCORA a fase do vento no bloco. O shader deriva o
// centro do bloco de `floor(worldPos.xz)`, e uma planta em escala cheia tem
// ponta exatamente em x+1, cujo `floor` cai no bloco VIZINHO: metade da moita
// balançava com a fase de um bloco e a outra metade com a de outro, e a cruz
// se rasgava em vez de se dobrar. Com o recuo, os quatro cantos caem na mesma
// célula e a moita inteira vira um corpo só.
//
// 1/64 é o mesmo quantum do `at_midBlock` do Iris. Escolhido pra ser grande o
// bastante em float32 na borda do mundo (lá o ulp é ~1e-3) e pequeno o
// bastante pra ninguém ver: a cruz fica 3% mais estreita.
const RECUO_CRUZ = 1 / 64

// Por face: eixo, sinal, e se a ordem dos índices precisa inverter pra o
// winding sair CCW visto de fora. u/v são os dois eixos restantes em ordem
// crescente (x<y<z).
// f: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
// ⚠️ INVARIANTE DAS FACES LATERAIS: nas quatro faces verticais (±X e ±Z), o
// eixo `v` da textura TEM que ser o Y do mundo. É isso que faz o topo da
// imagem cair no topo do bloco.
//
// As faces ±X estavam com `u: 1, v: 2` - ou seja, o eixo HORIZONTAL da textura
// mapeado no Y do mundo e o vertical no Z. A textura saía girada 90°, e só
// nessas duas faces. O sintoma que o founder relatou (2026-08-22) foi a franja
// de grama descendo pela LATERAL do bloco de terra em vez de correr pelo topo:
// a franja mora nas primeiras linhas da imagem, e girada 90° ela vira uma
// tira vertical na borda. As faces ±Z sempre estiveram certas, e é por isso que
// o defeito aparecia "só de um lado" e passou despercebido por meses.
//
// Trocar u↔v inverte a lateralidade do par (u,v), então `flip` inverte junto -
// senão o winding sai CW, a face é descartada pelo backface culling e o mundo
// ganha buracos a leste e a oeste.
const FACES = [
  { axis: 0, sign: 1, u: 2, v: 1, flip: true, n: [1, 0, 0] },
  { axis: 0, sign: -1, u: 2, v: 1, flip: false, n: [-1, 0, 0] },
  { axis: 1, sign: 1, u: 0, v: 2, flip: true, n: [0, 1, 0] },
  { axis: 1, sign: -1, u: 0, v: 2, flip: false, n: [0, -1, 0] },
  { axis: 2, sign: 1, u: 0, v: 1, flip: false, n: [0, 0, 1] },
  { axis: 2, sign: -1, u: 0, v: 1, flip: true, n: [0, 0, -1] },
]

// AO 0..3 → fator de brilho. Não vai a preto: o canto mais fechado ainda recebe
// luz indireta, senão o chão fica sujo.
const AO_LEVEL = [0.45, 0.66, 0.84, 1.0]

function aoValue(s1, s2, c) {
  if (s1 && s2) return 0
  return 3 - (s1 + s2 + c)
}

// Buffers dinâmicos - crescem em dobro e viram typed array no fim.
function makeBucket() {
  return {
    pos: [],
    nor: [],
    uv: [],
    layer: [],
    light: [], // ao, sky, block  (0..255)
    tint: [], // r,g,b (0..255)
    wind: [],
    idx: [],
    n: 0,
  }
}

function finishBucket(b) {
  if (!b.n) return null
  return {
    position: new Float32Array(b.pos),
    normal: new Int8Array(b.nor),
    uv: new Float32Array(b.uv),
    layer: new Uint16Array(b.layer),
    light: new Uint8Array(b.light),
    tint: new Uint8Array(b.tint),
    wind: new Uint8Array(b.wind),
    index: b.n > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx),
    count: b.n,
  }
}

// Uma face é VISÍVEL quando o vizinho não a esconde. Regras:
//  - vizinho opaco esconde qualquer face
//  - dois blocos do MESMO tipo transparente (água-água, folha-folha, vidro-
//    vidro) não desenham a face interna: evita z-fighting e superfície suja
//  - água encostada em sólido não desenha a face (fica escondida mesmo)
/**
 * A célula é ÁGUA para efeito de vizinhança — a água de verdade, ou uma célula
 * alagada (alga, capim-do-mar).
 *
 * Um id por célula é a razão de isto existir: pôr uma planta dentro d'água
 * substitui a água naquele voxel. Toda pergunta do tipo "meu vizinho é água?"
 * precisa passar por aqui, senão a planta abre um buraco seco no meio do mar —
 * parede desenhada em volta dela, degrau na superfície acima dela, e a coluna
 * de profundidade cortada ao meio.
 */
const ehMolhado = (id) => IS_LIQUID[id] === 1 || IS_AGUADO[id] === 1

function faceVisible(id, nid, f = -1) {
  if (nid === AIR) return true
  // ⚠️ FACE QUE NÃO ENCOSTA NO PLANO DA CÉLULA NUNCA É ESCONDIDA.
  //
  // O tampo de uma laje de baixo fica no MEIO da célula: o vizinho de cima está
  // a meio bloco de distância e não tem como cobri-lo. Sem esta linha, encostar
  // pedra em cima de uma laje apagava o tampo e abria um vão que dava pra ver o
  // subsolo. Vale pro piso da laje de topo pelo mesmo motivo, invertido.
  if (f >= 0 && FACE_NA_BORDA[id * 6 + f] === 0) return true
  if (IS_OPAQUE[nid] === 1) return false
  // Mesmo id ainda pode não se esconder. Duas lajes LADO A LADO encostam pela
  // lateral, e as duas metades coincidem: esconde. Duas lajes EMPILHADAS
  // encostam pelo plano y+1, e a de baixo termina meio bloco antes dele: não
  // esconde, senão a coluna vira uma parede lisa onde existem dois degraus.
  //
  // Quem separa os dois casos é se a face oposta do vizinho também está na
  // BORDA. Duas superfícies na borda do mesmo plano coincidem por construção —
  // é o mesmo bloco, com a mesma forma.
  if (nid === id) return f >= 0 ? FACE_NA_BORDA[nid * 6 + (f ^ 1)] === 0 : false
  // ⚠️ CÉLULA ALAGADA CONTA COMO LÍQUIDO AQUI. A alga ocupa um id que não é
  // água, e sem esta linha cada pé de alga faria a água em volta desenhar
  // parede — o mar ficaria com uma caixa de vidro em torno de cada planta.
  if (IS_LIQUID[id] === 1 && IS_OPAQUE[nid] === 0 && ehMolhado(nid)) return false
  // ⚠️ O LÍQUIDO NÃO DESENHA PAREDE CONTRA UM BLOCO CHEIO E TRANSLÚCIDO.
  //
  // Gelo e vidro cobrem o plano inteiro daquela face. A parede de água ali não
  // acrescenta um pixel, e ela e a face do vizinho caem no MESMO bucket
  // transparente, que tem `depthWrite: false` — sem escrita de profundidade,
  // quem aparece é quem foi desenhado por último, e a ordem dentro da seção é a
  // de emissão do mesher, não a distância. O resultado muda de quadro para
  // quadro com a câmera PARADA.
  //
  // Foi isso que o founder viu duas vezes. Em 22/08: "blocos de gelo sem a
  // parte das laterais e inferior". Em 15/09, com dois prints do mesmo quadro,
  // mesma posição no HUD, gelo diferente nos dois: "as faces falhando". As duas
  // vezes o diagnóstico natural é face FALTANDO, e as duas vezes a auditoria de
  // malha varreu o mundo sem achar uma ausente — porque o que sobra é geometria
  // A MAIS. `mesherGelo.spec.js` mede os pares que brigam pelo mesmo plano.
  //
  // CUTOUT E PLANTA FICAM DE FORA de propósito: folha e vidraça recortada têm
  // buraco, então não cobrem o plano, e esconder a água atrás delas abriria um
  // vão de verdade. A condição da borda cobre o vizinho PARCIAL (uma laje de
  // vidro não tampa a face inteira).
  if (
    IS_LIQUID[id] === 1 &&
    IS_TRANSLUCENT[nid] === 1 &&
    (f < 0 || FACE_NA_BORDA[nid * 6 + (f ^ 1)] === 1)
  ) {
    return false
  }
  if (IS_LIQUID[nid] === 1 && IS_TRANSLUCENT[id] === 0 && IS_CUTOUT[id] === 0) return true
  return true
}

const bucketOf = (id) => {
  if (IS_LIQUID[id] === 1 || IS_TRANSLUCENT[id] === 1) return 'transparent'
  if (IS_CUTOUT[id] === 1 || IS_PLANT[id] === 1) return 'cutout'
  return 'opaque'
}

/**
 * Malha UMA seção de 16³.
 *
 * `acc` precisa expor (coordenadas GLOBAIS):
 *   block(x,y,z) → id            (0 = ar; fora do carregado, devolva ar)
 *   light(x,y,z) → byte sky<<4|block
 *   tint(x,z, kind) → [r,g,b] 0..1   (kind: 'grass' | 'foliage')
 *
 * Devolve `{ opaque, cutout, transparent }` (cada um pode ser null).
 */
// Região local com 1 de padding: 18 × 18 × 18. Copiar a vizinhança da SEÇÃO
// pra este bloco contíguo UMA vez custa ~5.8k leituras; sem isso, o AO e o
// culling fariam ~500k chamadas de acessor por seção (medido: 66 ms → 6 ms).
// Teto da medição de profundidade da água. Além disto a absorção já saturou
// (exp2(-0.45*16) ~ 6e-3 no vermelho) e o byte do atributo tem que caber.
export const PROF_MAX = 16

const SW = SECTION_HEIGHT + 2 // 18 em y
const SS = CHUNK_SIZE + 2 // 18 em x/z
const si = (lx, ly, lz) => ((lx + 1) * SS + (lz + 1)) * SW + (ly + 1)

/**
 * Profundidade da lâmina na coluna (lx,lz), MEMOIZADA por seção.
 *
 * ⚠️ A memoização não é otimização prematura: a versão sem ela custou 25% do
 * orçamento de malha do chunk (50 ms contra um teto de 40) e o teste de
 * regressão de performance pegou na hora.
 *
 * O motivo é que `drop` é verdadeiro para as SEIS faces de um bloco de água de
 * superfície, não só pra tampa — então a mesma coluna era contada seis vezes,
 * uma por direção de face. Profundidade é propriedade da COLUNA: uma vez basta.
 *
 * `acc.block` é o acessor global; contar pelo buffer local da seção não
 * serviria, porque ele só tem 1 bloco de padding e um lago fundo atravessa a
 * seção inteira.
 */
function profundidadeDaColuna(acc, cache, ox, oy, oz, lx, ly, lz) {
  const ci = lx * CHUNK_SIZE + lz
  const memo = cache[ci]
  if (memo >= 0) return memo
  let d = 0
  // Alagado conta: uma coluna de alga no meio da lâmina cortaria a
  // profundidade ao meio, e a água acima dela clarearia de repente.
  while (d < PROF_MAX && ehMolhado(acc.block(ox + lx, oy + ly - d, oz + lz))) d++
  cache[ci] = d
  return d
}

export function meshSection(acc, cx, sy, cz) {
  const ox = cx * CHUNK_SIZE
  const oy = sy * SECTION_HEIGHT
  const oz = cz * CHUNK_SIZE

  // ── Cópia local da vizinhança da seção ───────────────────────────────────
  const B = new Uint8Array(SS * SS * SW)
  const L = new Uint8Array(SS * SS * SW)
  let solidCount = 0
  for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
      for (let ly = -1; ly <= SECTION_HEIGHT; ly++) {
        const p = si(lx, ly, lz)
        const id = acc.block(ox + lx, oy + ly, oz + lz)
        B[p] = id
        L[p] = acc.light(ox + lx, oy + ly, oz + lz)
        if (
          id !== AIR &&
          lx >= 0 &&
          lx < CHUNK_SIZE &&
          lz >= 0 &&
          lz < CHUNK_SIZE &&
          ly >= 0 &&
          ly < SECTION_HEIGHT
        )
          solidCount++
      }
    }
  }

  const buckets = { opaque: makeBucket(), cutout: makeBucket(), transparent: makeBucket() }
  // seção 100% vazia: nada a malhar (a maioria das seções altas e das fundas)
  if (!solidCount) return { opaque: null, cutout: null, transparent: null }

  // Luz média das 4 células que tocam um vértice, ignorando as opacas.
  // Escreve em `scratch` pra não alocar um array por canto.
  const scratch = new Int32Array(2)
  function vertexLight(fx, fy, fz, dux, duy, duz, dvx, dvy, dvz) {
    let sky = 0
    let blk = 0
    let n = 0
    let p = si(fx, fy, fz)
    let fallback = L[p]
    if (IS_OPAQUE[B[p]] !== 1) {
      sky += (L[p] >> 4) & 15
      blk += L[p] & 15
      n++
    }
    p = si(fx + dux, fy + duy, fz + duz)
    if (IS_OPAQUE[B[p]] !== 1) {
      sky += (L[p] >> 4) & 15
      blk += L[p] & 15
      n++
    }
    p = si(fx + dvx, fy + dvy, fz + dvz)
    if (IS_OPAQUE[B[p]] !== 1) {
      sky += (L[p] >> 4) & 15
      blk += L[p] & 15
      n++
    }
    p = si(fx + dux + dvx, fy + duy + dvy, fz + duz + dvz)
    if (IS_OPAQUE[B[p]] !== 1) {
      sky += (L[p] >> 4) & 15
      blk += L[p] & 15
      n++
    }
    if (!n) {
      scratch[0] = (fallback >> 4) & 15
      scratch[1] = fallback & 15
      return
    }
    scratch[0] = Math.round(sky / n)
    scratch[1] = Math.round(blk / n)
  }

  // ── Passe 1: faces de cubo, greedy por fatia ──────────────────────────────
  const W = CHUNK_SIZE
  const H = SECTION_HEIGHT
  const maskId = new Int32Array(W * W)
  // Duas chaves de 31 bits em vez de uma soma de floats: comparar chave
  // "aproximada" funde faces que NÃO deveriam fundir (o bug clássico do greedy
  // com AO, que aparece como faixa de luz errada). Aqui a comparação é exata.
  const maskKeyA = new Uint32Array(W * W)
  const maskKeyB = new Uint32Array(W * W)
  const maskAO = new Uint8Array(W * W * 4) // índice 0..3
  const maskSky = new Uint8Array(W * W * 4) // nibble 0..15
  const maskBlk = new Uint8Array(W * W * 4) // nibble 0..15
  const maskTint = new Uint8Array(W * W * 3)
  const maskLayer = new Int32Array(W * W)
  const maskTopY = new Int32Array(W * W)
  const maskDrop = new Uint8Array(W * W)
  // ── A RAMPA DO LÍQUIDO ──────────────────────────────────────────────────────
  //
  // "os vertices do quadrado deveriam ficar na diagonal, da forma que ficou,
  // ficou espacos entre os diferentes niveis de agua" -- founder, 25/08/2026,
  // com print da praia.
  //
  // Ele está certo e o diagnóstico é exato. Cada nível de água desenhava um quad
  // PLANO na altura do próprio nível, então entre um nível e o seguinte sobrava
  // um degrau aberto -- e como a lateral do degrau não é emitida (o vizinho é
  // água, e água não esconde água), o que se vê é o vão.
  //
  // A correção é a que todo jogo do gênero usa: a superfície do líquido NÃO é
  // plana. Cada um dos quatro cantos do quad recebe a média das alturas das
  // QUATRO células que se encontram naquele canto. Duas células de níveis
  // diferentes passam a compartilhar exatamente a mesma altura no canto comum,
  // e o degrau vira rampa contínua -- sem vão, por construção, não por ajuste.
  //
  // Quatro floats por célula: a altura de cada canto, na ordem (0,0) (1,0)
  // (1,1) (0,1).
  const maskCanto = new Float32Array(W * W * 4)
  // Profundidade da lâmina d'água em blocos, medida da superfície pro fundo.
  // Ver `PROF_MAX` e o uso em `emitQuad`.
  const maskProf = new Uint8Array(W * W)
  // Memória da profundidade POR COLUNA da seção (-1 = ainda não medida). Ver
  // `profundidadeDaColuna`: sem ela a mesma coluna era contada seis vezes.
  const profCol = new Int8Array(W * W).fill(-1)
  // Célula que NÃO pode fundir com a vizinha. Ver a nota em `solto[mi] = ...`.
  const solto = new Uint8Array(W * W)
  const used = new Uint8Array(W * W)

  for (let f = 0; f < 6; f++) {
    const F = FACES[f]
    const dims = [W, H, W]
    const axisLen = dims[F.axis]
    const uLen = dims[F.u]
    const vLen = dims[F.v]
    const dux = F.u === 0 ? 1 : 0
    const duy = F.u === 1 ? 1 : 0
    const duz = F.u === 2 ? 1 : 0
    const dvx = F.v === 0 ? 1 : 0
    const dvy = F.v === 1 ? 1 : 0
    const dvz = F.v === 2 ? 1 : 0
    const nX = F.n[0]
    const nY = F.n[1]
    const nZ = F.n[2]

    for (let s = 0; s < axisLen; s++) {
      maskId.fill(0)
      used.fill(0)
      solto.fill(0)
      let any = false

      for (let a = 0; a < uLen; a++) {
        for (let b = 0; b < vLen; b++) {
          // coordenadas locais da célula
          const lx = F.axis === 0 ? s : F.u === 0 ? a : b
          const ly = F.axis === 1 ? s : F.u === 1 ? a : b
          const lz = F.axis === 2 ? s : F.u === 2 ? a : b

          const id = B[si(lx, ly, lz)]
          // Planta e forma livre (escada) têm passe próprio: o greedy só sabe
          // fabricar UM retângulo por célula e por face, e nenhuma das duas
          // cabe nisso.
          if (id === AIR || PULA_GREEDY[id] === 1) continue
          const fx = lx + nX
          const fy = ly + nY
          const fz = lz + nZ
          const nid = B[si(fx, fy, fz)]
          if (!faceVisible(id, nid, f)) continue

          const mi = a * vLen + b
          maskId[mi] = id
          maskLayer[mi] = FACE_LAYERS[id * 6 + f]
          maskTopY[mi] = ly + 1
          any = true

          // Superfície de líquido: a água do TOPO tem o nível rebaixado (dá a
          // borda visível na praia). Entra na chave pra nunca fundir com a
          // água de baixo, que é cheia.
          // ⚠️ `ehMolhado` no vizinho de cima: com alga logo acima da lâmina, o
          // teste cru diria que ali termina a água e rebaixaria a superfície —
          // um degrau no mar exatamente em volta de cada planta.
          const drop = IS_LIQUID[id] === 1 && !ehMolhado(B[si(lx, ly + 1, lz)]) ? 1 : 0
          maskDrop[mi] = drop

          // Altura de canto: só para a face de TOPO de uma superfície de
          // líquido. Nas outras faces o valor é ignorado, e escrever mesmo
          // assim custaria mais que a guarda.
          if (drop && f === 2) {
            // Altura de UMA célula, vista do topo: 1 se há líquido em cima
            // (coluna cheia ou caindo), a altura do nível se é a superfície,
            // e -1 se não há líquido nenhum ali (não entra na média).
            const alturaDe = (cx, cz) => {
              const cid = B[si(cx, ly, cz)]
              if (!ehMolhado(cid)) return -1
              if (ehMolhado(B[si(cx, ly + 1, cz)])) return 1
              return ALTURA_LIQUIDA[cid]
            }
            for (let canto = 0; canto < 4; canto++) {
              const du = canto === 1 || canto === 2 ? 1 : 0
              const dv = canto === 2 || canto === 3 ? 1 : 0
              let soma = 0
              let n = 0
              let cheio = false
              for (let ix = -1; ix <= 0; ix++) {
                for (let iz = -1; iz <= 0; iz++) {
                  const h = alturaDe(lx + du + ix, lz + dv + iz)
                  if (h < 0) continue
                  // Um vizinho de coluna cheia PUXA o canto pro topo: é o que
                  // faz a lâmina encostar na fonte sem degrau.
                  if (h >= 1) cheio = true
                  soma += h
                  n++
                }
              }
              maskCanto[mi * 4 + canto] = cheio ? 1 : n ? soma / n : ALTURA_LIQUIDA[id]
            }
          }

          // PROFUNDIDADE DA LÂMINA, medida aqui e carregada até o shader.
          //
          // É o dado que faz a água parecer água em vez de um vidro azul
          // uniforme: a absorção de Beer-Lambert precisa saber quanta água a
          // luz atravessou, e a espuma de margem é literalmente "onde a lâmina
          // é rasa". Num motor comum isso sai de um depth buffer e de um
          // segundo passe de render; num mundo de blocos a resposta é EXATA e
          // custa uma contagem — e ainda funciona na margem, que é justamente
          // onde a versão em espaço de tela erra.
          //
          // Só a superfície mede (`drop`), e é onde a conta é barata: `acc` é o
          // acessor global lento, mas a face de topo da água é uma fração
          // ínfima das faces da seção. Contar pelo buffer local não serviria —
          // ele só tem 1 de padding e um lago fundo passa da seção.
          // ⚠️ Atribuição INCONDICIONAL. `maskProf` não é zerado entre fatias
          // (só `maskId`, `used` e `solto` são), então escrever apenas quando
          // há água deixa o valor da fatia anterior valendo para uma face de
          // PEDRA — e como o mesmo byte vira `aWind` no shader, a pedra
          // começava a balançar como se fosse mato. Passou despercebido no
          // print porque a onda de vento é sutil; apareceu na conta.
          maskProf[mi] = drop ? profundidadeDaColuna(acc, profCol, ox, oy, oz, lx, ly, lz) : 0

          // ⚠️ A SUPERFÍCIE DA ÁGUA NÃO FUNDE. É o conserto da fresta que o
          // founder viu (2026-08-22), e o motivo é geométrico, não estético:
          //
          // o vértice da água sobe pela onda no shader, e a onda é função de
          // (x,z). Se um retângulo fundido de 8×8 encosta num de 1×1, o de 8×8
          // só tem vértice nos CANTOS - a borda dele é uma reta, enquanto o
          // vizinho pequeno tem um vértice no meio que sobe. As duas bordas
          // deixam de coincidir e abre um rasgo. É a junção em T clássica de
          // deslocamento de vértice, e não tem conserto no shader: ou os dois
          // lados têm vértice no mesmo lugar, ou não têm.
          //
          // Com todo quad da superfície em 1×1 os vértices são compartilhados
          // por construção - inclusive na fronteira entre chunks, porque a onda
          // é amostrada em coordenada de MUNDO. De quebra a onda passa a ser
          // amostrada por bloco em vez de interpolada ao longo de 8 metros.
          //
          // Só a superfície: a água submersa (drop = 0) quase nunca aparece e
          // continua fundindo normalmente.
          //
          // FOLHAGEM TAMBÉM NÃO FUNDE, e pelo mesmo motivo geométrico. Ela
          // passou a se deslocar no shader, e deslocamento em quad fundido é a
          // junção em T clássica: um retângulo de 4×2 folhas só tem vértice nos
          // cantos, então a borda dele é uma reta enquanto a copa vizinha, se
          // fundida diferente, tem vértice no meio dessa reta - e o vértice do
          // meio anda enquanto a reta não. Abre um rasgo em plena copa.
          //
          // Não dá pra resolver no shader: ou os dois lados têm vértice no
          // mesmo lugar, ou não têm. Com folha em 1×1 os vértices são
          // compartilhados por construção, e o deslocamento é função PURA da
          // posição de mundo — dois quads que encostam concordam sempre.
          //
          // O preço é vértice, e ele é pequeno porque folha já quase não funde:
          // a luz do céu muda de célula pra célula dentro de uma copa, e a
          // chave do greedy inclui a luz. Medido em `qa-roquecraft-vento`.
          //
          // A LATERAL DE BLOCO PARCIAL também não funde, e por um motivo
          // terceiro: nas quatro faces verticais o eixo `v` do quad é o Y do
          // mundo, e fundir duas lajes EMPILHADAS produziria um retângulo de
          // altura 2 onde existem duas metades separadas por um vão. As faces
          // de cima e de baixo continuam fundindo à vontade — ali o retângulo
          // cresce em X e Z, onde a laje é cheia, e um piso de laje 16×16
          // continua saindo em dois quads.
          solto[mi] =
            drop || VENTO_DE_BLOCO[id] > 0 || (EH_PARCIAL[id] === 1 && f !== 2 && f !== 3) ? 1 : 0

          let keyA = (id << 24) >>> 0
          let keyB = 0
          for (let corner = 0; corner < 4; corner++) {
            const su = corner === 0 || corner === 3 ? -1 : 1
            const sv = corner === 0 || corner === 1 ? -1 : 1
            const s1 = IS_OPAQUE[B[si(fx + dux * su, fy + duy * su, fz + duz * su)]]
            const s2 = IS_OPAQUE[B[si(fx + dvx * sv, fy + dvy * sv, fz + dvz * sv)]]
            const cc =
              IS_OPAQUE[
                B[si(fx + dux * su + dvx * sv, fy + duy * su + dvy * sv, fz + duz * su + dvz * sv)]
              ]
            const aoIdx = aoValue(s1, s2, cc)
            maskAO[mi * 4 + corner] = aoIdx
            vertexLight(fx, fy, fz, dux * su, duy * su, duz * su, dvx * sv, dvy * sv, dvz * sv)
            maskSky[mi * 4 + corner] = scratch[0]
            maskBlk[mi * 4 + corner] = scratch[1]
            keyA |= (aoIdx & 3) << (22 - corner * 2)
            keyA |= (scratch[0] & 15) << (12 - corner * 4)
            keyB |= (scratch[1] & 15) << (28 - corner * 4)
          }

          const def = BLOCKS[id]
          let tr = 255
          let tg = 255
          let tb = 255
          if (def.tint && (!def.tintFaces || def.tintFaces.includes(f))) {
            const c = acc.tint(ox + lx, oz + lz, def.tint)
            tr = (c[0] * 255) | 0
            tg = (c[1] * 255) | 0
            tb = (c[2] * 255) | 0
          }
          maskTint[mi * 3] = tr
          maskTint[mi * 3 + 1] = tg
          maskTint[mi * 3 + 2] = tb
          // tint quantizado em 5 bits por canal - variação menor que 1/32 é
          // invisível e fundir é mais valioso que a precisão que se perde
          keyB |= (tr >> 3) << 11
          keyB |= (tg >> 3) << 6
          keyB |= (tb >> 3) << 1
          keyB |= drop
          maskKeyA[mi] = keyA >>> 0
          maskKeyB[mi] = keyB >>> 0
        }
      }
      if (!any) continue

      // greedy merge no plano (a,b)
      for (let a = 0; a < uLen; a++) {
        for (let b = 0; b < vLen; ) {
          const mi = a * vLen + b
          if (!maskId[mi] || used[mi]) {
            b++
            continue
          }
          let h = 1
          while (
            !solto[mi] &&
            b + h < vLen &&
            maskId[mi + h] === maskId[mi] &&
            !used[mi + h] &&
            !solto[mi + h] &&
            maskKeyA[mi + h] === maskKeyA[mi] &&
            maskKeyB[mi + h] === maskKeyB[mi]
          )
            h++
          let w = 1
          outer: while (!solto[mi] && a + w < uLen) {
            for (let k = 0; k < h; k++) {
              const j = (a + w) * vLen + (b + k)
              if (
                maskId[j] !== maskId[mi] ||
                used[j] ||
                solto[j] ||
                maskKeyA[j] !== maskKeyA[mi] ||
                maskKeyB[j] !== maskKeyB[mi]
              )
                break outer
            }
            w++
          }
          for (let i = 0; i < w; i++) for (let k = 0; k < h; k++) used[(a + i) * vLen + (b + k)] = 1

          emitQuad(buckets, F, f, s, a, b, w, h, mi, {
            maskId,
            maskLayer,
            maskAO,
            maskSky,
            maskBlk,
            maskTint,
            maskTopY,
            maskDrop,
            maskCanto,
            maskProf,
            ox,
            oy,
            oz,
          })
          b += h
        }
      }
    }
  }

  // ── Passe 2: o que não cabe no greedy ────────────────────────────────────
  //
  // Planta (cruz) e escada (dez retângulos) numa VARREDURA SÓ. Separá-las em
  // dois passes custou 12% do tempo de malha medido em `bench-mesher.mjs`, e o
  // custo era inteiro de varrer 4096 células duas vezes pra não achar nada —
  // a esmagadora maioria das seções não tem nem planta nem escada.
  //
  // Não passa pelo greedy, e não é falta de vontade: o greedy fabrica UM
  // retângulo por célula e por face, e a escada tem dez retângulos de tamanhos
  // diferentes. Fundir escada com escada também não faria sentido — cada uma
  // tem os mesmos dez, e o que se fundiria seria o quad grande com um pedaço
  // do pequeno.
  //
  // A LUZ, porém, vem do MESMO lugar que a dos cubos vizinhos: os quatro cantos
  // da face da CÉLULA, interpolados na posição do canto do retângulo. É isso
  // que faz uma escada de pedra encostada numa parede de pedra ter a mesma
  // sombra de canto que a parede — sombreá-la chapada, como planta, deixaria a
  // escada "flutuando" visualmente no meio da alvenaria.
  const c4 = [0, 0, 0, 0]
  const cs = [0, 0, 0, 0]
  const cb = [0, 0, 0, 0]
  const bilerp = (v, u, w) =>
    v[0] * (1 - u) * (1 - w) + v[1] * u * (1 - w) + v[2] * u * w + v[3] * (1 - u) * w
  for (let lx = 0; lx < W; lx++) {
    for (let lz = 0; lz < W; lz++) {
      for (let ly = 0; ly < H; ly++) {
        const id = B[si(lx, ly, lz)]
        if (id === AIR) continue
        if (IS_PLANT[id] === 1) {
          emitCross(buckets.cutout, acc, L[si(lx, ly, lz)], ox + lx, oy + ly, oz + lz, id)
          continue
        }
        if (EH_FORMA_LIVRE[id] !== 1) continue
        const partes = FACES_DE_BLOCO[id]
        const bucket = buckets[bucketOf(id)]
        const def = BLOCKS[id]
        for (const parte of partes) {
          const f = parte.f
          const F = FACES[f]
          const [nX, nY, nZ] = F.n
          const fx = lx + nX
          const fy = ly + nY
          const fz = lz + nZ
          if (parte.naBorda && !faceVisible(id, B[si(fx, fy, fz)], f)) continue

          // Os quatro cantos da face da CÉLULA, na mesma ordem que a máscara
          // usa: (0,0) (1,0) (1,1) (0,1) no plano (F.u, F.v).
          const dux = F.u === 0 ? 1 : 0
          const duy = F.u === 1 ? 1 : 0
          const duz = F.u === 2 ? 1 : 0
          const dvx = F.v === 0 ? 1 : 0
          const dvy = F.v === 1 ? 1 : 0
          const dvz = F.v === 2 ? 1 : 0
          for (let k = 0; k < 4; k++) {
            const su = k === 0 || k === 3 ? -1 : 1
            const sv = k === 0 || k === 1 ? -1 : 1
            const s1 = IS_OPAQUE[B[si(fx + dux * su, fy + duy * su, fz + duz * su)]]
            const s2 = IS_OPAQUE[B[si(fx + dvx * sv, fy + dvy * sv, fz + dvz * sv)]]
            const cc =
              IS_OPAQUE[
                B[si(fx + dux * su + dvx * sv, fy + duy * su + dvy * sv, fz + duz * su + dvz * sv)]
              ]
            c4[k] = AO_LEVEL[aoValue(s1, s2, cc)]
            vertexLight(fx, fy, fz, dux * su, duy * su, duz * su, dvx * sv, dvy * sv, dvz * sv)
            cs[k] = scratch[0]
            cb[k] = scratch[1]
          }

          let tr = 255
          let tg = 255
          let tb = 255
          if (def.tint && (!def.tintFaces || def.tintFaces.includes(f))) {
            const c = acc.tint(ox + lx, oz + lz, def.tint)
            tr = (c[0] * 255) | 0
            tg = (c[1] * 255) | 0
            tb = (c[2] * 255) | 0
          }

          const inicio = bucket.n
          for (let ci = 0; ci < parte.cantos.length; ci++) {
            const canto = parte.cantos[ci]
            bucket.pos.push(ox + lx + canto[0], oy + ly + canto[1], oz + lz + canto[2])
            bucket.nor.push(nX * 127, nY * 127, nZ * 127)
            // ⚠️ uv EXPLÍCITO tem prioridade. Derivar da posição funciona pra
            // quase tudo, e não funciona pro tampo de um móvel que gira: lá u e
            // v são os dois horizontais, então a mesma função de (x,z) devolve
            // a mesma textura nas quatro orientações e ela fica presa ao mundo
            // enquanto a peça gira por baixo. Ver `face()` em formas.js.
            const u = parte.uv ? parte.uv[ci][0] : canto[F.u]
            const v = parte.uv ? parte.uv[ci][1] : canto[F.v]
            bucket.uv.push(u, v)
            bucket.layer.push(FACE_LAYERS[id * 6 + f])
            bucket.light.push(
              Math.round(bilerp(c4, u, v) * 255),
              Math.round(bilerp(cs, u, v)) * 17,
              Math.round(bilerp(cb, u, v)) * 17,
            )
            bucket.tint.push(tr, tg, tb)
            // ⚠️ `aWind` REAPROVEITADO UMA TERCEIRA VEZ, agora como SEMENTE de
            // partícula. Os outros dois usos são balanço de planta e
            // profundidade de lâmina (ver a nota no `emitQuad`); os três nunca
            // se cruzam porque o shader separa por camada de textura antes de
            // ler o atributo. Um quarto byte por vértice em TODAS as malhas do
            // mundo custaria caro pra servir cinco quads por tocha.
            bucket.wind.push(Math.round((parte.semente || 0) * 255))
          }
          bucket.idx.push(inicio, inicio + 1, inicio + 2, inicio, inicio + 2, inicio + 3)
          bucket.n += 4
        }
      }
    }
  }

  return {
    opaque: finishBucket(buckets.opaque),
    cutout: finishBucket(buckets.cutout),
    transparent: finishBucket(buckets.transparent),
  }
}

// Emite o retângulo fundido como 2 triângulos.
function emitQuad(buckets, F, f, s, a, b, w, h, mi, m) {
  const id = m.maskId[mi]
  const bucket = buckets[bucketOf(id)]

  // canto base do retângulo em coordenadas LOCAIS da seção
  const base = [0, 0, 0]
  base[F.axis] = s + (F.sign > 0 ? 1 : 0)
  base[F.u] = a
  base[F.v] = b

  // A superfície da água fica um pouco abaixo do bloco cheio (a borda visível
  // na praia). A FORMA do bloco — onde ele começa e acaba dentro da célula —
  // vem das tabelas: bloco cheio é [0,1], neve é [0, 0.125], laje de baixo é
  // [0, 0.5] e laje de topo é [0.5, 1].
  // ⚠️ A altura vem do ID, não de uma constante. Enquanto só existia água cheia,
  // um `WATER_DROP` único bastava; com nível (rodada 10), cada lâmina tem a sua
  // altura e a constante desenharia os sete níveis idênticos. Para a fonte o
  // valor é 1 − WATER_DROP: exatamente o que este motor já desenhava.
  const drop = m.maskDrop[mi] ? 1 - ALTURA_LIQUIDA[id] : 0
  // y (local na seção) do TOPO e do CHÃO da célula deste quad
  const topY = m.maskTopY[mi]
  const pisoY = topY - 1
  const yTopo = pisoY + FORMA_TOPO[id] - drop
  const yBase = pisoY + FORMA_BASE[id]

  // A rampa do líquido: cada canto tem a sua altura. Ver o bloco de
  // `maskCanto` lá em cima -- é isto que fecha o vão entre níveis vizinhos.
  //
  // ⚠️ Só vale para a face de TOPO (f === 2) de uma superfície de líquido. O
  // quad de superfície NUNCA é fundido (`solto[mi] = drop || ...`), então ele é
  // sempre 1x1 e os quatro cantos do retângulo são os quatro cantos da célula.
  // Se um dia a fusão passar a aceitar `drop`, este mapeamento quebra em
  // silêncio -- e é por isso que ele está escrito aqui.
  const rampa = f === 2 && m.maskDrop[mi] && m.maskCanto
  const alturaDoCanto = (du, dv) => {
    const canto = du === 0 ? (dv === 0 ? 0 : 3) : dv === 0 ? 1 : 2
    return m.maskCanto[mi * 4 + canto]
  }

  const corner = (du, dv) => {
    const q = [base[0], base[1], base[2]]
    q[F.u] += du
    q[F.v] += dv
    // Puxa o vértice pra forma do bloco. Bloco cheio: os dois casos devolvem
    // exatamente onde o vértice já estava, e nada muda.
    //
    // ⚠️ Só a célula ÂNCORA é ajustada. Num quad fundido ao longo do eixo Y os
    // vértices intermediários não existem, então fundir laje na vertical
    // produziria uma parede lisa de altura 2. É por isso que a lateral de bloco
    // parcial entra como `solto` na máscara: aqui já é tarde pra descobrir.
    if (q[1] === topY) {
      q[1] = rampa ? pisoY + alturaDoCanto(du, dv) : yTopo
    } else if (q[1] === pisoY) q[1] = yBase
    return [m.ox + q[0], m.oy + q[1], m.oz + q[2]]
  }

  const verts = [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)]

  // Fatia da textura no eixo v. Só as quatro faces VERTICAIS de um bloco
  // parcial recortam: nas faces de cima e de baixo o eixo v é X ou Z, onde a
  // laje é cheia, e recortar ali mostraria meia textura num tampo inteiro.
  // ⚠️ `h` no bloco CHEIO, não 1: numa parede fundida de 3 blocos de altura o v
  // vai de 0 a 3 e a textura se repete três vezes. Trocar por 1 esticaria a
  // imagem por toda a parede — e como bloco parcial nunca funde na lateral, lá
  // `h` é sempre 1 e o recorte é exato.
  const recorta = F.axis !== 1 && EH_PARCIAL[id] === 1
  const vBaixo = recorta ? FORMA_BASE[id] : 0
  const vAlto = recorta ? FORMA_TOPO[id] : h

  const start = bucket.n
  for (let i = 0; i < 4; i++) {
    bucket.pos.push(verts[i][0], verts[i][1], verts[i][2])
    bucket.nor.push(F.n[0] * 127, F.n[1] * 127, F.n[2] * 127)
    // uv = quantos TILES o quad cobre; o material usa RepeatWrapping, então a
    // textura se repete sem esticar por maior que seja o retângulo fundido.
    //
    // Na LATERAL de um bloco parcial o quad tem meia altura, e mandar v de 0 a
    // 1 espremeria a imagem inteira nela: a laje sairia com a textura do bloco
    // cheio em escala 2:1, que é o defeito clássico de laje mal feita. O
    // recorte certo é mostrar a FATIA que a laje ocupa — de `base` a `topo` —,
    // e aí a pedra da laje casa com a pedra do bloco ao lado.
    bucket.uv.push(i === 1 || i === 2 ? w : 0, i === 2 || i === 3 ? vAlto : vBaixo)
    bucket.layer.push(m.maskLayer[mi])
    bucket.light.push(
      Math.round(AO_LEVEL[m.maskAO[mi * 4 + i]] * 255),
      m.maskSky[mi * 4 + i] * 17,
      m.maskBlk[mi * 4 + i] * 17,
    )
    bucket.tint.push(m.maskTint[mi * 3], m.maskTint[mi * 3 + 1], m.maskTint[mi * 3 + 2])
    // ⚠️ `aWind` é REAPROVEITADO como profundidade da lâmina nas faces de
    // água. Não é economia à toa: o atributo é um byte por vértice em TODAS as
    // malhas do mundo, e um segundo byte só pra água custaria o dobro em cada
    // pedra do subsolo. Os dois usos nunca se cruzam — planta e água vivem em
    // buckets diferentes — e o shader separa pela camada de textura antes de
    // interpretar. Escala: 0..PROF_MAX blocos mapeados em 0..255.
    //
    // Fora da água o byte volta ao significado original: quanto esta face cede
    // ao vento. Antes era zero fixo aqui, e por isso a copa das árvores era a
    // única vegetação do mundo que ficava congelada — só a grama, que sai pelo
    // `emitCross`, se mexia. O `? :` é a fronteira entre os dois significados.
    bucket.wind.push(
      m.maskProf[mi] ? Math.round((m.maskProf[mi] / PROF_MAX) * 255) : VENTO_DE_BLOCO[id],
    )
  }

  // Diagonal escolhida pelo AO: sem isso, um canto escuro "vaza" pelo triângulo
  // errado e aparece a costura diagonal clássica do voxel mal feito.
  const a00 = m.maskAO[mi * 4]
  const a10 = m.maskAO[mi * 4 + 1]
  const a11 = m.maskAO[mi * 4 + 2]
  const a01 = m.maskAO[mi * 4 + 3]
  const flipDiag = a00 + a11 < a10 + a01

  const tri = flipDiag ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3]
  if (F.flip) {
    for (let i = 0; i < 6; i += 3)
      bucket.idx.push(start + tri[i], start + tri[i + 2], start + tri[i + 1])
  } else {
    for (let i = 0; i < 6; i += 3)
      bucket.idx.push(start + tri[i], start + tri[i + 1], start + tri[i + 2])
  }
  bucket.n += 4
}

// Planta = 2 quads cruzados em X, dupla face, com atributo de VENTO (o shader
// balança o topo). Escala menor pra tocha/muda.
function emitCross(bucket, acc, l, x, y, z, id) {
  const def = BLOCKS[id]
  const layer = FACE_LAYERS[id * 6 + 2]
  const sky = ((l >> 4) & 15) * 17
  const blk = (l & 15) * 17
  let tr = 255
  let tg = 255
  let tb = 255
  if (def.tint) {
    const c = acc.tint(x, z, def.tint)
    tr = (c[0] * 255) | 0
    tg = (c[1] * 255) | 0
    tb = (c[2] * 255) | 0
  }
  const sc = def.scale || 1
  const inset = (1 - sc) / 2
  // Nunca encostar na parede da célula: ver RECUO_CRUZ. Uma planta em escala
  // cheia teria ponta em x+1 e o `floor` do shader a jogaria no bloco vizinho.
  const lo = Math.max(inset, RECUO_CRUZ)
  const hi = Math.min(1 - inset, 1 - RECUO_CRUZ)
  const top = def.scale < 1 ? sc : 1
  const quads = [
    [
      [lo, 0, lo],
      [hi, 0, hi],
    ],
    [
      [hi, 0, lo],
      [lo, 0, hi],
    ],
  ]
  for (const [p0, p1] of quads) {
    const start = bucket.n
    const corners = [
      [p0[0], 0, p0[2]],
      [p1[0], 0, p1[2]],
      [p1[0], top, p1[2]],
      [p0[0], top, p0[2]],
    ]
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    for (let i = 0; i < 4; i++) {
      bucket.pos.push(x + corners[i][0], y + corners[i][1], z + corners[i][2])
      bucket.nor.push(0, 127, 0) // normal pra cima: planta recebe luz do céu
      bucket.uv.push(uvs[i][0], uvs[i][1])
      bucket.layer.push(layer)
      bucket.light.push(235, sky, blk)
      bucket.tint.push(tr, tg, tb)
      // topo balança, base fica presa no chão
      bucket.wind.push(i >= 2 ? VENTO_DE_BLOCO[id] : 0)
    }
    // dupla face (a cruz é vista dos dois lados)
    bucket.idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
    bucket.idx.push(start, start + 2, start + 1, start, start + 3, start + 2)
    bucket.n += 4
  }
}

export { FACES, AO_LEVEL, aoValue, faceVisible, bucketOf }
