/**
 * A superfície de QA da CENA: o que as sondas usam para perguntar ao
 * renderizador e ao mundo o que está acontecendo agora.
 *
 * ⚠️ POR QUE ISTO SAIU DO COMPONENTE POR ASSUNTO E NÃO EM BLOCO. O gancho de
 * E2E tem 1.240 linhas, e a tentação era mover as 1.240 de uma vez. Antes de
 * cortar eu levantei os identificadores livres: 102, dos quais 69 são estado e
 * função do componente. Um objeto de contexto com 69 propriedades não é
 * separação, é mudança de endereço: o acoplamento continua inteiro, só passa a
 * viajar numa bolsa, e o arquivo fica menor com o desenho pior.
 *
 * Este pedaço tem QUATRO dependências reais (engine, world, e duas funções de
 * leitura do olho). Isso é costura, não bolsa.
 *
 * ⚠️ E CADA BOTÃO AQUI EXISTE PORQUE UMA MEDIÇÃO FALHOU SEM ELE. `sombraQA`
 * nasceu porque comparar dois builds movia chunk, hora e enquadramento junto;
 * `ondaQA` porque autocorrelação não sobrevive a trocar o bundle entre as duas
 * fotos; `debugAgua` porque "esse branco é profundidade, espuma ou luz?" não se
 * responde olhando. São instrumentos, e instrumento sem interruptor é palpite.
 *
 * Serviço e não composable: não guarda estado nem ciclo de vida. Recebe o motor
 * e o mundo, devolve os métodos.
 */

import { WORLD_HEIGHT } from './constants.js'
import { blockDef } from './blocks.js'

/**
 * @param {object} ctx
 * @param {() => object} ctx.engine motor de render VIVO (getter: ele é recriado)
 * @param {() => object} ctx.world  cliente de mundo VIVO
 * @param {() => number} ctx.profundidadeDoOlho blocos de água acima da câmera
 * @param {() => boolean} ctx.submerso
 */
export function criarQaDeCena(ctx) {
  // Getters e não valores: `engine` e `world` são recriados ao trocar de perfil
  // de qualidade e ao abrir mundo novo. Capturar o valor aqui prenderia a
  // superfície de QA no motor MORTO, e o sintoma seria uma sonda medindo uma
  // cena que não está mais na tela.
  const engine = () => ctx.engine()
  const world = () => ctx.world()
  const profundidadeDoOlho = () => ctx.profundidadeDoOlho()
  const underwater = {
    get value() {
      return ctx.submerso()
    },
  }
  return {
    setFx: (o) => engine()?.setFx(o),
    inspect: () => engine()?.inspect(),
    // A água como o RENDER a vê agora: névoa, borrão e raios. Com
    // `profundidadeDoOlho` do lado, é o par que prova que raso e fundo são
    // estados diferentes — e não a mesma tela azul com nome novo.
    aguaVisual: () => ({
      ...(engine()?.inspecionarAgua?.() || {}),
      profundidadeDoOlho: profundidadeDoOlho(),
      submerso: underwater.value,
    }),
    // Emite uma ondulação sem precisar mergulhar de verdade: o QA precisa de
    // dois frames da MESMA câmera, um antes e um depois, pra PROVAR que a
    // lâmina reagiu. Um print sozinho nunca prova movimento.
    ondularAgua: (x, z, amp = 0.2) => !!engine()?.ondularAgua(x, z, amp),
    // Profundidade da lâmina numa coluna do mundo, em blocos — a MESMA conta
    // que o mesher faz. O QA usa isto pra escolher pontos de medição no oceano
    // de verdade em vez de construir uma piscina: cena construída por `fill`
    // depende de o mundo aceitar 12 mil edições e sobreviver a um recarregamento
    // de chunk, e em 2026-08-22 ela não sobreviveu — o harness fotografou uma
    // piscina vazia por três rodadas.
    profundidadeAgua: (x, z) => {
      if (!world()) return 0
      const bx = Math.floor(x)
      const bz = Math.floor(z)
      let topo = -1
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        if (world().liquidAt(bx, y, bz)) {
          topo = y
          break
        }
        if (world().solidAt(bx, y, bz)) return 0
      }
      if (topo < 0) return 0
      let d = 0
      while (d < 32 && world().liquidAt(bx, topo - d, bz)) d++
      return d
    },
    // O mundo é sólido nesta célula? Devolve a MESMA altura que a física usa
    // (0 = vazio, 1 = cubo cheio, fração = laje). O QA de colisão precisa
    // perguntar isso do lado de fora pra afirmar "o jogador terminou dentro da
    // pedra" sem depender de interpretar pixel.
    solidoEm: (x, y, z) => (world() ? world().solidAt(x, y, z) : 0),
    // O QUE é o bloco, não só se é sólido. Existe porque a espessura da coisa
    // sob o pé do jogador NÃO distingue copa de árvore de crosta de caverna —
    // as duas dão 1 a 5 blocos com ar embaixo — e eu concluí errado duas vezes
    // medindo por espessura. Quem responde "copa ou terra" é a chave do bloco.
    blocoEm: (x, y, z) =>
      blockDef(world()?.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) ?? 0)?.key ?? 'air',
    carregado: (x, z) => !!world()?.isLoaded(x, z),
    // Mexe no material do passe transparente em tempo de execução. Existe pra
    // o QA poder fazer A/B de `depthWrite` sem recompilar: a queixa do gelo
    // ("sem as laterais e inferior") é uma hipótese de ORDEM DE DESENHO, e
    // hipótese de ordem só se decide comparando dois quadros.
    matTransparente: (o) => {
      const m = engine()?.materials?.transparent
      if (!m) return null
      Object.assign(m, o)
      m.needsUpdate = true
      return { depthWrite: m.depthWrite, side: m.side, transparent: m.transparent }
    },
    // Mexe no viés da sombra em tempo de execução, no mesmo espírito de
    // `matTransparente`.
    //
    // Existe por um motivo só: uma sonda de sombra que não consegue REPRODUZIR
    // o defeito não tem verde que valha nada. Pra provar que a sombra encostou
    // no bloco eu preciso de duas fotos da MESMA câmera, no MESMO tick, com os
    // parâmetros de antes e os de agora — e reconstruir o bundle entre elas
    // troca o chunk, a hora e o enquadramento junto, o que estraga a comparação.
    // Devolve sempre o estado lido de volta do objeto, nunca o que foi pedido.
    sombraQA: (o = {}) => {
      const s = engine()?.sun?.shadow
      if (!s) return null
      if (o.bias !== undefined) s.bias = o.bias
      if (o.normalBias !== undefined) s.normalBias = o.normalBias
      if (o.radius !== undefined) s.radius = o.radius
      // `lado` = `shadowSide` do material SÓLIDO do chunk. 0 = FrontSide,
      // 1 = BackSide, 2 = DoubleSide (os valores do three).
      //
      // Existe porque a malha do chunk é CASCA ABERTA: o mesher só emite face
      // visível (`mesher.js`, "uma face é VISÍVEL quando o vizinho não a
      // esconde"), então o terreno não tem face de baixo. A hipótese era que
      // projetar pela face de trás numa casca aberta descartasse a face de cima
      // e produzisse o "filete de sombra" que o founder fotografou.
      //
      // ⚠️ HIPÓTESE TESTADA E REFUTADA (25/08/2026, `qa-roquecraft-sombra-lado`).
      // Com o sol a 34,5° e a câmera OLHANDO PRO SOL, os blocos projetam sombra
      // de tamanho cheio com `BackSide`. Comparando com o mesmo `normalBias`, os
      // lados diferem em 3,74% dos pixels contra um piso de 3,25% — ou seja,
      // empatam. `FrontSide` com `normalBias` baixo só TROCA o artefato: some um
      // pouco de fresta e aparece ACNE na areia. O filete do print era o sol
      // quase a pino (11:03) mais o peter-panning do build antigo, não o lado da
      // projeção. O botão fica porque a pergunta pode voltar; a resposta, não.
      if (o.lado !== undefined && engine()?.materials?.opaque) {
        engine().materials.opaque.shadowSide = o.lado
        engine().materials.opaque.needsUpdate = true
      }
      // ⚠️ NÃO mexe no frustum de propósito. O tamanho do frustum entra no
      // cálculo do texel usado no snapping (`q.shadowRadius`, no laço de
      // desenho), então trocar só a câmera aqui montaria um estado que nunca
      // existiu — nem o de antes nem o de agora — e o A/B sairia mentindo.
      // Frustum e snapping se conferem pelo número (`blocosPorTexel`), não por
      // foto.
      s.needsUpdate = true
      return {
        bias: s.bias,
        normalBias: s.normalBias,
        radius: s.radius,
        raio: s.camera.right,
        mapa: [s.mapSize.width, s.mapSize.height],
        lado: engine()?.materials?.opaque?.shadowSide ?? null,
      }
    },
    // O ESPECTRO DA ONDA em tempo de execução, no mesmo espírito de `sombraQA`.
    //
    // Existe porque repetição se mede por AUTOCORRELAÇÃO de pixel, e essa conta
    // não sobrevive a trocar o bundle entre as duas fotos: mudaria chunk, hora e
    // enquadramento junto. Com o botão, o espectro de ontem e o de hoje são
    // fotografados na mesma câmera, no mesmo instante da onda.
    ondaQA: (o = {}) => {
      const sh = engine()?.materials?.shared
      if (!sh) return null
      if (o.octavas !== undefined) sh.uOndaOctavas.value = o.octavas
      if (o.lacunaridade !== undefined) sh.uOndaLacunaridade.value = o.lacunaridade
      if (o.persistencia !== undefined) sh.uOndaPersistencia.value = o.persistencia
      if (o.L !== undefined) sh.uOndaL.value = o.L
      return {
        octavas: sh.uOndaOctavas.value,
        lacunaridade: sh.uOndaLacunaridade.value,
        persistencia: sh.uOndaPersistencia.value,
        L: sh.uOndaL.value,
      }
    },
    // 0 = normal, 1 = pinta a profundidade da lâmina, 2 = pinta a espuma.
    debugAgua: (m) => {
      if (engine()?.materials?.shared?.uDebugAgua) engine().materials.shared.uDebugAgua.value = m
      return m
    },
    // Projeta um ponto do MUNDO em coordenada de tela 0..1.
    //
    // Existe porque recorte de tela chutado por fração mente: no QA da água eu
    // medi o céu e depois o oceano ao fundo achando que media a piscina, e as
    // duas vezes o veredito saiu "OK". Quem sabe onde o objeto está na tela é a
    // câmera — então é ela que responde.,
  }
}
