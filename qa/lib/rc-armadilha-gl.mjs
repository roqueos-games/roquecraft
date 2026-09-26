//
// ARMADILHA DE WEBGL — transforma erro anônimo de console em pilha com nome.
//
// O console do navegador reporta `INVALID_OPERATION: texImage3D: FLIP_Y or
// PREMULTIPLY_ALPHA isn't allowed` sem uma linha de JavaScript sequer: o erro
// nasce dentro do driver, não do código. Duas rodadas foram gastas LENDO o
// jogo atrás do culpado — `DataArrayTexture` nasce com `flipY = false`, o
// three seta o pixelStorei a partir de `texture.flipY` antes de cada upload,
// e não existe uma atribuição de `flipY` no jogo inteiro. Pela leitura, o
// erro é impossível. Ele acontece.
//
// Então a armadilha embrulha as duas funções que podem cometer a infração e,
// quando o estado de unpack estiver ligado NA HORA da chamada, guarda a pilha
// de quem chamou.
//
// PROVA DE VIDA: ela conta também as chamadas LIMPAS. Uma armadilha que só
// sabe devolver "nenhuma infração" não prova nada — se `limpas` vier 0 ela não
// interceptou coisa alguma, e o verde é mentira, não resultado.

/** Instala a armadilha ANTES de qualquer script da página. */
export async function instalarArmadilhaGL(page) {
  await page.addInitScript(() => {
    window.__gl = { infracoes: [], limpas: 0 }
    const G = window.WebGL2RenderingContext?.prototype
    if (!G) return
    for (const nome of ['texImage3D', 'texSubImage3D']) {
      const orig = G[nome]
      if (!orig) continue
      G[nome] = function (...args) {
        const flip = this.getParameter(this.UNPACK_FLIP_Y_WEBGL)
        const pre = this.getParameter(this.UNPACK_PREMULTIPLY_ALPHA_WEBGL)
        if (flip || pre) {
          window.__gl.infracoes.push({
            fn: nome,
            flip: !!flip,
            pre: !!pre,
            pilha: (new Error().stack || '').split('\n').slice(1, 10).join(' | '),
          })
        } else {
          window.__gl.limpas++
        }
        return orig.apply(this, args)
      }
    }
  })
}

/** Colhe o que a armadilha viu nesta página. */
export async function colherArmadilhaGL(page) {
  try {
    return await page.evaluate(() => window.__gl || { infracoes: [], limpas: 0 })
  } catch {
    return { infracoes: [], limpas: 0, erroAoColher: true }
  }
}
