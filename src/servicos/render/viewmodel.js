// RoqueCraft — a MÃO em primeira pessoa.
//
// Sem ela o jogo é uma câmera flutuante: você aponta pro bloco, ele racha e
// some, e nada no mundo diz que foi VOCÊ (relato do founder, 2026-08-20). A mão
// é o que dá corpo ao jogador — e o balanço dela é o que faz a quebra ter peso.
//
// Como é montada: um grupo filho da CÂMERA. Assim ela acompanha o olhar de
// graça, sem sincronizar posição a cada frame, e o mundo continua sendo
// desenhado pela câmera normal.
//
// Duas armadilhas que essa técnica tem, e como cada uma é resolvida aqui:
//
//  1. **A mão atravessa o mundo.** Ela vive a ~0,4 de distância da câmera; um
//     bloco a 0,3 passa por cima. A saída padrão do gênero é uma SEGUNDA cena
//     com câmera própria, desenhada depois com o depth limpo. É o que fazemos.
//  2. **A mão fica preta.** Uma cena nova não tem luz nenhuma. A luz daqui é
//     própria e fixa (uma direcional suave + ambiente), acompanhando o dia só
//     na intensidade — assim a mão escurece à noite sem virar silhueta.

import * as THREE from 'three'
import { curvaDeGolpe, repiqueDeGolpe, recuoDeGolpe } from '../anim.js'
import { cuboParaVoxel } from './voxelMaterial.js'

// CURVA DO GOLPE. `t` vai de 0 a 1.
//
// Não é uma senoide, e a diferença é a coisa mais reconhecível da animação do
// original. Lá o braço é animado por `sin(sqrt(t)·π)`: a raiz comprime o começo
// e estica o fim, então o braço DISPARA e volta devagar. Uma senoide pura sobe
// e desce no mesmo ritmo e o golpe fica com cara de aceno.
//
// Pico em sqrt(t) = 0.5, ou seja t = 0.25 - o braço passa 3/4 do ciclo voltando.
//
// A curva mora em `anim.js`, não aqui, porque o braço do jogador REMOTO usa a
// mesma: com duas cópias, o mesmo golpe teria dois tempos na mesma tela.
const CURVA = curvaDeGolpe
const REPIQUE = repiqueDeGolpe
const RECUO = recuoDeGolpe

// Os dois tipos (minerar e golpe único) usam a MESMA curva - é o que o
// original faz - e diferem só na VELOCIDADE do ciclo, lá embaixo em `update`.

// GRÃO da pele e da manga.
//
// 32 texels e amplitude ±5%, não 16 e ±14%. O número não é gosto: a mão ocupa
// ~250 px de altura na tela, então um atlas de 16 dá texels de 15 px e um
// contraste de ±14% entre vizinhos desenha FAIXAS de 15 px - na folha de
// contato de 2026-08-24 a pele lia como TÁBUA DE MADEIRA e a manga como
// xadrez de brim. Com 32 texels o grão cai pra 7 px e com ±5% ele vira ruído
// de superfície em vez de padrão. O grão existe pra tirar o plástico da cor
// chapada, não pra desenhar textura.
const GRAO = 32
function grain(hex, seed) {
  const c = document.createElement('canvas')
  c.width = c.height = GRAO
  const g = c.getContext('2d')
  const r = (hex >> 16) & 255
  const gg = (hex >> 8) & 255
  const b = hex & 255
  let s = seed >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let y = 0; y < GRAO; y++) {
    for (let x = 0; x < GRAO; x++) {
      const k = 0.95 + rnd() * 0.1
      g.fillStyle = `rgb(${Math.min(255, r * k)},${Math.min(255, gg * k)},${Math.min(255, b * k)})`
      g.fillRect(x, y, 1, 1)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  // sRGB, não linear. É o MESMO erro que deixou as 81 texturas do mundo 1,4×
  // claras demais em 19/08: sem esta linha o 0xd9a06b da pele entra no shader
  // como se já fosse linear e a mão sai rosa-clara estourada.
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

import { assentoDe, golpeDe, pecaDe } from '../pecaNaMao.js'
import { BRILHO, SOMBRA, tomDoMetal } from '../spriteDoItem.js'

const mat = (hex, seed, extra = {}) =>
  new THREE.MeshStandardMaterial({ map: grain(hex, seed), roughness: 0.9, metalness: 0, ...extra })

// Cor por tier da ferramenta (casa com os sprites de item)
const TIER_COLOR = { wood: 0xa9793f, stone: 0x8c8c92, iron: 0xd8d8dc, diamond: 0x4fe3d6 }

export function createViewModel(renderer) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(58, 1, 0.01, 8)

  // Luz PRÓPRIA: cena nova não herda a do mundo, e sem isto a mão sai preta.
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  // DIREÇÃO CALIBRADA contra a tabela de sombreamento por face do original:
  // topo 1.0, frente 0.8, lateral 0.6. Com a luz em (-0.6, 1, 0.8) - alta
  // demais - a face lateral do braço torcido, que aponta pra baixo-esquerda,
  // ficava em 0.46 do brilho da frente (medido nos pixels da folha de contato,
  // não estimado): contraste de recorte, o braço lia como duas peças coladas.
  // Baixando e abrindo a luz pra (-0.9, 0.75, 0.75) as três faces caem em
  // 1.00 / 0.82 / 0.57 - a mesma escada do original.
  key.position.set(-0.9, 0.75, 0.75)
  // O CHÃO do hemisférico não pode ser quase preto. Com a torção do braço a
  // face lateral aponta pra baixo-esquerda e pega L·n = 0.14 da direcional:
  // quem a salva de virar silhueta é o termo de baixo do hemisférico. Com
  // 0x40352a ela caía pra ~8% do brilho da frente - contraste de recorte, não
  // de volume.
  const fill = new THREE.HemisphereLight(0xcfe0ff, 0x7a6c5c, 0.85)
  scene.add(key, fill)

  const rig = new THREE.Group()
  scene.add(rig)

  const skin = mat(0xd9a06b, 11)
  const sleeve = mat(0x3f6fa8, 23)

  // O braço cresce pra CIMA a partir da origem do rig, e o rig fica ancorado
  // ABAIXO da borda inferior do quadro: o cotovelo sai pela borda e só o
  // antebraço, a mão e a ferramenta entram em cena. É como o gênero desenha
  // isso, e é o que faz a mão parecer presa a um corpo em vez de flutuar.
  //
  // Erro que custou uma rodada inteira de QA (2026-08-20): a primeira versão
  // crescia pra BAIXO a partir de y=-0.36. Com fov 58 e o rig em z=-0.62 a
  // meia-altura do frustum ali é tan(29°)·0.62 = 0.344 - o punho nascia em
  // -0.76, ou seja a DOIS quadros abaixo da borda. Não havia bug de render
  // nenhum: a mão estava desenhada, fora da tela. Por isso existe agora um
  // teste que PROJETA a mão em NDC (viewmodel.spec.js) em vez de conferir só
  // se o objeto está na cena.
  // Proporção medida, não chutada: com fov 58 e o rig em z=-0.62 a meia-altura
  // do frustum é 0.344. Um punho de 0.13 ocupava 19% da tela - parecia uma luva
  // de boxe. 0.095 dá ~14%, que é o que o gênero usa.
  // PROPORÇÃO DO BRAÇO, medida no original: a caixa do braço lá é 4×12×4
  // pixels, ou seja 1 : 3 : 1. A nossa primeira versão tinha antebraço 0.085 ×
  // 0.30 mais um punho mais LARGO que ele (0.095) - dava 1 : 4.6 com um bulbo
  // na ponta, e lia como um osso, não como um braço.
  //
  // Agora a manga e a mão têm a MESMA largura e empilham em 0.32 de altura:
  // 0.105 : 0.32 = 1 : 3.05. No original também é assim - é UMA caixa só, com
  // a textura da pele ocupando o topo e a manga o resto. Duas caixas da mesma
  // largura dão a mesma silhueta e evitam ter que pintar um atlas de skin.
  const LARGURA = 0.1

  // TORÇÃO: o braço gira em torno do PRÓPRIO eixo. É a linha que separa "braço"
  // de "tábua", e ela custou uma folha de contato inteira pra aparecer.
  //
  // O defeito: com a pose de repouso antiga a normal da face da FRENTE dava
  // 0.87 com a direção da câmera e a da face lateral dava 0.14 - ou seja, o
  // braço era visto quase de chapa, com um fio escuro de 2 px na borda. Uma
  // caixa vista de chapa é um retângulo, e foi exatamente isso que o founder
  // fotografou no celular: uma lasca bege atravessada no canto.
  //
  // Girando 0.38 rad em torno do eixo longo, as duas normais passam a 0.78 e
  // 0.41: duas faces com brilhos diferentes, que é o que o olho lê como VOLUME.
  // Girar em torno do eixo longo (e não reposicionar o rig) foi de propósito -
  // não move o punho um milímetro, então o enquadramento medido continua valendo.
  const TORCAO = 0.38
  // A silhueta de um quadrado torcido é (cos+sen) vezes mais larga. Entra na
  // conta da escala lá embaixo, senão o teto de largura na tela mente em 30%.
  const LARGURA_APARENTE = LARGURA * (Math.cos(TORCAO) + Math.sin(TORCAO))

  const braco = new THREE.Group()
  braco.rotation.y = TORCAO
  const antebraco = new THREE.Mesh(new THREE.BoxGeometry(LARGURA, 0.215, LARGURA), sleeve)
  antebraco.position.set(0, 0.1075, 0)
  const mao = new THREE.Mesh(new THREE.BoxGeometry(LARGURA, 0.105, LARGURA), skin)
  mao.position.set(0, 0.2675, 0)
  // ⚠️ MARCADOS. A silhueta do braço precisa ser medida SEM as peças, e elas são
  // filhas dele: o primeiro teste que escrevi somava as caixas de uma espada
  // invisível à conta do braço e acusava 23% onde havia 15%. Uma marca explícita
  // é mais barata que descobrir isso duas vezes.
  antebraco.userData.braco = true
  mao.userData.braco = true
  braco.add(antebraco, mao)
  rig.add(braco)

  // AS PEÇAS NA MÃO, uma por classe, construídas a partir da tabela.
  //
  // ⚠️ ANTES ERA UMA SÓ. A geometria da picareta — cabo, barra e duas pontas
  // caídas — servia de espada, machado, pá, enxada e tesoura, e só a COR do
  // metal mudava. A tocha nem chegava aqui: por ser bloco item, ela caía no
  // ramo do cubo e virava um cubo cheio com a textura de tocha nas seis faces.
  //
  // A forma mora em `pecaNaMao.js`, que é dado puro e tem teste de unidade. Aqui
  // só sobra montar caixa, e é de propósito: silhueta que se afirma sem three.js
  // é silhueta que não precisa de foto para reprovar.
  //
  // ⚠️ CONSTRUÍDAS SOB DEMANDA e guardadas: montar as oito no boot custaria ~30
  // malhas e materiais que a maioria das partidas nunca mostra, e a mão já é a
  // coisa mais sensível a tempo de primeiro quadro neste arquivo.
  /**
   * QUANTO A PEÇA CRESCE EM CIMA DA ESCALA DO ASSENTO.
   *
   * ⚠️ ELA EXISTE PORQUE O BRAÇO ENCOLHEU, e a peça é FILHA dele: o teto de
   * silhueta novo (ver `larguraMax`) derrubou o rig inteiro, e sem esta
   * compensação a espada saía de 18% da tela para 8%. O que precisava encolher
   * era o braço, não a ferramenta.
   *
   * O número é medido, não escolhido — e foi ajustado por bisseção contra a
   * catraca de `silhuetaDaMao.spec.js`: em 2.4 a espada empatava com o braço em
   * 16:9 (razão 0,97) e em 2.6 empatava em 4:3 (1,03). 2.8 é o primeiro valor
   * em que a ferramenta é maior que o braço nos TRÊS aspectos, que é a inversão
   * que a referência do founder mostra (lá o braço nem aparece).
   */
  const ESCALA_DA_PECA = 2.8

  const pecas = new Map()
  let pecaAtual = null
  let classeAtual = null

  const MATERIAL_DO_PAPEL = {
    // Cabo clareado de 0x7a5334 pra 0x8a6340: com a luz nova a face visível do
    // cabo caía em ~0.35 do brilho e o cabo lia como uma faixa preta.
    cabo: () => mat(0x8a6340, 7),
    metal: (tier) => mat(TIER_COLOR[tier] || TIER_COLOR.wood, 13),
    // ⚠️ O BRILHO E A SOMBRA VÊM DO DESENHO, não da luz. Um sprite extrudado é
    // quase chapado de frente — a direcional não separa um pixel do vizinho — e
    // é a pintura que dá gume e volume. Sem estes dois papéis a espada nova
    // seria uma silhueta boa, cinza uniforme por dentro.
    metalClaro: (tier) => mat(tomDoMetal(TIER_COLOR[tier] || TIER_COLOR.wood, BRILHO), 29),
    metalEscuro: (tier) => mat(tomDoMetal(TIER_COLOR[tier] || TIER_COLOR.wood, SOMBRA), 31),
    caboEscuro: () => mat(0x5d4228, 9),
    // ⚠️ A CHAMA NÃO RECEBE LUZ NENHUMA: ela É a luz, e por isso deixou de ser
    // `MeshStandardMaterial` com `emissive`. Com o Standard o albedo continuava
    // entrando na conta e o emissive só somava por cima: medido na foto da
    // sonda de 15/09/2026, a chama saía com saturação 0,20-0,35 — um bloco
    // AMARELO PÁLIDO, não fogo. `MeshBasicMaterial` entrega a cor crua, que é
    // como o original desenha o topo da tocha (textura full-bright).
    chama: () => new THREE.MeshBasicMaterial({ map: grain(0xffb03a, 21) }),
    brasa: () => new THREE.MeshBasicMaterial({ map: grain(0xff7a1e, 17) }),
    corda: () => mat(0xb9a678, 5),
  }

  function montarPeca(classe, tier) {
    const desenho = pecaDe(classe)
    if (!desenho) return null
    const grupo = new THREE.Group()
    const cache = {}
    for (const c of desenho) {
      const fazer = MATERIAL_DO_PAPEL[c.papel] || MATERIAL_DO_PAPEL.cabo
      // Um material por papel, e não por caixa: a espada tem cinco caixas de
      // metal e criar cinco materiais iguais é cinco vezes o mesmo upload.
      cache[c.papel] = cache[c.papel] || fazer(tier)
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), cache[c.papel])
      m.position.set(c.x, c.y, c.z)
      m.rotation.set(c.rx, c.ry, c.rz)
      grupo.add(m)
    }
    const a = assentoDe(classe)
    grupo.scale.setScalar(a.escala * ESCALA_DA_PECA)
    grupo.position.set(a.x, a.y, a.z)
    grupo.rotation.set(a.rx ?? 0, a.ry ?? 0, a.rz ?? 0)
    grupo.visible = false
    braco.add(grupo)
    return grupo
  }

  /**
   * A PONTA da peça: a caixa mais alta dela.
   *
   * ⚠️ O TESTE DE ENQUADRAMENTO PRECISA DISTO, e era `cabeca` — uma variável de
   * módulo que só existia porque só existia uma geometria. Com a peça montada
   * por classe, "a cabeça da ferramenta" passa a ser uma pergunta: qual caixa?
   * A resposta é a mais alta, que é justamente a que sai do quadro primeiro e a
   * que pode cobrir a mira. Era o que o teste media antes, por acidente.
   */
  const pontaDe = (grupo) =>
    grupo?.children?.length
      ? grupo.children.reduce((a, b) =>
          b.position.y + b.geometry.parameters.height / 2 >
          a.position.y + a.geometry.parameters.height / 2
            ? b
            : a,
        )
      : null

  // ⚠️ SOBREVIVE AO ESCONDER. O teste guarda a referência e depois confere
  // `parent.visible === false` com a mão vazia; zerar isto aqui faria ele ler
  // `null.parent` e morrer por um motivo que não é o que ele mede.
  let ultimaPonta = null

  /** Mostra a peça desta classe e esconde a anterior. `null` = mão vazia. */
  function mostrarPeca(classe, tier) {
    const chave = `${classe}|${tier}`
    if (pecaAtual) pecaAtual.visible = false
    pecaAtual = null
    classeAtual = null
    if (!classe) return
    if (!pecas.has(chave)) pecas.set(chave, montarPeca(classe, tier))
    const g = pecas.get(chave)
    if (!g) return
    g.visible = true
    pecaAtual = g
    classeAtual = classe
    ultimaPonta = pontaDe(g)
  }

  // Bloco na mão: cubo com a textura REAL do jogo (o mesmo texture array).
  //
  // Usar o material do mundo obriga a fornecer os mesmos ATRIBUTOS que a malha
  // do mundo fornece. Uma BoxGeometry crua não tem aLayer/aLight/aTint/aWind:
  // o shader lê 0 em tudo, amostra a camada 0 com luz 0, e o resultado é um
  // cubo PRETO ocupando um terço da tela. Foi o que o QA de 2026-08-20
  // fotografou quando a mão finalmente entrou no quadro - o defeito estava
  // escondido atrás do outro.
  //
  // A ordem das faces da BoxGeometry (+x, -x, +y, -y, +z, -z, 4 vértices cada)
  // é a MESMA de FACE_LAYERS. Não é coincidência conveniente: é o que permite
  // copiar as camadas por face direto, sem tabela de tradução.
  let blocoMesh = null
  function setBlockMaterial(material) {
    if (blocoMesh) return
    // O MESMO cubo do bloco que cai, só menor: a lista de atributos pertence
    // ao shader e mora com ele.
    const geo = cuboParaVoxel(THREE, 0.125)
    blocoMesh = new THREE.Mesh(geo, material)
    blocoMesh.position.set(0.05, 0.3, 0.01)
    blocoMesh.rotation.set(0.2, 0.7, 0.1)
    blocoMesh.visible = false
    braco.add(blocoMesh)
  }

  // Escreve direto no array. `setX`/`setXYZ` normalizam sozinhos em atributos
  // marcados como normalized, e a conversão dupla já custou um bug em outro
  // canto do projeto - aqui o valor é o byte, ponto.
  function pintaBloco(faceLayers, tintHex) {
    const L = blocoMesh.geometry.getAttribute('aLayer')
    const T = blocoMesh.geometry.getAttribute('aTint')
    const r = (tintHex >> 16) & 255
    const g = (tintHex >> 8) & 255
    const b = tintHex & 255
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v
        L.array[i] = faceLayers[f]
        T.array[i * 3] = r
        T.array[i * 3 + 1] = g
        T.array[i * 3 + 2] = b
      }
    }
    L.needsUpdate = true
    T.needsUpdate = true
  }

  // Pose de repouso: cotovelo fora do quadro no canto inferior direito, braço
  // inclinado pra dentro (rz) de modo que a mão pouse perto do centro-baixo.
  const REPOUSO = { z: -0.62, rx: -0.1, ry: -0.16, rz: 0.64 }

  // ONDE O PUNHO POUSA — em NDC, não em unidades de mundo.
  //
  // Ancorar em unidades de mundo é o que quebrou a mão no celular em pé. O
  // frustum tem meia-altura fixa (o fov trava isso) mas meia-LARGURA
  // proporcional ao aspecto: 0.61 em 16:9, 0.16 em 430×932. O braço tem 0.105
  // de largura em unidades de mundo nos dois casos - ou seja 9% da tela no
  // desktop e 33% no celular. Não havia bug nenhum no celular: era a mesma
  // mão, num quadro 4× mais estreito. Medido na folha de contato de
  // 2026-08-24: 10.9% de área no desktop, 17.7% no retrato.
  //
  // Então a âncora vira um ALVO em NDC e `resize()` resolve pra trás quanto
  // vale isso em mundo, com uma escala que limita a largura na tela. Trocar o
  // fov, a distância ou a pose não desalinha mais nada.
  // Dois alvos, porque em RETRATO o HUD de toque ocupa exatamente o canto onde
  // a mão pousa: o bloco de botões de ação tem 124×124 px encostado na direita,
  // 96 px acima da borda de baixo. Medido na folha de contato de 2026-08-24: em
  // 430×932 só 0.7% da tela mostrava PELE - a mão inteira estava atrás do botão
  // de pular, e nenhuma sonda numérica reclamou porque o braço continuava
  // "dentro do quadro". No retrato o punho sobe pra CIMA do bloco de botões e o
  // antebraço passa por trás deles, que é como o gênero resolve no celular.
  //
  // O alvo do retrato é bem mais PRA DENTRO (x 0.10, não 0.44). Subir a mão
  // por cima do bloco de botões não funciona e a conta explica por quê: o braço
  // no retrato está em escala 0.63, então tem 0.20 de comprimento, e a regra do
  // cotovelo (que TEM que sair pela borda de baixo) prende a âncora em
  // -meiaAltura. Com o cotovelo preso lá embaixo e só 0.20 de braço, o punho
  // não alcança altura nenhuma - a primeira tentativa de subir foi engolida
  // pelo clamp e a mão nasceu no mesmo lugar de antes. O que sobra é atravessar
  // o quadro: o cotovelo entra pela direita e a mão termina à ESQUERDA dos
  // botões. Num quadro estreito o braço cruza mais largura, e isso é o certo.
  //
  // ⚠️ `larguraMax` É SILHUETA PROJETADA, e não a largura da caixa. A versão
  // anterior media a caixa do braço no plano do PUNHO e chamava isso de "20% da
  // tela" — mas o cotovelo está bem mais perto da câmera que o punho, e a
  // perspectiva o infla. Medido em 15/09/2026 projetando os oito cantos de cada
  // caixa: com `larguraMax: 0.2` o braço ocupava **27,9% em 16:9, 38,0% em 4:3
  // e 62,4% em retrato**. O teto existia, tinha número, e mentia em três
  // aspectos diferentes.
  //
  // O alvo novo veio da referência do founder (três fotos do jogo original,
  // 15/09/2026): lá o braço NÃO APARECE atrás da ferramenta, e a ferramenta
  // ocupa 18% da largura. Um braço mais largo que a ferramenta que ele segura é
  // o que fazia a nossa mão ler como tronco.
  const ALVO_LARGO = { x: 0.52, y: -0.52, larguraMax: 0.15 }
  const ALVO_ESTREITO = { x: 0.1, y: -0.44, larguraMax: 0.2 }
  const PUNHO_LOCAL = new THREE.Vector3(0, 0.2675, 0)

  /**
   * A meia-largura da SILHUETA do braço em NDC, projetada de verdade.
   *
   * ⚠️ PROJETA OS OITO CANTOS de cada caixa, e não o centro. Centro projetado é
   * um ponto: ele não tem largura, e foi por isso que o teto anterior conseguiu
   * ficar verde enquanto o braço tomava 38% da tela.
   */
  const CANTO = new THREE.Vector3()
  function meiaSilhuetaDoBraco() {
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    let min = Infinity
    let max = -Infinity
    for (const m of [antebraco, mao]) {
      const p = m.geometry.parameters
      for (const sx of [-0.5, 0.5])
        for (const sy of [-0.5, 0.5])
          for (const sz of [-0.5, 0.5]) {
            CANTO.set(sx * p.width, sy * p.height, sz * p.depth)
            m.localToWorld(CANTO)
            CANTO.project(camera)
            if (CANTO.x < min) min = CANTO.x
            if (CANTO.x > max) max = CANTO.x
          }
    }
    return (max - min) / 2
  }

  let anchorX = 0.48
  let anchorY = -0.41
  let escala = 1
  rig.position.set(anchorX, anchorY, REPOUSO.z)
  rig.rotation.set(REPOUSO.rx, REPOUSO.ry, REPOUSO.rz)

  let tSwing = 0
  let tipo = 'hit'
  let ativo = false
  let bob = 0
  let visivel = true

  function swing(kind = 'hit') {
    tipo = kind
    tSwing = 0
    ativo = true
  }

  // Mineração segurando o botão: reinicia o ciclo em vez de cortar no meio.
  /**
   * Segurar para cavar. O ciclo REINICIA sozinho enquanto o dedo está no botão;
   * `update` é quem devolve `tSwing` a zero no fim de cada volta.
   *
   * ⚠️ CAVAR TOMA O CONTROLE DE QUEM ESTIVER BATENDO, e isto conserta um defeito
   * que passou despercebido desde que os dois gestos existem. A condição era
   * `if (on && !ativo)`: bastava haver um golpe de ATAQUE correndo para o gesto
   * de cavar nunca entrar. E sempre há — `breakBlock` dispara `swing('hit')` a
   * cada bloco que cai, então quem quebra rápido (picareta de ferro em terra)
   * encadeia golpes de ataque e não vê o gesto de cavar uma única vez.
   *
   * Medido pela sonda `qa-roquecraft-cavar` em 15/09/2026: segurando o botão com
   * a picareta, as doze amostras do ciclo vinham com `tipo: "hit"`. Com a espada
   * vinha `"dig"` — a diferença era só o instante em que o clique caiu, o que
   * torna o defeito intermitente e explica por que ninguém o reportou.
   *
   * A troca não reinicia um ciclo de cavar que já esteja correndo: isso faria a
   * ferramenta tremer no lugar de girar, a cada quadro.
   */
  function digging(on) {
    if (on && (!ativo || tipo !== 'dig')) swing('dig')
    if (!on && tipo === 'dig') ativo = false
  }

  /**
   * O que está na mão.
   *
   * ⚠️ `classe` É NOVA E É O PONTO DA ONDA. `items.js` sempre soube que
   * `iron_sword` é `{ kind:'sword', tier:2 }` — o componente é que mandava só o
   * tier e jogava `tool.kind` fora, e o viewmodel desenhava picareta para tudo.
   * Sem a classe aqui, a tabela de peças não serve para nada.
   */
  function setHeld({
    kind = 'hand',
    tier = 'wood',
    classe = null,
    faceLayers = null,
    tint = 0xffffff,
  } = {}) {
    // `peca` cobre ferramenta E tocha: a tocha é bloco no inventário e peça na
    // mão, e é justamente essa distinção que faltava.
    mostrarPeca(kind === 'peca' || kind === 'tool' ? classe || 'pickaxe' : null, tier)
    // Só mostra o cubo com as SEIS camadas resolvidas. Camada -1 significa
    // "não sei que textura é essa" - melhor a mão vazia do que um cubo errado.
    const bloco =
      kind === 'block' &&
      Array.isArray(faceLayers) &&
      faceLayers.length === 6 &&
      faceLayers.every((l) => Number.isFinite(l) && l >= 0)
    if (blocoMesh) {
      blocoMesh.visible = bloco
      if (bloco) pintaBloco(faceLayers, tint)
    }
  }

  function setVisible(v) {
    visivel = !!v
    rig.visible = visivel
  }

  // `moving` alimenta o bob de caminhada: a mão sobe e desce junto com o passo.
  // É o detalhe que separa "modelo grudado na tela" de "braço de alguém".
  function update(dt, { moving = false, intensity = 1 } = {}) {
    if (!visivel) return
    if (ativo) {
      tSwing += dt * golpeDe(classeAtual, tipo).velocidade
      if (tSwing >= 1) {
        if (tipo === 'dig') tSwing = 0
        else {
          tSwing = 0
          ativo = false
        }
      }
    }
    bob += dt * (moving ? 7.5 : 1.6)

    const s = ativo ? CURVA(tSwing) : 0
    const s2 = ativo ? REPIQUE(tSwing) : 0
    const bx = Math.sin(bob) * (moving ? 0.018 : 0.005)
    const by = Math.abs(Math.cos(bob)) * (moving ? 0.022 : 0.006)

    // O golpe joga o braço pra FRENTE e pra dentro (rx negativo derruba a ponta
    // na direção da mira), com o repique subindo o punho no meio do arco. As
    // amplitudes não são gosto: com rx=-1.05 a mão saía do quadro no pico
    // (NDC y = -1.03, medido em 2026-08-20). O teste de enquadramento varre o
    // ciclo INTEIRO, não só o pico - com a curva de raiz o pico mudou de lugar
    // (t=0.25, não t=0.5) e um teste de instante único passaria a olhar pro
    // lado errado da animação.
    // Tudo que a animação desloca é multiplicado pela ESCALA. Sem isso o mesmo
    // golpe que anda 0.09 num braço de tamanho 1 anda 0.09 num braço de 0.6 -
    // ou seja, no celular o coice atiraria a mãozinha pra metade da tela.
    // ⚠️ A AMPLITUDE VEM DA CLASSE, e não é mais um número por eixo cravado
    // aqui. Espada atravessa a tela, machado desce, tesoura é pulso — era tudo
    // o mesmo arco na mesma amplitude, que é a metade "a movimentação está
    // muito ruim" da queixa.
    const G = golpeDe(classeAtual, tipo)
    // O RECUO é o que dá impulso: no comecinho do ciclo a peça vai PARA TRÁS
    // antes de vir. Sem ele o golpe começa no meio do caminho e o machado, que
    // vive do "levanta e desce", vira uma picareta devagar.
    const r = ativo ? RECUO(tSwing) * G.recuo * intensity : 0
    rig.position.set(
      anchorX + (bx - s * G.x * intensity) * escala,
      anchorY + (by + s2 * G.y * intensity) * escala,
      REPOUSO.z + s * G.z * intensity * escala,
    )
    rig.rotation.set(
      REPOUSO.rx - (s * G.rx - r) * intensity,
      REPOUSO.ry - s * G.ry * intensity,
      REPOUSO.rz + s * G.rz * intensity,
    )
  }

  // Desenha DEPOIS do mundo, com o depth zerado: é o que impede o bloco à
  // frente de cortar a mão ao meio.
  function render(luzDoDia = 1) {
    if (!visivel) return
    // Intensidades CALIBRADAS, não escolhidas: com o BRDF de Lambert do three
    // a saída é albedo·(intensidade/π). Com key 2.8 + hemi 1.45 o total dava
    // 1,35× o albedo e a mão saía estourada de branco (QA de 2026-08-20).
    key.intensity = 0.35 + luzDoDia * 1.35
    fill.intensity = 0.25 + luzDoDia * 0.65
    const auto = renderer.autoClear
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(scene, camera)
    renderer.autoClear = auto
  }

  // Precisa ser chamado JÁ NA CRIAÇÃO, não só no primeiro resize de janela: a
  // câmera nasce com aspecto 1 e, nesse aspecto, a meia-largura em z=-0.62 é
  // 0.344 - menor que o x de repouso. A mão nascia fora do quadro e o primeiro
  // frame (o print do QA) saía sem ela.
  /**
   * Resolve pra trás: onde o rig tem que estar pra que o PUNHO caia no alvo.
   * O punho é `PUNHO_LOCAL` no espaço do braço — a torção gira em torno desse
   * mesmo eixo, então não entra na conta.
   *
   * Saiu de dentro do `resize` porque o laço de ponto fixo da escala precisa
   * reposicionar entre um passo e outro: medir a silhueta com o rig no lugar
   * errado mede outra coisa.
   */
  function posicionarRig(meiaAltura, meiaLargura, alvo) {
    const punho = PUNHO_LOCAL.clone()
      .multiplyScalar(escala)
      .applyEuler(new THREE.Euler(REPOUSO.rx, REPOUSO.ry, REPOUSO.rz))
    anchorX = alvo.x * meiaLargura - punho.x
    // O cotovelo TEM que sair pela borda de baixo: um braço que começa dentro
    // do quadro é um toco flutuando. Em quadro estreito o alvo do punho sozinho
    // deixaria a origem do rig visível, então ela é empurrada pra fora.
    anchorY = Math.min(alvo.y * meiaAltura - punho.y, -meiaAltura * 1.04)
    rig.position.set(anchorX, anchorY, REPOUSO.z)
  }

  function resize(aspect) {
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    const meiaAltura = Math.tan((camera.fov * Math.PI) / 360) * Math.abs(REPOUSO.z)
    const meiaLargura = meiaAltura * aspect

    // ESCALA: teto de largura na tela. Em qualquer quadro mais largo que ~1:1 o
    // teto não morde (escala 1) e o braço tem o tamanho de sempre; num quadro
    // estreito ele encolhe até caber nos 20%.
    const alvo = aspect < 1 ? ALVO_ESTREITO : ALVO_LARGO
    // Primeiro palpite pela caixa, como antes — serve de ponto de partida.
    escala = Math.min(1, (alvo.larguraMax * 2 * meiaLargura) / LARGURA_APARENTE)
    rig.scale.setScalar(escala)
    // ⚠️ E DEPOIS TRÊS PASSOS DE PONTO FIXO CONTRA A SILHUETA DE VERDADE. A
    // relação escala → silhueta não é linear (é perspectiva), então não há
    // fórmula fechada; três passos bastam porque o erro cai por um fator de
    // ~10 a cada um. É barato: só roda no resize, e são 16 pontos por passo.
    for (let i = 0; i < 3; i++) {
      posicionarRig(meiaAltura, meiaLargura, alvo)
      const s = meiaSilhuetaDoBraco()
      if (!(s > 0)) break
      escala = Math.min(1, escala * (alvo.larguraMax / s))
      rig.scale.setScalar(escala)
    }

    posicionarRig(meiaAltura, meiaLargura, alvo)
  }
  resize(camera.aspect)

  function dispose() {
    scene.traverse((o) => {
      o.geometry?.dispose?.()
      if (o.material?.map) o.material.map.dispose()
      o.material?.dispose?.()
    })
  }

  return {
    scene,
    camera,
    // Expostos pro teste de ENQUADRAMENTO: ele projeta estes dois em NDC e
    // reprova se saírem do quadro (o defeito de 2026-08-20 não era visível de
    // outro jeito - a cena estava correta, a mão é que estava fora da tela).
    partes: {
      rig,
      mao,
      // Getter, e não valor: a peça é montada sob demanda e troca com a classe.
      get cabecaFerramenta() {
        return ultimaPonta
      },
      get peca() {
        return pecaAtual
      },
      bloco: () => blocoMesh,
    },
    swing,
    digging,
    /**
     * Onde o golpe está AGORA. Existe para a sonda de cavar: sem isto, a única
     * forma de saber se o ciclo está correndo era olhar a foto e adivinhar.
     */
    estadoDoGolpe: () => ({
      ativo,
      tipo,
      tSwing,
      velocidade: golpeDe(classeAtual, tipo).velocidade,
      classe: classeAtual,
    }),
    setHeld,
    setBlockMaterial,
    setVisible,
    update,
    render,
    resize,
    dispose,
  }
}
