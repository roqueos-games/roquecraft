// RoqueCraft - ciclo dia/noite.
//
// O tempo vive em TICKS 0..24000 (0 = amanhecer, 6000 = meio-dia, 12000 =
// entardecer, 18000 = meia-noite), a mesma escala do gênero, com um dia
// completo em 20 minutos reais.
//
// Este módulo é a fonte única de: direção e cor do sol, cor do céu (zênite e
// horizonte), cor e densidade da névoa, intensidade da luz ambiente, opacidade
// das estrelas e fase da lua. O renderizador só LÊ daqui - assim o céu, a
// névoa, a luz direcional e o multiplicador de skylight do shader nunca saem de
// sincronia (o defeito clássico: céu noturno com chão iluminado de dia).
//
// Puro: sem three, sem DOM.

export const TICKS_PER_DAY = 24000
export const DAY_SECONDS = 1200 // 20 minutos por ciclo completo
export const TICKS_PER_SECOND = TICKS_PER_DAY / DAY_SECONDS

export const DAWN = 0
export const NOON = 6000
export const DUSK = 12000
export const MIDNIGHT = 18000

const lerp = (a, b, t) => a + (b - a) * t
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (t) => t * t * (3 - 2 * t)

export const normalizeTicks = (t) => ((t % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY

export function advanceTime(ticks, dtSeconds, speed = 1) {
  return normalizeTicks(ticks + dtSeconds * TICKS_PER_SECOND * speed)
}

// Ângulo do sol: 0 no amanhecer (nascente), π/2 ao meio-dia (zênite), π no
// poente. Devolve um vetor unitário APONTANDO DO SOL PRA CENA invertido, isto
// é, a posição do sol normalizada.
export function sunDirection(ticks) {
  const t = normalizeTicks(ticks)
  // t=0 amanhecer (sol no horizonte a leste) · t=6000 zênite · t=18000 nadir
  const angle = ((t - DAWN) / TICKS_PER_DAY) * Math.PI * 2
  // uma leve inclinação no eixo z evita sol nascendo exatamente no plano xz,
  // o que deixaria as sombras perfeitamente alinhadas com a grade de blocos
  return {
    x: Math.cos(angle) * 0.94,
    y: Math.sin(angle),
    z: Math.cos(angle) * 0.34,
  }
}

export const moonDirection = (ticks) => {
  const s = sunDirection(ticks)
  return { x: -s.x, y: -s.y, z: -s.z }
}

// 1 = pleno dia, 0 = noite fechada. A transição é curta (crepúsculo de ~1500
// ticks de cada lado), como no jogo original.
export function dayFactor(ticks) {
  const h = sunDirection(ticks).y
  return clamp01(smooth(clamp01((h + 0.16) / 0.34)))
}

// Multiplicador do SKYLIGHT no shader. Nunca zera: a noite de lua cheia tem uma
// luz azulada suave, senão o mundo vira breu e o jogo fica injogável.
export function skyLightFactor(ticks) {
  // Piso 0.50, nao 0.09: com 0.09 o chao a noite media rgb(16,16,18) - o print
  // do QA era um ceu estrelado bonito sobre um retangulo PRETO, e o jogo ficava
  // injogavel de noite (QA de 2026-08-19). A caverna continua escura porque la
  // o skylight do voxel e ZERO, e zero vezes qualquer piso e zero.
  return 0.5 + dayFactor(ticks) * 0.5
}

// Fase da lua 0..7 (0 = cheia). Muda a cada dia.
export const moonPhase = (ticks) => Math.floor(normalizeTicks(ticks) / TICKS_PER_DAY) % 8
export const dayNumber = (totalTicks) => Math.floor(totalTicks / TICKS_PER_DAY)

// Paleta por momento do dia. Cores lineares (0..1), aplicadas antes do tone
// mapping - por isso os valores do meio-dia passam de 1 em alguns canais.
const PALETTE = [
  // t,      zênite,               horizonte,            sol,                 névoa
  [0, [0.05, 0.07, 0.16], [0.36, 0.24, 0.28], [0.9, 0.42, 0.22], [0.24, 0.21, 0.28]], // pré-alvorada
  [1200, [0.16, 0.28, 0.55], [0.98, 0.55, 0.32], [1.0, 0.58, 0.3], [0.72, 0.55, 0.46]], // nascer
  [3200, [0.24, 0.48, 0.86], [0.72, 0.85, 0.98], [1.0, 0.94, 0.82], [0.74, 0.85, 0.96]], // manhã
  [6000, [0.2, 0.45, 0.92], [0.66, 0.83, 1.0], [1.0, 0.97, 0.9], [0.72, 0.85, 1.0]], // meio-dia
  [9800, [0.24, 0.46, 0.84], [0.82, 0.8, 0.9], [1.0, 0.88, 0.7], [0.78, 0.8, 0.9]], // tarde
  [11600, [0.2, 0.24, 0.5], [1.0, 0.5, 0.25], [1.0, 0.44, 0.2], [0.7, 0.44, 0.36]], // pôr do sol
  [13400, [0.05, 0.07, 0.2], [0.22, 0.16, 0.3], [0.5, 0.25, 0.3], [0.16, 0.16, 0.26]], // crepúsculo
  [18000, [0.015, 0.02, 0.07], [0.05, 0.07, 0.16], [0.5, 0.58, 0.8], [0.05, 0.07, 0.14]], // meia-noite
  [22400, [0.04, 0.05, 0.14], [0.18, 0.15, 0.26], [0.7, 0.5, 0.5], [0.12, 0.13, 0.22]], // madrugada
  [24000, [0.05, 0.07, 0.16], [0.36, 0.24, 0.28], [0.9, 0.42, 0.22], [0.24, 0.21, 0.28]],
]

export function skyPalette(ticks) {
  const t = normalizeTicks(ticks)
  let i = 0
  while (i < PALETTE.length - 2 && PALETTE[i + 1][0] <= t) i++
  const a = PALETTE[i]
  const b = PALETTE[i + 1]
  const f = smooth(clamp01((t - a[0]) / (b[0] - a[0] || 1)))
  return {
    zenith: lerp3(a[1], b[1], f),
    horizon: lerp3(a[2], b[2], f),
    sun: lerp3(a[3], b[3], f),
    fog: lerp3(a[4], b[4], f),
  }
}

// Intensidade da luz direcional (sol de dia, lua de noite) e da ambiente.
export function lightRig(ticks) {
  const d = dayFactor(ticks)
  const sun = sunDirection(ticks)
  const night = 1 - d
  return {
    // sol forte de dia; à noite a direcional vira a LUA (fraca e azul)
    directional: {
      dir: sun.y > -0.05 ? sun : moonDirection(ticks),
      // Escala calibrada por MEDICAO de pixel (scripts de QA), nao no olho:
      // o three divide a irradiancia por PI no BRDF de Lambert, entao 1.0 aqui
      // vale ~0.32 na tela. Com 2.05 e ambiente 0.4 o tronco de carvalho sob a
      // copa media rgb(29,28,24) - preto. Ver .claude/dev-docs/roquecraft-v2.md.
      intensity: d * 3.0 + night * 0.8,
      color: d > 0.02 ? skyPalette(ticks).sun : [0.55, 0.66, 1.0],
      isMoon: sun.y <= -0.05,
    },
    // ~PI vezes o valor "intuitivo": e o fator que o BRDF de Lambert do three
    // tira do termo indireto. E o ambiente que decide se a SOMBRA tem cor ou
    // se e um buraco preto.
    // Calibrado no QA por medicao: com 2.75 a sombra projetada das arvores
    // SUMIA (o ambiente afogava o sol) e com 0.4 o tronco sob a copa ia a
    // preto. 1.5 ao meio-dia deixa a sombra visivel e a face sombreada legivel.
    // Sobe A NOITE, nao de dia: com sol zerado, o ambiente e praticamente a
    // unica luz, entao ele precisa pesar mais - de dia ele so afogaria a sombra.
    ambient: 1.7 - d * 0.2,
    // névoa mais densa de madrugada (a bruma que dá profundidade ao amanhecer)
    fogDensity: 1 + night * 0.55,
    // Estrelas seguem o FATOR DE DIA, não a altura do sol: às 17h30 o sol já
    // está baixo mas o céu ainda é claro - estrela aparecendo ali denuncia o
    // truque. Só surgem quando o crepúsculo de fato acaba.
    stars: clamp01((0.3 - d) / 0.3),
    exposure: 0.95 + d * 0.3,
  }
}

// É noite pra fins de spawn de monstro?
export const isNight = (ticks) => dayFactor(ticks) < 0.25

// Hora legível pro HUD (00:00 = meia-noite).
export function clockLabel(ticks) {
  const t = normalizeTicks(ticks)
  const hours = Math.floor(((t / TICKS_PER_DAY) * 24 + 6) % 24)
  const mins = Math.floor((((t / TICKS_PER_DAY) * 24 + 6) % 1) * 60)
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}
