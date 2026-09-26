//
// REGISTRO DE EDIÇÕES — o que o jogador mudou no mundo, pronto pra gravar.
//
// O mundo é gerado por função pura a partir da semente: salvar o mundo inteiro
// seria salvar algo que se recalcula de graça. O que precisa ir pro disco é só
// a DIFERENÇA — cada bloco que o jogador quebrou ou colocou.
//
// A estrutura é um mapa de mapas: chunk → (índice local → id). Dois motivos,
// e nenhum é estético:
//
//  · O SALVAMENTO É POR CHUNK. Guardar uma lista plana obrigaria a varrer tudo
//    e agrupar na hora de gravar, a cada 2,5 s.
//  · SOBRESCRITA SAI DE GRAÇA. Quebrar e recolocar no mesmo lugar tem que
//    deixar UMA entrada, não duas — e num `Map` por índice isso é o
//    comportamento padrão, sem código.
//
// ⚠️ O TETO DE 240.000 EXISTE E NÃO É DECORATIVO. São 60.000 blocos editados
// (quatro números por bloco). Sem ele, um jogador que escave uma montanha
// inteira gera um payload que o `localStorage` recusa — e a recusa acontece no
// autosave, silenciosa, três horas depois de começar a construir. Truncar é
// pior que gravar tudo, mas é muito melhor que perder o save inteiro.

/** Quantos NÚMEROS o payload pode ter, no máximo. Quatro por bloco editado. */
export const TETO_DO_PAYLOAD = 240000

/**
 * Cria um registro de edições.
 *
 * As funções de coordenada entram por parâmetro pra que o teste não precise do
 * módulo de chunk inteiro, e pra que a regra "onde este bloco mora" continue
 * tendo um dono só.
 */
export function criarRegistroDeEdicoes({
  chunkKey,
  parseChunkKey,
  toChunkCoord,
  toLocalCoord,
  localIndex,
}) {
  const mapa = new Map()

  function registrar(x, y, z, id) {
    const key = chunkKey(toChunkCoord(x), toChunkCoord(z))
    let m = mapa.get(key)
    if (!m) {
      m = new Map()
      mapa.set(key, m)
    }
    m.set(localIndex(toLocalCoord(x), y, toLocalCoord(z)), id)
  }

  /** Achata pra `[cx, cz, indiceLocal, id, ...]`, respeitando o teto. */
  function coletar() {
    const out = []
    for (const [key, m] of mapa) {
      const { cx, cz } = parseChunkKey(key) || {}
      if (cx === undefined) continue
      for (const [li, id] of m) {
        out.push(cx, cz, li, id)
        if (out.length >= TETO_DO_PAYLOAD) return out
      }
    }
    return out
  }

  return {
    mapa,
    registrar,
    coletar,
    /** Quantos blocos distintos estão registrados. Serve pro QA e pro HUD. */
    get quantos() {
      let n = 0
      for (const m of mapa.values()) n += m.size
      return n
    },
  }
}
