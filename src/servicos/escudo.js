// RoqueCraft — A GUARDA: segurar o botão direito com o escudo (ou a mão vazia)
// apara o que vem pela frente.
//
// Puro. O que se guarda é decidido NA HORA DO GOLPE, pelo que está na mão
// naquele instante — não pelo que estava quando o botão desceu. Guardar o
// estado "levantei com o escudo" abriria a troca de slot com o botão segurado:
// o jogador puxa a espada e continua aparando flecha de graça.

/** Usos do escudo. */
export const DURABILIDADE_DO_ESCUDO = 336
/** O que a guarda apara: golpe de bicho, flecha e estouro. Queda e fome, não. */
export const FONTES_APARADAS = new Set(['mob', 'arrow', 'explosion'])
/** A mão vazia só segura metade do golpe de bicho — é braço, não escudo. */
export const GUARDA_DA_MAO = 0.5
/** Golpe forte desgasta mais o escudo: 1 + o dano, a partir de 3. */
export const GOLPE_FORTE = 3

/** O estado da guarda do jogador. */
export const criarGuarda = () => ({ levantada: false })

export function levantar(guarda) {
  guarda.levantada = true
  return guarda
}

export function baixar(guarda) {
  guarda.levantada = false
  return guarda
}

/** Com o que a mão se guarda: o escudo, o braço (mão vazia) ou nada. */
export function comQueSeGuarda(def) {
  if (!def) return 'mao'
  return def.tool?.kind === 'shield' ? 'escudo' : null
}

/**
 * O golpe vem pela frente? `yaw` 0 olha para −Z; a frente é (sin yaw, −cos yaw).
 * Sem origem conhecida, conta como frente — fome e veneno não entram aqui de
 * qualquer jeito, e recusar o benefício por falta de dado seria pior.
 */
export function pelaFrente(jogador, yaw, de) {
  if (!de) return true
  const dx = de.x - jogador.x
  const dz = de.z - jogador.z
  return dx * Math.sin(yaw) - dz * Math.cos(yaw) >= 0
}

/**
 * Apara o golpe. Devolve quanto PASSA e quanto o escudo DESGASTA.
 * - escudo: nada passa; desgasta 1, ou 1 + o dano quando o golpe é forte.
 * - mão vazia: só o golpe de bicho, e só metade; sem desgaste.
 * - guarda baixa, golpe pelas costas ou fonte que não se apara: passa inteiro.
 */
export function aparar(guarda, quanto, fonte, frente, com) {
  const nada = { passa: quanto, desgaste: 0 }
  if (!guarda.levantada || !frente || !com || !FONTES_APARADAS.has(fonte)) return nada
  if (com === 'escudo') {
    return { passa: 0, desgaste: quanto >= GOLPE_FORTE ? 1 + Math.floor(quanto) : 1 }
  }
  if (fonte === 'mob') return { passa: Math.ceil(quanto * GUARDA_DA_MAO), desgaste: 0 }
  return nada
}
