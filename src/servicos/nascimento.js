//
// ONDE O JOGADOR ENCOSTA O PÉ — política de nascimento, num lugar só.
//
// Esta política já esteve copiada em três lugares do componente e divergiu, e
// cada divergência custou uma rodada: o jogador nasceu enterrado na montanha,
// depois nasceu EM CIMA da copa das árvores, depois numa caverna. Unificar
// dentro do `.vue` resolveu a divergência mas deixou 142 linhas de regra pura
// num arquivo de 4.629 — onde ninguém as testa sem subir navegador.
//
// Aqui elas são função de dado. O leitor de blocos entra por parâmetro, como
// `visitarCelula` já fazia, e o teste consegue montar uma coluna à mão:
// floresta, caverna, montanha, camada de neve. Nenhuma delas exige um mundo.
//
// ⚠️ AS TRÊS ARMADILHAS QUE ESTA POLÍTICA EXISTE PRA EVITAR, e que voltam se
// alguém "simplificar" o arquivo:
//
//  1. `surfaceY` CONTA ÁRVORE. Ele devolve o primeiro sólido de cima pra baixo,
//     e folha e tronco são sólidos — numa floresta ele devolve a COPA. Piso de
//     busca calculado a partir dele fica seis blocos acima da terra.
//  2. ESPESSURA DO QUE ESTÁ SOB O PÉ NÃO DISTINGUE COPA DE CHÃO. Crosta fina de
//     caverna dá 1 a 5 blocos com ar embaixo, igualzinho a uma copa. Quem
//     responde é a CHAVE do bloco sob o pé, e nada mais. Errei por aqui duas
//     vezes seguidas: primeiro "consertei" cinco sementes que estavam certas,
//     depois li crosta de caverna como copa.
//  3. QUANDO A PRÓPRIA COLUNA É UMA ÁRVORE não existe pouso nenhum nela —
//     "sólido embaixo e dois de ar" não acontece dentro de um tronco. Descer
//     mais não resolve; o que resolve é andar de lado.

//
// ── UM EXPERIMENTO REVERTIDO, PARA NINGUÉM REPETIR ─────────────────────────
//
// NASCER COM CÉU ABERTO: TENTADO E REVERTIDO EM 2026-08-23 (vivia no `.vue`).
//
// Depois de consertar o nascimento subterrâneo (o `piso` relativo à superfície,
// logo abaixo), sobrou um incômodo menor: em floresta densa o jogador nasce no
// chão certo mas com a copa colada na lente — semente 2024, meio-dia, brilho
// médio 30 de 255.
//
// Tentei resolver com uma espiral que procurava, num raio de 10, uma coluna com
// chão de verdade, céu aberto e poucos vizinhos na altura dos olhos. Duas
// versões, dois problemas, os dois pegos pelo harness de nascimento:
//
//  1. Reusei o teto/piso da coluna do jogador pra julgar as vizinhas. Onde o
//     relevo sobe isso enterra o jogador — a semente 312193 passou a nascer em
//     y=65 com a superfície em 72.
//  2. Corrigido isso, a espiral trocou "cara na folha" por "cara na parede": a
//     semente 2024 foi parar encostada num paredão. O critério de vizinhança
//     olha ±1 bloco, e com 78° de campo um paredão a dois blocos ainda enche o
//     quadro.
//
// O que eu estava otimizando era o BRILHO MÉDIO, que é um proxy — e ele
// melhorou nas duas vezes enquanto o enquadramento piorava. Escolher um bom
// primeiro quadro é problema de composição, não de um escalar, e não se resolve
// bem com um limiar. Fica registrado como incômodo conhecido: nascer de frente
// pra uma árvore é feio, nascer dentro da montanha era o defeito — e esse está
// consertado e coberto por teste.

/** Uma folha não é chão de verdade: quem pousa nela está em cima da árvore. */
export function chaoDeVerdade(chaveEm, x, y, z) {
  return !/Leaves$/.test(chaveEm(x, y, z) || '')
}

/** O jogador está apoiado em folha ou tronco, e não em terra? */
export function apoiadoEmArvore(chaveEm, x, y, z) {
  const key = chaveEm(Math.floor(x), Math.floor(y) - 1, Math.floor(z)) || ''
  return /(Leaves|Log)$/.test(key)
}

/**
 * Altura do SOLO na coluna, atravessando a árvore.
 *
 * Desce no máximo 26 blocos: cobre a árvore mais alta do gerador com folga, e
 * devolve o topo original se não achar terra — coluna estranha não vira chute.
 */
export function topoDoSolo(chaveEm, x, z, top) {
  if (!Number.isFinite(top)) return top
  const bx = Math.floor(x)
  const bz = Math.floor(z)
  const limite = Math.max(1, Math.floor(top) - 26)
  for (let y = Math.floor(top) - 1; y >= limite; y--) {
    const key = chaveEm(bx, y, bz) || ''
    if (!key || key === 'air') continue // ar entre a copa e o chão
    if (/(Leaves|Log)$/.test(key)) continue // a árvore em si
    return y + 1
  }
  return top
}

/**
 * Vizinhas em ordem de distância, raio 3.
 *
 * A ORDEM é a regra: a primeira que serve é a escolhida, então ela tem que ser
 * a mais perto possível do ponto de origem. Sem a ordenação, "andar de lado"
 * vira "teleportar três blocos pro canto do quadrado".
 */
export const VIZINHAS = (() => {
  const l = []
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) if (dx || dz) l.push([dx, dz])
  }
  return l.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]))
})()

/**
 * Pouso numa coluna específica.
 *
 * ⚠️ O PISO É RELATIVO AO SOLO, NÃO AO `surfaceY`. Com o piso em `copa - 6` a
 * busca com filtro de folha não alcança a terra, a busca sem filtro aceita a
 * copa, e o jogador abre o jogo em cima das árvores.
 *
 * Seis blocos de tolerância absorvem saliência e degrau sem deixar a busca cair
 * na caverna. E se nada servir com o filtro de folha, é melhor nascer em cima
 * de uma árvore do que dentro da terra: por isso a segunda tentativa repete sem
 * o filtro antes de recorrer ao `safeSpawn`.
 */
export function pousoNaColuna(deps, x, z, tetoExtra, tetoPadrao) {
  const { solidAt, surfaceY, chaveEm, landingSpot, safeSpawn } = deps
  const top = surfaceY(Math.floor(x), Math.floor(z))
  const solo = Number.isFinite(top) ? Math.floor(topoDoSolo(chaveEm, x, z, top)) : null
  const piso = solo === null ? 1 : Math.max(1, solo - 6)
  const teto = Number.isFinite(top) ? top + tetoExtra : tetoPadrao
  const safe =
    landingSpot(solidAt, x, z, teto, piso, (bx, by, bz) => chaoDeVerdade(chaveEm, bx, by, bz)) ||
    landingSpot(solidAt, x, z, teto, piso) ||
    safeSpawn(solidAt, Math.floor(x) + 0.5, Math.floor(z) + 0.5, piso)
  return { top, solo, safe }
}

/**
 * O pouso final, já tratando o caso da coluna que é uma árvore.
 *
 * A busca lateral roda SÓ quando o defeito está presente. Uma busca que roda
 * sempre é uma busca que pode piorar os 23 de 25 nascimentos que já estavam
 * certos — foi assim que a tentativa de "nascer com céu aberto" se perdeu em
 * agosto: ela mexia em todo mundo pra melhorar uma média.
 *
 * A vizinha ainda precisa estar na mesma altura do terreno (±4 do solo da
 * coluna de origem), senão trocar de coluna vira cair num buraco ou subir num
 * paredão.
 */
export function chaoParaNascer(deps, x, z, tetoExtra = 0, tetoPadrao = 100) {
  const r = pousoNaColuna(deps, x, z, tetoExtra, tetoPadrao)
  if (!r.safe || !apoiadoEmArvore(deps.chaveEm, r.safe.x, r.safe.y, r.safe.z)) return r
  for (const [dx, dz] of VIZINHAS) {
    const v = pousoNaColuna(deps, x + dx, z + dz, tetoExtra, tetoPadrao)
    if (!v.safe || apoiadoEmArvore(deps.chaveEm, v.safe.x, v.safe.y, v.safe.z)) continue
    if (r.solo !== null && Math.abs(v.safe.y - r.solo) > 4) continue
    return v
  }
  return r
}

/**
 * Poe o jogador no ponto de nascimento e devolve pra onde ele olha.
 *
 * ⚠️ AS TRES VELOCIDADES VAO A ZERO, e isso nao e higiene.
 *
 * O objeto do jogador sobrevive a "recomecar em outro mundo": sem zerar,
 * a queda que ele estava levando no mundo anterior continua no novo -- ele
 * nasce ja caindo, leva dano de uma queda que nunca aconteceu ali, e no pior
 * caso atravessa o chao antes de o chunk existir.
 *
 * Yaw e pitch SAIM em vez de serem escritos: eles nao moram no objeto do
 * jogador (sao `let` do componente, porque a camera os move todo quadro), e
 * fingir que moram aqui criaria duas verdades sobre pra onde se olha.
 *
 * ⚠️ `|| 0` E NAO `?? 0`, e eu troquei DEPOIS de medir. Escrevi `??` primeiro,
 * pensando em preservar um yaw salvo de zero -- mas zero e falso e as duas
 * formas devolvem zero pra ele. Onde elas diferem e num save corrompido: `??`
 * deixa um NaN passar direto pra camera, e uma camera com angulo NaN nao
 * desenha nada. Nenhum yaw legitimo e perdido por `||`, e um invalido e.
 */
export function pousarJogador(jogador, ponto) {
  jogador.x = ponto.x
  jogador.y = ponto.y
  jogador.z = ponto.z
  jogador.vx = 0
  jogador.vy = 0
  jogador.vz = 0
  return { yaw: ponto.yaw || 0, pitch: ponto.pitch || 0 }
}
