// RoqueCraft - ruído determinístico (base de TODA a geração de mundo).
//
// Nada aqui usa `Math.random`: a mesma seed produz o mesmo mundo em qualquer
// máquina, que é o que permite o multiplayer trafegar só a seed + os diffs de
// bloco em vez do mundo inteiro.
//
// Fornece: PRNG mulberry32, hash inteiro, Perlin melhorado 2D/3D (com a curva
// de suavização de 5ª ordem do Perlin 2002, sem a descontinuidade de derivada
// segunda do fade cúbico) e os empilhamentos fbm / ridged / billow.

// PRNG de 32 bits, rápido e com boa distribuição. Retorna [0,1).
export function mulberry32(seed) {
  let a = seed | 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Hash inteiro 3D → [0,1). Usado onde não vale montar um Perlin (veios de
// minério, sorteio de árvore, variação por bloco).
export function hash3(x, y, z, seed) {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) ^ (seed | 0)
  h = Math.imul(h ^ (h >>> 16), 668265261)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

export const hash2 = (x, z, seed) => hash3(x, 0, z, seed)

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t

// Gradientes 3D do Perlin melhorado (arestas do cubo).
function grad3(hash, x, y, z) {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return (h & 1 ? -u : u) + (h & 2 ? -v : v)
}

// Um gerador Perlin com tabela de permutação embaralhada pela seed. Instanciar
// UMA vez por mundo e reutilizar (montar a tabela custa mais que amostrar).
export function createPerlin(seed) {
  const rnd = mulberry32(seed)
  const p = new Uint8Array(512)
  const perm = new Uint8Array(256)
  for (let i = 0; i < 256; i++) perm[i] = i
  // Fisher-Yates com o PRNG seedado
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = perm[i]
    perm[i] = perm[j]
    perm[j] = t
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255]

  // Perlin 3D em [-1,1].
  function noise3(x, y, z) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    const Z = Math.floor(z) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    z -= Math.floor(z)
    const u = fade(x)
    const v = fade(y)
    const w = fade(z)
    const A = p[X] + Y
    const AA = p[A] + Z
    const AB = p[A + 1] + Z
    const B = p[X + 1] + Y
    const BA = p[B] + Z
    const BB = p[B + 1] + Z
    return lerp(
      lerp(
        lerp(grad3(p[AA], x, y, z), grad3(p[BA], x - 1, y, z), u),
        lerp(grad3(p[AB], x, y - 1, z), grad3(p[BB], x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad3(p[AA + 1], x, y, z - 1), grad3(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad3(p[AB + 1], x, y - 1, z - 1), grad3(p[BB + 1], x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    )
  }

  // Perlin 2D em [-1,1] (fatia y=0 do 3D, com offset pra não cair no plano de
  // gradiente zero do Perlin - que daria uma faixa reta no meio do mapa).
  const noise2 = (x, z) => noise3(x, 0.317, z)

  return { noise2, noise3 }
}

// fbm: soma de oitavas com frequência dobrando e amplitude caindo. Normalizado
// pra [-1,1] independente do número de oitavas.
export function fbm2(perlin, x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += perlin.noise2(x * freq, z * freq) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

export function fbm3(perlin, x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += perlin.noise3(x * freq, y * freq, z * freq) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

// ridged: |noise| invertido - cria CRISTAS afiadas em vez de colinas suaves. É
// o que dá cordilheira de montanha com aresta, e não pudim.
export function ridged2(perlin, x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(perlin.noise2(x * freq, z * freq))
    sum += n * n * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return (sum / norm) * 2 - 1
}

// Interpolação suave usada nas máscaras de bioma (transição sem costura dura).
export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
