//
// MIRAR — apontar a câmera do RoqueCraft para um ponto do mundo, e PROVAR que
// apontou.
//
// Por que isto existe, e por que não é `look(atan2(...))`:
//
// A convenção de yaw da câmera não é a da física. Chutar a fórmula já custou
// duas fotos do lado errado do mundo (rodada 5) e quatro "não achei o alvo" na
// sonda da escada. A primeira defesa foi enumerar as convenções plausíveis e
// ficar com a de menor erro — e ela funcionou por sorte: em foto picada, quase
// de cima, o yaw quase não importa, então qualquer candidato acerta o centro.
// Em 24/08/2026 a foto do quarto saiu com o piso vazio e um erro de mira de
// 0,95 — alvo fora da tela — enquanto o mundo, relido, estava perfeito. A
// enumeração não tinha a convenção certa, e nunca teria como saber.
//
// A correção não é acrescentar mais candidatos. É parar de adivinhar a
// convenção e MEDIR a resposta: gira um tiquinho, olha quanto o alvo andou na
// tela, e usa isso pra fechar a malha. Newton em duas variáveis quase
// desacopladas — yaw mexe em u, pitch mexe em v — convergindo em três ou
// quatro passos seja qual for o sinal, a ordem dos eixos ou o espelho.
//
// E o erro final volta junto. Uma sonda que fotografa sem olhar o erro não
// distingue "não construiu" de "olhou pro lado", e esses dois defeitos pedem
// consertos opostos.
//
const PASSOS = 8
const H = 0.02 // radianos: grande o bastante pra sair do ruído de um quadro

export function criarMirar(page) {
  return async function mirar(ax, ay, az, tol = 0.01) {
    return page.evaluate(
      async ([ax, ay, az, tol, PASSOS, H]) => {
        const rc = window.__roquecraft
        const quadro = () => new Promise((r) => requestAnimationFrame(() => r()))
        const p = rc.state.player
        // ⚠️ O OLHO, não os pés. A câmera fica ~1,6 acima de `player.y`, e
        // mirar a partir dos pés erra o pitch inteiro quando o alvo está perto:
        // a 3 blocos de distância o erro é maior que o próprio desnível.
        const py = rc.debug?.camera?.y ?? p.y

        const ver = async (yaw, pitch) => {
          rc.look(yaw, pitch)
          await quadro()
          await quadro()
          const v = rc.projetar(ax, ay, az)
          if (!v || !v.frente) return null
          return { u: v.u, v: v.v, err: Math.hypot(v.u - 0.5, v.v - 0.5) }
        }

        // 1. GROSSO — um chute qualquer que ponha o alvo na frente da câmera.
        //    Não precisa acertar; precisa dar um ponto de partida projetável.
        const base = Math.atan2(ax - p.x, az - p.z)
        const inc = Math.atan2(ay - py, Math.hypot(ax - p.x, az - p.z))
        let melhor = null
        for (const y of [base, base + Math.PI, Math.atan2(az - p.z, ax - p.x), -base]) {
          for (const t of [inc, -inc]) {
            const r = await ver(y, t)
            if (r && (!melhor || r.err < melhor.err)) melhor = { yaw: y, pitch: t, ...r }
          }
        }
        if (!melhor) return { err: Infinity, passos: 0, motivo: 'alvo nunca ficou à frente' }

        // 2. FINO — mede a resposta da tela ao giro e fecha a malha.
        let { yaw, pitch } = melhor
        let atual = melhor
        let passos = 0
        for (; passos < PASSOS && atual.err > tol; passos++) {
          const dy = await ver(yaw + H, pitch)
          const dp = await ver(yaw, pitch + H)
          if (!dy || !dp) break
          const du = (dy.u - atual.u) / H
          const dv = (dp.v - atual.v) / H
          // Derivada nula = giro não mexe no alvo (alvo no eixo, ou câmera
          // travada). Sem sinal pra seguir, para: o erro volta no relatório.
          if (Math.abs(du) < 1e-4 || Math.abs(dv) < 1e-4) break
          const passo = (d) => Math.max(-0.6, Math.min(0.6, d))
          const ny = yaw - passo((atual.u - 0.5) / du)
          const np = pitch - passo((atual.v - 0.5) / dv)
          const r = await ver(ny, np)
          if (!r || r.err >= atual.err) break // não melhorou: fica no melhor
          yaw = ny
          pitch = np
          atual = r
        }
        await ver(yaw, pitch)
        return { yaw, pitch, err: atual.err, passos }
      },
      [ax, ay, az, tol, PASSOS, H],
    )
  }
}
