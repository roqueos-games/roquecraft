// RoqueCraft - A TABELA DE ICONES do inventario: quem desenha o que.
//
// Isto morava em vinte linhas de `boot`, coladas entre a criacao do motor e a
// abertura do mundo, com dois `try/catch` e um `Object.assign` no meio. As
// regras aqui sao puras (que camada de textura e o topo do cubo, que icone um
// item pega emprestado quando nao tem o seu); quem desenha, e pode falhar, e o
// `render/textures`, que fica onde estava.

/**
 * A ordem das seis faces no atlas: +x, -x, +y, -y, +z, -z.
 *
 * ⚠️ ESTE NUMERO NAO E ARBITRARIO E NAO PODE SER "AJUSTADO ATE FICAR BONITO".
 * E a mesma ordem que o mesher usa para escrever `FACE_LAYERS[id * 6 + f]`. Se o
 * icone e o mundo discordarem, o bloco no inventario deixa de ser o bloco que se
 * coloca -- e o erro aparece so no olho de quem joga, nunca num teste de forma.
 */
export const FACE = { LESTE: 0, OESTE: 1, TOPO: 2, BASE: 3, SUL: 4, NORTE: 5 }

/** As seis camadas de um bloco, na ordem do atlas. Use no cubo da mao. */
export function camadasDoBloco(id, faceLayers) {
  return Array.from({ length: 6 }, (_, f) => faceLayers[id * 6 + f])
}

/**
 * O par (topo, lado) de cada bloco, que e o que o icone isometrico precisa.
 *
 * O icone mostra duas faces: a de cima e uma de lado. Nao ha escolha a fazer
 * entre os quatro lados -- num cubo bem texturizado eles sao iguais -- e por
 * isso `LESTE` serve por todos.
 */
export function camadasParaIcones(blocos, faceLayers) {
  const tabela = {}
  for (const b of Object.values(blocos)) {
    tabela[b.key] = {
      top: faceLayers[b.id * 6 + FACE.TOPO],
      side: faceLayers[b.id * 6 + FACE.LESTE],
    }
  }
  return tabela
}

/** O bloco que socorre um item sem nenhum emprestimo declarado. */
export const ICONE_DE_ULTIMO_RECURSO = 'stone'

/**
 * Junta os icones de bloco e de item e tapa os buracos.
 *
 * ⚠️ NENHUM ITEM PODE FICAR SEM DESENHO.
 *
 * Um slot com icone `undefined` nao aparece vazio: aparece QUEBRADO, e o jogador
 * nao consegue distinguir "nao tenho" de "tenho e o jogo nao sabe mostrar". Por
 * isso todo item que nao e bloco e nao ganhou sprite propria pega emprestado o
 * cubo do material mais proximo (vara vira tabua, carvao vira minerio), e quem
 * nao tem nem emprestimo declarado cai na pedra.
 *
 * A ultima linha ainda pode ser `null` -- se nem a pedra desenhou, o atlas
 * inteiro falhou e o problema nao e deste arquivo. `null` e honesto; `undefined`
 * seria um item que ninguem lembrou de considerar.
 */
export function completarIcones({ blocos = {}, itens = {}, definicoes, emprestimo = {} }) {
  const icones = { ...blocos, ...itens }
  for (const it of Object.values(definicoes)) {
    if (it.kind === 'block' || icones[it.key]) continue
    icones[it.key] = icones[emprestimo[it.key] || ICONE_DE_ULTIMO_RECURSO] || null
  }
  return icones
}

/**
 * A tabela pronta: desenha os dois atlas e tapa os buracos.
 *
 * ⚠️ AS DUAS METADES CAEM SOZINHAS, e isso e a regra, nao a implementacao.
 *
 * Desenhar icone depende de canvas, GPU e do pacote de textura -- tres coisas
 * que falham por conta propria. Um `try` unico em volta das duas perderia as
 * duas quando so uma quebrasse: o jogador ficaria com o inventario inteiro em
 * branco porque a sprite de UM item nao gerou. E um `throw` solto derrubaria o
 * boot, e o jogo nao abriria por causa de um desenho.
 *
 * @param {object} e
 * @param {*} e.manifest  o manifesto de textura
 * @param {object} e.blocos  a tabela de blocos (`BLOCKS`)
 * @param {Array} e.faceLayers  `FACE_LAYERS`
 * @param {object} e.definicoes  a tabela de itens (`ITEMS`)
 * @param {object} e.emprestimo  `FALLBACK_ICON`
 * @param {function} e.desenharBlocos  `(manifest, camadas) => Promise<object>`
 * @param {function} e.desenharItens  `() => Promise<object>`
 * @param {function} [e.avisar]  onde reclamar quando uma metade cai
 */
export async function montarIcones({
  manifest,
  blocos,
  faceLayers,
  definicoes,
  emprestimo,
  desenharBlocos,
  desenharItens,
  avisar = () => {},
}) {
  let deBloco = {}
  let deItem = {}
  try {
    deBloco = await desenharBlocos(manifest, camadasParaIcones(blocos, faceLayers))
  } catch (err) {
    avisar('blocos', err)
  }
  try {
    deItem = await desenharItens()
  } catch (err) {
    avisar('itens', err)
  }
  return completarIcones({ blocos: deBloco, itens: deItem, definicoes, emprestimo })
}

/**
 * OS ÍCONES DESTE JOGO, com as tabelas dele já ligadas.
 *
 * `montarIcones` acima é a regra e não conhece o RoqueCraft: recebe manifesto,
 * blocos, itens e os dois desenhistas. Esta é a chamada concreta, que morava no
 * `boot()` do componente como catorze linhas de ligação — e ligação de tabela é
 * exatamente o que não precisa estar perto do laço de quadro.
 */
export async function montarIconesDoJogo(manifest, avisar) {
  const [{ BLOCKS, FACE_LAYERS }, { ITEMS }, { FALLBACK_ICON }, render] = await Promise.all([
    import('./blocks.js'),
    import('./items.js'),
    import('./aparencia.js'),
    import('./render/textures.js'),
  ])
  return montarIcones({
    manifest,
    blocos: BLOCKS,
    faceLayers: FACE_LAYERS,
    definicoes: ITEMS,
    emprestimo: FALLBACK_ICON,
    desenharBlocos: render.buildBlockIcons,
    desenharItens: render.buildItemIcons,
    avisar,
  })
}
