/**
 * Auditoria da malha VIVA: toda face que as regras mandam desenhar existe como
 * geometria na cena, e toda geometria na cena tem bloco que a justifique?
 *
 * ⚠️ ESTE É O INSTRUMENTO QUE ACHOU O DEFEITO QUE IMPEDIA O FOUNDER DE JOGAR.
 * O mesher já estava provado em teste de unidade (bloco isolado emite as 6
 * faces, mundo inteiro percorrido não perde nenhuma), mas o teste roda o
 * pipeline INLINE e o jogo roda em WORKER, com chunk chegando fora de ordem,
 * descarregando atrás do jogador e voltando. É nessa diferença que morava o
 * relato: "entro num mapa todo quebrado, com um monte de blocos sem faces".
 *
 * ⚠️ E ELE SÓ ACHOU DEPOIS DE APRENDER A CONTAR SOBRA. A primeira versão só
 * contava BURACO (face que falta) e reportou zero por três rodadas seguidas com
 * o defeito na tela, porque o defeito era o oposto: 1.035 faces desenhadas em
 * células de AR, restos do mundo anterior. Instrumento que só sabe procurar o
 * que falta é cego para o que sobra.
 *
 * ⚠️ ESCOPO: usa o MESMO `faceVisible` do mesher, então não julga a REGRA,
 * julga se a geometria que a regra pede chegou à cena. Erro dentro de
 * `faceVisible` passa por aqui e é pego pelos testes de unidade, que afirmam o
 * resultado esperado à mão.
 *
 * Serviço e não composable: não guarda estado nem ciclo de vida, recebe o mundo
 * e o motor por parâmetro e devolve um relatório.
 */

import { AIR, BLOCKS } from './blocks.js'
import { EH_FORMA_LIVRE } from './formas.js'
import { WORLD_HEIGHT } from './constants.js'
import { faceVisible } from './mesher.js'

export function auditarMalhaViva({ engine, world, player, raio = 24 }) {
  if (!engine || !world) return null
  const DIRS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  const NOMES = ['+x', '-x', '+y', '-y', '+z', '-z']
  // 1. Indexa TODA célula coberta por TODO quad que está na cena.
  const faces = new Set()
  for (const entry of engine.sectionMeshes.values()) {
    for (const mesh of Object.values(entry)) {
      if (!mesh) continue
      const pos = mesh.geometry.getAttribute('position')
      const nor = mesh.geometry.getAttribute('normal')
      if (!pos || !nor) continue
      const comp = (i, k) => (k === 0 ? pos.getX(i) : k === 1 ? pos.getY(i) : pos.getZ(i))
      for (let q = 0; q * 4 < pos.count; q++) {
        const i0 = q * 4
        const n = [Math.sign(nor.getX(i0)), Math.sign(nor.getY(i0)), Math.sign(nor.getZ(i0))]
        const eixo = n.findIndex((c) => c !== 0)
        if (eixo < 0) continue
        const f = DIRS.findIndex((d) => d.every((c, k) => c === n[k]))
        if (f < 0) continue
        // ⚠️ O plano NÃO cai em inteiro para laje nem para a lâmina d'água: o
        // topo da neve fica em y+0,125 e o da água em y+0,9. Arredondar
        // atribuiria essas faces ao bloco DE BAIXO. A face positiva pertence ao
        // bloco cujo teto ela é (ceil−1); a negativa, ao bloco cujo piso ela é.
        const plano = comp(i0, eixo)
        const base = n[eixo] > 0 ? Math.ceil(plano - 1e-4) - 1 : Math.floor(plano + 1e-4)
        const outros = [0, 1, 2].filter((k) => k !== eixo)
        const faixa = outros.map((k) => {
          const vals = [0, 1, 2, 3].map((j) => comp(i0 + j, k))
          // no eixo vertical a lateral de uma laje mede 1/8: arredondar zeraria
          // o intervalo e a face sumiria do índice
          return [Math.floor(Math.min(...vals) + 1e-4), Math.ceil(Math.max(...vals) - 1e-4)]
        })
        for (let a = faixa[0][0]; a < faixa[0][1]; a++)
          for (let b = faixa[1][0]; b < faixa[1][1]; b++) {
            const c = [0, 0, 0]
            c[eixo] = base
            c[outros[0]] = a
            c[outros[1]] = b
            faces.add(`${c[0]},${c[1]},${c[2]},${f}`)
          }
      }
    }
  }
  // 2. Varre o mundo em volta do jogador procurando face que devia existir.
  const px = Math.floor(player.x)
  const py = Math.floor(player.y)
  const pz = Math.floor(player.z)
  const porDirecao = { '+x': 0, '-x': 0, '+y': 0, '-y': 0, '+z': 0, '-z': 0 }
  const porBloco = {}
  const exemplos = []
  let examinados = 0
  const y0 = Math.max(1, py - 24)
  const y1 = Math.min(WORLD_HEIGHT - 2, py + 24)
  for (let x = px - raio; x <= px + raio; x++)
    for (let z = pz - raio; z <= pz + raio; z++) {
      // só onde o mundo em volta é conhecido: borda de carregamento não tem
      // com que comparar
      if (!world.isLoaded(x, z)) continue
      if (!world.isLoaded(x - 1, z) || !world.isLoaded(x + 1, z)) continue
      if (!world.isLoaded(x, z - 1) || !world.isLoaded(x, z + 1)) continue
      for (let y = y0; y <= y1; y++) {
        const id = world.getBlock(x, y, z)
        if (id === AIR) continue
        const def = BLOCKS[id]
        // planta em cruz não tem face por direção: geometria própria
        if (!def || def.plant || def.cross) continue
        examinados++
        for (let f = 0; f < 6; f++) {
          const [dx, dy, dz] = DIRS[f]
          if (!faceVisible(id, world.getBlock(x + dx, y + dy, z + dz))) continue
          if (faces.has(`${x},${y},${z},${f}`)) continue
          porDirecao[NOMES[f]]++
          porBloco[def.key] = (porBloco[def.key] || 0) + 1
          if (exemplos.length < 20) exemplos.push(`${def.key} ${NOMES[f]} (${x},${y},${z})`)
        }
      }
    }
  const total = Object.values(porDirecao).reduce((a, b) => a + b, 0)

  // ── 3. O CONTRÁRIO: FACE DESENHADA QUE O MUNDO NÃO JUSTIFICA ────────────
  //
  // "eu entro em um mapa todo quebrado com um monte de blocos sem faces,
  // coisas voando e etc" — founder, 25/08/2026.
  //
  // São DUAS queixas, e esta auditoria só sabia ver uma. "Bloco sem face" é
  // buraco, e é o que a varredura acima procura — e ela vinha dando ZERO, o
  // que me deixou três rodadas sem entender o relato.
  //
  // "Coisa voando" é o oposto: um quad que continua na cena depois de o bloco
  // dele deixar de existir, ou de o vizinho ter passado a tapá-lo. Malha
  // velha que ninguém invalidou. Nenhum contador de buraco enxerga isso,
  // porque não falta nada — SOBRA.
  const sobrasPorBloco = {}
  const exemplosDeSobra = []
  let sobras = 0
  for (const chave of faces) {
    const [sx, sy, sz, sf] = chave.split(',').map(Number)
    if (Math.abs(sx - px) > raio || Math.abs(sz - pz) > raio) continue
    if (sy < y0 || sy > y1) continue
    if (!world.isLoaded(sx, sz)) continue
    const id = world.getBlock(sx, sy, sz)
    const def = BLOCKS[id]
    // Forma livre e planta não seguem o modelo de seis faces: os quads delas
    // não caem em plano de célula e acusariam sobra sempre.
    if (id !== AIR && (!def || def.plant || def.cross || EH_FORMA_LIVRE[id] === 1)) continue
    const [dx, dy, dz] = DIRS[sf]
    const legitima = id !== AIR && faceVisible(id, world.getBlock(sx + dx, sy + dy, sz + dz))
    if (legitima) continue
    sobras++
    const nome = id === AIR ? 'ar' : def?.key || String(id)
    sobrasPorBloco[nome] = (sobrasPorBloco[nome] || 0) + 1
    if (exemplosDeSobra.length < 20) {
      exemplosDeSobra.push(`${nome} ${NOMES[sf]} (${sx},${sy},${sz})`)
    }
  }

  return {
    pos: { x: px, y: py, z: pz },
    quads: faces.size,
    secoes: engine.sectionMeshes.size,
    examinados,
    buracos: total,
    porDirecao,
    porBloco,
    exemplos,
    sobras,
    sobrasPorBloco,
    exemplosDeSobra,
  }
}
