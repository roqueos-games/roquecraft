// A RÉGUA DO QA DE ORIENTAÇÃO. Fica separada do harness porque tem que rodar
// sozinha sobre um PNG já gravado — foi assim que consegui comparar o "antes" e
// o "depois" sem reconstruir o bundle duas vezes por ajuste de recorte.
//
// A primeira régua contava verde acima e abaixo da linha média do RECORTE, e
// deu "OK" nas duas rodadas: com a planta invertida a folhagem desce pelo bloco
// inteiro e cai dos dois lados da linha. Recorte fixo não sabe onde o objeto
// está — só sabe onde a moldura está.
//
// Esta normaliza pelo objeto: acha a caixa dos pixels que interessam e mede o
// CENTRO DE MASSA dentro dela, em 0..1 do topo pra base da caixa. Aí a pergunta
// vira geométrica e independente do enquadramento: "a folhagem pesa no pé ou na
// ponta desta planta?".
import fs from 'node:fs'
import { createRequire } from 'node:module'

const { PNG } = createRequire(import.meta.url)('pngjs')

const folha = (r, g, b) => g > r + 14 && g > b + 14 && g > 45
const ceu = (r, g, b) => b > r + 8 && b >= g && b > 120

/**
 * Centro de massa vertical de `alvo`, normalizado pela caixa de `caixa`.
 * `0` = topo da caixa, `1` = base. Ambos os testes recebem (r,g,b).
 */
function centroDeMassa(png, [x0, y0, x1, y1], alvo, caixa = alvo) {
  const W = png.width
  let yMin = Infinity
  let yMax = -Infinity
  let soma = 0
  let n = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p = (y * W + x) * 4
      const [r, g, b] = [png.data[p], png.data[p + 1], png.data[p + 2]]
      if (caixa(r, g, b)) {
        if (y < yMin) yMin = y
        if (y > yMax) yMax = y
      }
      if (alvo(r, g, b)) {
        soma += y
        n++
      }
    }
  const altura = yMax - yMin
  return {
    n,
    caixa: Number.isFinite(yMin) ? { yMin, yMax } : null,
    centro: n && altura > 4 ? +((soma / n - yMin) / altura).toFixed(3) : null,
  }
}

/**
 * Lê a cena do harness e devolve os dois veredictos.
 *
 * A câmera fica na altura do pé do mato: a moita ocupa a faixa logo acima do
 * centro do quadro e a parede de terra a faixa logo abaixo.
 */
export function medir(arquivo) {
  const png = PNG.sync.read(fs.readFileSync(arquivo))
  const W = png.width
  const H = png.height
  const faixa = (a, b) => [
    Math.round(W * 0.3),
    Math.round(H * a),
    Math.round(W * 0.72),
    Math.round(H * b),
  ]

  // MOITA: caixa e massa são a mesma coisa — a própria folhagem, contra o céu.
  // Mato afina pra cima, então o centro de massa fica na METADE DE BAIXO da
  // própria planta.
  const moita = centroDeMassa(png, faixa(0.28, 0.52), folha)

  // PAREDE: aqui centro de massa não serve. A parede tem quatro blocos e só o
  // de cima é grama, então a franja fica na METADE DE CIMA do recorte esteja ela
  // certa ou invertida — foi assim que a primeira régua deu "OK" nas duas
  // rodadas. O que separa os dois casos é a DISTÂNCIA entre o topo da parede e o
  // começo da franja, medida na própria altura da franja: a franja ocupa 30% do
  // tile, então "colada no topo" é ~0 e "no rodapé do mesmo bloco" é ~2,3.
  const parede = distanciaDoTopo(png, faixa(0.5, 0.82))

  return {
    moita,
    parede,
    veredito: {
      moita:
        moita.n < 3000 || moita.centro == null
          ? 'SEM DADO'
          : moita.centro > 0.55
            ? 'OK'
            : 'INVERTIDO',
      parede:
        parede.n < 3000 || parede.recuo == null
          ? 'SEM DADO'
          : parede.recuo < 1
            ? 'OK'
            : 'INVERTIDO',
    },
  }
}

/**
 * Recuo da franja verde a partir do topo da parede, contado em alturas da
 * própria franja.
 */
function distanciaDoTopo(png, [x0, y0, x1, y1]) {
  const W = png.width
  let topoParede = Infinity
  let topoVerde = Infinity
  let baseVerde = -Infinity
  let n = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p = (y * W + x) * 4
      const [r, g, b] = [png.data[p], png.data[p + 1], png.data[p + 2]]
      if (!ceu(r, g, b) && y < topoParede) topoParede = y
      if (!folha(r, g, b)) continue
      n++
      if (y < topoVerde) topoVerde = y
      if (y > baseVerde) baseVerde = y
    }
  const altura = baseVerde - topoVerde
  return {
    n,
    topoParede: Number.isFinite(topoParede) ? topoParede : null,
    franja: Number.isFinite(topoVerde) ? { topo: topoVerde, base: baseVerde } : null,
    recuo: n && altura > 4 ? +((topoVerde - topoParede) / altura).toFixed(2) : null,
  }
}

// `node scripts/lib/qa-orientacao.mjs <png...>` mede prints já gravados.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of process.argv.slice(2)) {
    console.log(f.split('/').pop(), JSON.stringify(medir(f)))
  }
}
