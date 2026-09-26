// RoqueCraft - MONTAR A CENA: texturas, motor, audio e camada de entidades.
//
// Isto morava em vinte e cinco linhas no meio de `boot`. Sao quatro pecas que
// nascem juntas, na ordem em que nascem (o motor precisa das texturas, a camada
// de entidades precisa da cena do motor), e cada uma carrega uma decisao que
// nunca teve teste porque so existia dentro do navegador.
//
// As quatro fabricas de verdade sao o PADRAO -- importar nao e depender, e o
// componente nao precisa repeti-las. O parametro existe pra que um teste possa
// trocar as quatro por dublês e afirmar que a particula desliga no aparelho
// fraco, que a sombra segue o perfil do motor e que um save sem o campo de som
// nao abre o jogo mudo. Sem essa porta, nada disso e verificavel sem uma GPU.

import { loadBlockTextures } from './render/textures.js'
import { createEngine } from './render/engine.js'
import { createAudio } from './audio.js'
import { createEntityLayer } from './render/entities.js'

const FABRICAS = {
  carregarTexturas: loadBlockTextures,
  criarMotor: createEngine,
  criarAudio: createAudio,
  criarEntidades: createEntityLayer,
}

/**
 * A ordem do boot, com o quanto ja andou e o que dizer enquanto anda.
 *
 * As texturas vem antes do motor porque ele nasce com elas; a barra reflete
 * isso. Numeros aqui e nao no componente pra que a ordem seja UMA coisa so.
 */
export const ETAPAS = {
  texturas: { pct: 20, msg: 'roqueCraft.boot.textures' },
  motor: { pct: 45, msg: 'roqueCraft.boot.engine' },
}

/** Volume mestre do jogo. */
export const VOLUME_INICIAL = 0.85

/**
 * O som esta ligado?
 *
 * ⚠️ `!== false` E NAO `=== true`. Um save de versao anterior nao tem o campo, e
 * `undefined` ali significa "nunca escolheu", nao "escolheu desligar". Com
 * `=== true` todo mundo que jogou antes da opcao existir abriria o jogo mudo, e
 * mudo parece jogo quebrado, nao jogo configurado.
 */
export const somLigado = (settings) => settings?.sound !== false

/**
 * A particula sai no aparelho fraco.
 *
 * Nao e capricho de qualidade: cada bloco quebrado cospe dezenas de pedacos com
 * fisica propria, e e a primeira coisa a derrubar o quadro num celular de
 * entrada. Sombra e outra historia -- quem decide ela e o PERFIL DO MOTOR, que
 * ja negociou com a GPU de verdade; a preferencia do jogador nao pode prometer
 * uma sombra que o aparelho nao desenha.
 */
export const temParticulas = (settings) => settings?.quality !== 'low'

/**
 * Monta tudo, na ordem.
 *
 * @param {object} e
 * @param {object} e.settings  ajustes ja resolvidos (ver `ajustes.js`)
 * @param {*} e.canvas
 * @param {*} e.container
 * @param {boolean} e.ehE2E  o harness fotografa a tela: precisa do buffer preso
 * @param {function} [e.aoProgredir]  `(pct, chaveDeTexto)` pra barra de boot
 * @param {object} [e.fabricas]  dublês, no teste; as de verdade, no jogo
 */
export async function criarCena({
  settings,
  canvas,
  container,
  ehE2E = false,
  aoProgredir = () => {},
  fabricas = FABRICAS,
}) {
  const { carregarTexturas, criarMotor, criarAudio, criarEntidades } = { ...FABRICAS, ...fabricas }

  aoProgredir(ETAPAS.texturas.pct, ETAPAS.texturas.msg)
  const textures = await carregarTexturas(null)

  aoProgredir(ETAPAS.motor.pct, ETAPAS.motor.msg)
  const { engine, entities } = await montarMotor({
    settings,
    canvas,
    container,
    textures,
    ehE2E,
    fabricas: { criarMotor, criarEntidades },
  })

  const audio = criarAudio({ volume: VOLUME_INICIAL })
  audio.setEnabled(somLigado(settings))

  return { textures, engine, audio, entities, pack: textures.pack || null }
}

/**
 * O motor e a camada de entidades, que nascem e MORREM juntos.
 *
 * ⚠️ ESTE CAMINHO E O MESMO DA TROCA DE QUALIDADE, de proposito.
 *
 * Sombra e cadeia de pos-processamento sao decididas na criacao do renderer, e
 * por isso mudar de perfil obriga a recriar tudo. Enquanto essas quatro linhas
 * estavam escritas duas vezes -- uma no boot, outra na troca -- as duas podiam
 * divergir em silencio, e o jogo passaria a se comportar diferente conforme o
 * jogador tivesse ou nao mexido nos ajustes naquela sessao.
 */
export async function montarMotor({
  settings,
  canvas,
  container,
  textures,
  ehE2E = false,
  fabricas = FABRICAS,
}) {
  const { criarMotor, criarEntidades } = { ...FABRICAS, ...fabricas }
  const engine = await criarMotor({
    canvas,
    container,
    quality: settings.quality,
    textures,
    // Sem `preserveDrawingBuffer` o canvas volta em branco na hora do print: o
    // navegador tem liberdade de descartar o buffer depois de compor, e o
    // harness fotografa DEPOIS. Ligado so no E2E porque custa memoria.
    preserveDrawingBuffer: ehE2E,
  })
  // O FOV escolhido tem que valer no PRIMEIRO quadro. Aplicado depois, o jogo
  // abre no campo de visao padrao e corrige na frente do jogador.
  engine.camera.fov = settings.fov
  engine.camera.updateProjectionMatrix()

  const entities = criarEntidades(engine.scene, {
    shadows: engine.profile.shadows,
    particles: temParticulas(settings),
  })
  return { engine, entities }
}
