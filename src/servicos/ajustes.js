// RoqueCraft - AJUSTES: o que a maquina detecta, o que o save lembra, e quem
// ganha quando os dois discordam.
//
// Puro de proposito: entra o que foi detectado e o que estava salvo, sai o
// objeto de ajustes. Sem Vue, sem `navigator`, sem `window` - a deteccao mora
// em `render/engine.js` e a leitura do save em `roqueCraftSave.js`.
//
// ⚠️ A REGRA QUE NAO PODE SUMIR: `low` NUNCA e elevado por um save.
//
// O jogador abre o jogo no desktop, o save guarda `quality: 'high'`, e depois
// ele abre no celular fraco. A deteccao diz `low`; o save diz `high`. Se o save
// vencer, o aparelho tenta desenhar sombra e pos-processamento que ele nao
// aguenta, e o resultado nao e "um pouco mais lento": e um quadro por segundo,
// ou uma aba que morre. A preferencia do jogador vale em tudo, menos em cima
// de um aparelho que ja se declarou incapaz.

/** Limites de cada ajuste. Sao os mesmos da tela de opcoes. */
export const LIMITES = {
  renderDistance: { min: 3, max: 16 },
  fov: { min: 55, max: 100 },
  sensitivity: { min: 0.3, max: 3 },
  music: { min: 0, max: 1 },
}

/** Campo de visao padrao no celular: mais largo, porque a tela e menor. */
export const FOV_NO_CELULAR = 78

const preso = (v, { min, max }) => Math.min(max, Math.max(min, v))

/**
 * Até onde a distância de render pode ir NESTE aparelho.
 *
 * ⚠️ A REGRA DA QUALIDADE VALIA SÓ PARA A QUALIDADE, e essa metade faltando era
 * o defeito (RC-12). O save que dizia `quality: 'high'` era recusado num
 * aparelho `low` — certo — e o save que dizia `renderDistance: 16` passava
 * inteiro, porque o único limite aplicado era o global (3 a 16). O celular que
 * acabou de se declarar incapaz recebia 16 chunks de raio: mais de mil chunks
 * para gerar, malhar e desenhar, no aparelho que não aguenta nem a sombra.
 *
 * Fora do `low`, o jogador manda até o limite global: quem tem máquina para
 * ver longe escolhe ver longe, e isso nunca esteve em questão.
 */
export function limiteDaDistancia(detectada, perfis) {
  if (detectada !== 'low') return LIMITES.renderDistance
  const doPerfil = perfis?.low?.renderDistance
  return {
    min: LIMITES.renderDistance.min,
    max: Number.isFinite(doPerfil) ? doPerfil : LIMITES.renderDistance.max,
  }
}

/**
 * Ajustes do save aplicados por cima dos detectados.
 *
 * @param {object} e
 * @param {object} e.ajustes  o objeto reativo de ajustes (mutado no lugar)
 * @param {string} e.detectada  a qualidade que a maquina aguenta
 * @param {object} e.perfis  `QUALITY`, pra tirar a distancia de render do perfil
 * @param {boolean} e.ehCelular
 * @param {object|null} e.salvos  `saved.settings`, se houver
 * @returns {object} o proprio `ajustes`, pra encadear
 */
export function aplicarAjustes({ ajustes, detectada, perfis, ehCelular, salvos }) {
  ajustes.quality = detectada
  ajustes.renderDistance = perfis[detectada].renderDistance
  if (ehCelular) ajustes.fov = FOV_NO_CELULAR
  if (!salvos) return ajustes

  const s = salvos
  // ⚠️ AQUI mora a regra do paragrafo do cabecalho.
  if (detectada !== 'low' && s.quality) ajustes.quality = s.quality
  if (Number.isFinite(s.renderDistance))
    ajustes.renderDistance = preso(s.renderDistance, limiteDaDistancia(detectada, perfis))
  if (Number.isFinite(s.fov)) ajustes.fov = preso(s.fov, LIMITES.fov)
  if (Number.isFinite(s.sensitivity))
    ajustes.sensitivity = preso(s.sensitivity, LIMITES.sensitivity)
  // ⚠️ `!== false` E NAO `!!`: save antigo nao tem o campo, e `undefined` tem
  // que virar LIGADO. Com `!!`, quem salvou antes destes ajustes existirem
  // abriria o jogo com auto-pulo, balanco e som desligados sem ter pedido.
  ajustes.autoJump = s.autoJump !== false
  ajustes.viewBob = s.viewBob !== false
  ajustes.sound = s.sound !== false
  // O minimapa entra pela mesma porta, e pelo mesmo motivo: quem salvou antes
  // dele existir tem que abrir o jogo COM o mapa, e nao sem ele.
  ajustes.minimapa = s.minimapa !== false
  // `showStats` e o oposto: o padrao e DESLIGADO, entao ausencia vira falso.
  ajustes.showStats = !!s.showStats
  if (Number.isFinite(s.music)) ajustes.music = preso(s.music, LIMITES.music)
  return ajustes
}
