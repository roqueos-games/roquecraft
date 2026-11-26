import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Dentro do RoqueOS a janela do jogo já começa abaixo da barra de status, e o host publica em
// `--ros-jogo-safe-top` só a parcela do inset que ainda cobre o palco (zero numa janela comum).
// Somar o `env(safe-area-inset-top)` cru empurrava a HUD, o minimapa e a tela de início para
// baixo uma segunda vez no iPhone (26/11/2026). Todo uso do inset do topo passa pela variável,
// com o `env()` só como reserva para o jogo aberto fora do RoqueOS.
const raiz = resolve(__dirname, '..', 'src')

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.(vue|scss|css|js)$/.test(nome) ? [caminho] : []
  })
}

describe('área segura do topo', () => {
  it('nenhum estilo soma o inset do topo cru, fora da variável do host', () => {
    const crus = []
    for (const arquivo of arquivos(raiz)) {
      const texto = readFileSync(arquivo, 'utf8')
      const usos = texto.match(/env\(safe-area-inset-top[^)]*\)/g) ?? []
      const embrulhados =
        texto.match(/--ros-jogo-safe-top,\s*env\(safe-area-inset-top[^)]*\)/g) ?? []
      if (usos.length !== embrulhados.length) crus.push(arquivo.slice(raiz.length + 1))
    }
    expect(crus).toEqual([])
  })

  it('a varredura enxerga os estilos que usam o inset', () => {
    const comInset = arquivos(raiz).filter((a) =>
      readFileSync(a, 'utf8').includes('safe-area-inset-top'),
    )
    expect(comInset.length).toBeGreaterThanOrEqual(4)
  })
})
