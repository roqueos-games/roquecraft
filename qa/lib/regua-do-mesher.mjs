// A RÉGUA DO MESHER: o custo por seção não pode subir sem alguém ver.
//
// O CI roda em 2 vCPU e não afirma orçamento de quadro nenhum desde a extração
// (plano de 25/09); `bench-mesher.mjs` mede no Mac e ninguém lia o número. Isto
// é o mesmo desenho da varredura das sondas: a máquina de verdade mede e grava
// um ledger (`qa/bench-mesher.json`), e o teste cobra o ledger.
//
// A comparação é CONTRA A PRÓPRIA MÁQUINA: a medição mais nova não pode ficar
// mais de TOLERANCIA acima da melhor medição anterior da mesma máquina. Sem
// isso o teto seria um número cravado para o Mac do founder, e o primeiro
// benchmark rodado noutra máquina ficaria vermelho sem o mesher ter mudado.
// A primeira medição de uma máquina nova não tem com quem se comparar e passa.

/** Quanto a medição mais nova pode envelhecer. Igual à varredura. */
export const FOLGA_DIAS = 21
/** Quanto acima da melhor medição anterior (mesma máquina) ainda passa. */
export const TOLERANCIA = 0.1
/** Quantas medições o ledger guarda por máquina. */
export const HISTORICO = 30

export const chaveDaMaquina = (m) => `${m?.plataforma}/${m?.arquitetura}/${m?.cpu}`

/**
 * @param {{ medicoes?: Array<{ quando: string, maquina: object, msPorSecao: number }> } | null} ledger
 * @param {number} agora Date.now()
 * @returns {{ ok: boolean, motivo: string }}
 */
export function vereditoDoMesher(ledger, agora = Date.now()) {
  const medicoes = Array.isArray(ledger?.medicoes) ? ledger.medicoes : []
  if (!medicoes.length) {
    return { ok: false, motivo: 'sem medição: rode node qa/bench-mesher.mjs --ledger' }
  }
  const ultima = medicoes[medicoes.length - 1]
  const idadeDias = (agora - new Date(ultima.quando).getTime()) / 86_400_000
  if (!(idadeDias <= FOLGA_DIAS)) {
    return {
      ok: false,
      motivo: `a última medição foi há ${Math.round(idadeDias)} dias (folga: ${FOLGA_DIAS}). Rode node qa/bench-mesher.mjs --ledger`,
    }
  }
  if (!(ultima.msPorSecao > 0)) {
    return { ok: false, motivo: `msPorSecao inválido na última medição: ${ultima.msPorSecao}` }
  }
  const chave = chaveDaMaquina(ultima.maquina)
  const anteriores = medicoes
    .slice(0, -1)
    .filter((m) => chaveDaMaquina(m.maquina) === chave && m.msPorSecao > 0)
  if (!anteriores.length) {
    return { ok: true, motivo: `primeira medição desta máquina (${chave}): ${ultima.msPorSecao} ms` }
  }
  const melhor = Math.min(...anteriores.map((m) => m.msPorSecao))
  const teto = melhor * (1 + TOLERANCIA)
  if (ultima.msPorSecao > teto) {
    return {
      ok: false,
      motivo: `o mesher ficou mais lento: ${ultima.msPorSecao} ms por seção contra ${melhor} ms (melhor desta máquina), teto ${teto.toFixed(3)} ms`,
    }
  }
  return { ok: true, motivo: `${ultima.msPorSecao} ms por seção, teto ${teto.toFixed(3)} ms` }
}

/** O ledger com a medição nova no fim, guardando só as últimas HISTORICO da máquina. */
export function comMedicao(ledger, medicao) {
  const medicoes = Array.isArray(ledger?.medicoes) ? ledger.medicoes : []
  const chave = chaveDaMaquina(medicao.maquina)
  const daMaquina = medicoes.filter((m) => chaveDaMaquina(m.maquina) === chave)
  const deOutras = medicoes.filter((m) => chaveDaMaquina(m.maquina) !== chave)
  const guardadas = [...daMaquina, medicao].slice(-HISTORICO)
  return { medicoes: [...deOutras, ...guardadas] }
}
