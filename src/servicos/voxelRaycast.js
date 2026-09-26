// RoqueCraft - raycast de voxel (Amanatides & Woo / DDA).
//
// Convenção de CANTO: o bloco (x,y,z) ocupa [x,x+1]³. O voxel que contém um
// ponto é `Math.floor(p)`. (A versão antiga usava voxel centrado no inteiro,
// que dava meio bloco de erro ao mirar em superfície rasante.)
//
// Devolve o primeiro bloco atingido, a normal da face, a célula VAZIA anterior
// (onde um bloco novo vai) e o ponto exato do impacto - o ponto é usado pelas
// partículas de quebra e pelo som de passo por material.

/**
 * `caixasAt(x,y,z)` é OPCIONAL e é o que faz a mira enxergar a FORMA.
 *
 * Sem ele, uma célula sólida é atingida inteira — e mirar na metade vazia
 * acima de uma laje, ou no vão de uma escada, acerta o bloco como se fosse
 * cubo. Passa quase despercebido na laje e vira incômodo de verdade na escada:
 * o jogador tenta colocar um bloco no degrau e coloca em cima da escada.
 *
 * Com ele, o raio é testado contra cada caixa da célula, e a face devolvida é a
 * face da CAIXA, não a da célula. Devolve uma lista `[[x0,y0,z0,x1,y1,z1],...]`
 * em fração de bloco, ou `null` pra célula de forma simples — nesse caso o
 * caminho antigo vale, e não se paga nada por forma que não existe.
 */
export function raycastVoxel(origin, dir, isSolid, maxDist = 6, caixasAt = null) {
  let ix = Math.floor(origin.x)
  let iy = Math.floor(origin.y)
  let iz = Math.floor(origin.z)

  const sx = Math.sign(dir.x)
  const sy = Math.sign(dir.y)
  const sz = Math.sign(dir.z)

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity

  // distância (em t) da origem até a primeira fronteira de cada eixo
  const border = (o, i, s) => {
    if (s > 0) return i + 1 - o
    if (s < 0) return o - i
    return Infinity
  }
  let tMaxX = dir.x !== 0 ? border(origin.x, ix, sx) / Math.abs(dir.x) : Infinity
  let tMaxY = dir.y !== 0 ? border(origin.y, iy, sy) / Math.abs(dir.y) : Infinity
  let tMaxZ = dir.z !== 0 ? border(origin.z, iz, sz) / Math.abs(dir.z) : Infinity

  let nx = 0
  let ny = 0
  let nz = 0
  let t = 0

  // Um passo do DDA. Virou função porque a mira por forma precisa avançar do
  // MEIO do laço quando o raio raspa no vazio de uma célula — e duplicar o
  // passo seria duplicar a única parte do algoritmo que não pode divergir.
  // Devolve false quando o próximo passo já passou do alcance.
  const avancar = () => {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) return false
      ix += sx
      t = tMaxX
      tMaxX += tDeltaX
      nx = -sx
      ny = 0
      nz = 0
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) return false
      iy += sy
      t = tMaxY
      tMaxY += tDeltaY
      nx = 0
      ny = -sy
      nz = 0
    } else {
      if (tMaxZ > maxDist) return false
      iz += sz
      t = tMaxZ
      tMaxZ += tDeltaZ
      nx = 0
      ny = 0
      nz = -sz
    }
    return true
  }

  // A origem dentro de um sólido é ignorada (a câmera enfiada num bloco não
  // deve quebrar o bloco onde ela está).
  for (let step = 0; step < 512; step++) {
    if (t > 0 && isSolid(ix, iy, iz)) {
      const caixas = caixasAt ? caixasAt(ix, iy, iz) : null
      if (caixas && !(caixas.length === 1 && ehCubo(caixas[0]))) {
        const bate = contraCaixas(origin, dir, ix, iy, iz, caixas, maxDist)
        if (!bate) {
          // O raio passou RASPANDO pelo vazio da célula. Segue andando: o
          // alvo é o próximo bloco, não este.
          avancar()
          continue
        }
        return {
          hit: { x: ix, y: iy, z: iz },
          normal: { x: bate.nx, y: bate.ny, z: bate.nz },
          place: { x: ix + bate.nx, y: iy + bate.ny, z: iz + bate.nz },
          point: {
            x: origin.x + dir.x * bate.t,
            y: origin.y + dir.y * bate.t,
            z: origin.z + dir.z * bate.t,
          },
          distance: bate.t,
        }
      }
      return {
        hit: { x: ix, y: iy, z: iz },
        normal: { x: nx, y: ny, z: nz },
        place: { x: ix + nx, y: iy + ny, z: iz + nz },
        point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
        distance: t,
      }
    }
    if (!avancar()) break
  }
  return null
}

// Célula de forma simples: o caminho antigo vale e não se paga box math por
// forma que não existe. É o caso de praticamente todo bloco do mundo.
function ehCubo(c) {
  return c[0] === 0 && c[1] === 0 && c[2] === 0 && c[3] === 1 && c[4] === 1 && c[5] === 1
}

/**
 * Raio contra a lista de caixas de UMA célula. Devolve `{t, nx, ny, nz}` da
 * caixa atingida mais perto, ou null se o raio passou pelo vazio.
 *
 * Método das fatias: para cada eixo, o intervalo de `t` em que o raio está
 * dentro da caixa; a interseção dos três é o trecho dentro dela. A face de
 * entrada é o eixo cuja fatia começou por ÚLTIMO — é ele que segurou a entrada.
 */
function contraCaixas(origin, dir, ix, iy, iz, caixas, maxDist) {
  const o = [origin.x - ix, origin.y - iy, origin.z - iz]
  const d = [dir.x, dir.y, dir.z]
  let melhor = null
  for (const c of caixas) {
    let tEntra = 0
    let tSai = maxDist
    let eixo = -1
    let sinal = 0
    let vazio = false
    for (let e = 0; e < 3; e++) {
      const lo = c[e]
      const hi = c[e + 3]
      if (Math.abs(d[e]) < 1e-12) {
        if (o[e] < lo || o[e] > hi) {
          vazio = true
          break
        }
        continue
      }
      let t1 = (lo - o[e]) / d[e]
      let t2 = (hi - o[e]) / d[e]
      let s = -1
      if (t1 > t2) {
        const tmp = t1
        t1 = t2
        t2 = tmp
        s = 1
      }
      if (t1 > tEntra) {
        tEntra = t1
        eixo = e
        sinal = s
      }
      if (t2 < tSai) tSai = t2
      if (tEntra > tSai) {
        vazio = true
        break
      }
    }
    if (vazio || tEntra <= 0 || tEntra > maxDist) continue
    if (!melhor || tEntra < melhor.t) {
      melhor = {
        t: tEntra,
        nx: eixo === 0 ? sinal : 0,
        ny: eixo === 1 ? sinal : 0,
        nz: eixo === 2 ? sinal : 0,
      }
    }
  }
  return melhor
}

// Qual FACE de um bloco o ponto de impacto tocou (0..5, ordem canônica)?
// Usado pra orientar tocha/fornalha e escolher a textura da partícula.
/**
 * Altura do ponto de impacto DENTRO da celula, em 0..1.
 *
 * ⚠️ `pontoY - floor(pontoY)` ERRA NO TETO: bater exatamente em y=70.0 vindo de
 * cima e o TOPO da celula 69, nao o piso da 70, e a conta ingenua devolve 0 --
 * o oposto do que o jogador viu. Quem chama passa a face junto justamente pra
 * nao depender disto nos casos horizontais, mas a funcao ainda precisa nao
 * mentir quando o ponto cai redondo.
 *
 * Isto morava DUAS VEZES, identica, em `laje.js` e `escada.js` -- e a copia da
 * escada ate apontava pra da laje pelo motivo. Duas copias da mesma conta e o
 * dia em que a laje e a escada discordam sobre o MESMO clique.
 */
export function alturaNaCelula(pontoY) {
  if (!Number.isFinite(pontoY)) return 0
  const f = pontoY - Math.floor(pontoY)
  return f === 0 ? 1 : f
}

export function faceFromNormal(n) {
  if (n.x > 0) return 0
  if (n.x < 0) return 1
  if (n.y > 0) return 2
  if (n.y < 0) return 3
  if (n.z > 0) return 4
  return 5
}
