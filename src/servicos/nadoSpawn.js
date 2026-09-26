import { MOB_TYPES, MOB_KEYS, pontoNoAnel } from './mobs.js'

/**
 * ONDE NASCE A VIDA MARINHA.
 *
 * ⚠️ REGRA PRÓPRIA, E É O PONTO INTEIRO.
 *
 * `pickSpawn` (terra) recusa explicitamente célula com líquido — foi a correção
 * que tirou zumbi e aranha do fundo do mar, depois do relato do founder em
 * 25/08/2026. Peixe quer EXATAMENTE a condição que aquele teste recusa.
 *
 * Espremer as duas numa função só significaria um booleano `aquatico` cortando
 * o corpo dela ao meio, e a próxima regra de terra que alguém acrescentasse
 * valeria pro peixe por omissão. Duas perguntas opostas, duas funções.
 *
 * O comentário em `mobs.js` já prometia isto; aqui está.
 */
export const AQUATICOS = MOB_KEYS.filter((k) => MOB_TYPES[k].aquatico)

/** Quantos blocos de água a coluna precisa ter pra caber um cardume. */
const LAMINA_MINIMA = 4

export function pickSpawnAquatico(env, rnd = Math.random) {
  if (!AQUATICOS.length) return null
  const { x, z } = pontoNoAnel(env.player, rnd)
  // ⚠️ `surfaceY` DEVOLVE A PRIMEIRA CÉLULA NÃO-SÓLIDA, ou seja o CHÃO — que no
  // oceano é o LEITO, e não a superfície da água. O nome engana, e eu caí nele.
  //
  // A primeira versão varria a coluna DE CIMA PRA BAIXO a partir de
  // `surfaceY + 2`, achando que estava começando no ar acima das ondas. Estava
  // começando dois blocos acima do leito: a lâmina medida dava dois ou três
  // blocos em todo lugar, nunca alcançava o mínimo, e a função devolvia `null`
  // SEMPRE. Nenhum peixe nasceu jamais.
  //
  // E o teste de unidade não pegou, porque o cenário dele devolvia `surfaceY`
  // como o topo da água — o mesmo mal-entendido, escrito duas vezes. Foi a
  // sonda no mundo de verdade que acusou: contando os bichos marinhos vivos, o
  // único que aparecia tinha nascido pelo sorteio de TERRA.
  const fundo = env.surfaceY?.(x, z)
  if (fundo == null || fundo < 1) return null
  if (!env.liquidAt?.(x, fundo, z)) return null // não é fundo de mar

  // A coluna sobe a partir do leito enquanto houver líquido.
  //
  // ⚠️ NÃO BASTA "a célula é água". Uma poça de um bloco satisfaz isso e um
  // cardume nela fica com o dorso de fora, batendo no teto e no chão ao mesmo
  // tempo. Peixe precisa de COLUNA, e é ela que esta busca mede.
  let topo = fundo
  while (topo < fundo + 48 && env.liquidAt?.(x, topo + 1, z)) topo++
  const lamina = topo - fundo + 1
  if (lamina < LAMINA_MINIMA) return null

  // Nasce no MEIO da lâmina, longe do teto e do leito.
  const y = fundo + Math.max(1, Math.floor(lamina / 2))
  if (!env.liquidAt?.(x, y, z)) return null

  const biome = env.biomeAt?.(x, z)
  const pool = AQUATICOS.filter((k) => {
    const d = MOB_TYPES[k]
    if (d.laminaMinima && lamina < d.laminaMinima) return false
    return !d.spawnBiomes || !biome || d.spawnBiomes.includes(biome)
  })
  if (!pool.length) return null
  const type = pool[Math.floor(rnd() * pool.length)]

  // CARDUME: peixe nasce em grupo, e é o grupo que faz a água parecer viva. Um
  // peixe sozinho num oceano é um detalhe que ninguém encontra.
  const quantos = MOB_TYPES[type].cardume ? 3 + Math.floor(rnd() * 4) : 1
  const grupo = []
  for (let i = 0; i < quantos; i++) {
    const ox = x + 0.5 + (rnd() - 0.5) * 3
    const oz = z + 0.5 + (rnd() - 0.5) * 3
    const oy = y + (rnd() - 0.5) * Math.min(3, lamina - 2)
    if (!env.liquidAt?.(Math.floor(ox), Math.floor(oy), Math.floor(oz))) continue
    grupo.push({ type, x: ox, y: oy, z: oz })
  }
  return grupo.length ? grupo : null
}
