import { describe, it, expect } from 'vitest'
import {
  createMob,
  stepMob,
  mobDrops,
  shouldDespawn,
  MOB_TYPES,
  DESPAWN_DIST,
  DESPAWN_DIST_PASSIVO,
} from '../../src/servicos/mobs.js'

/**
 * O CORPO OBEDECE AO QUE A IA MANDA?
 *
 * `mobModelo.spec.js` prova que o modelo olha pra +Z. Isso só serve se o `yaw`
 * que chega nele apontar pro lugar certo — e é aqui que se afirma isso, no lado
 * puro, sem three e sem render.
 *
 * O defeito que motivou o arquivo: `mob.yaw` só era atualizado quando o bicho
 * ANDAVA. Ao entrar no alcance de ataque o passo zera de propósito (ele para
 * pra bater), então o yaw congelava no último rumo — o zumbi te batia virado
 * pro lado. Olhar e andar viraram coisas separadas.
 */

const chao = (y) => y < 64
const env = (px, pz) => ({
  solidAt: (x, y) => chao(y),
  lightAt: () => 0,
  isDay: false,
  skyExposed: () => false,
  player: { x: px, y: 64, z: pz },
})

/** Roda `n` passos de 1/20 s e devolve o mob. */
function rodar(mob, e, n = 40, dt = 0.05) {
  for (let i = 0; i < n; i++) stepMob(mob, e, dt)
  return mob
}

/** Direção pra onde o mob olha, na convenção dele: yaw 0 = +Z. */
const olhar = (mob) => ({ x: Math.sin(mob.yaw), z: Math.cos(mob.yaw) })

/** Cosseno do ângulo entre pra onde ele olha e pra onde está o alvo. */
function encarando(mob, alvoX, alvoZ) {
  const o = olhar(mob)
  const dx = alvoX - mob.x
  const dz = alvoZ - mob.z
  const d = Math.hypot(dx, dz) || 1
  return o.x * (dx / d) + o.z * (dz / d)
}

describe('roquecraft - o hostil encara o alvo', () => {
  it.each(['zombie', 'skeleton', 'spider'])('%s: persegue olhando pra frente', (tipo) => {
    const m = createMob(tipo, 0, 64, 0, 1)
    // jogador a 8 blocos no +X: dentro do aggro, fora do alcance de ataque
    rodar(m, env(8, 0), 10)
    expect(encarando(m, 8, 0), `${tipo} não encara o alvo ao perseguir`).toBeGreaterThan(0.95)
  })

  /*
   * O CASO DO DEFEITO. Dentro do alcance o mob para de andar pra bater. Antes,
   * parar de andar era parar de virar: ele chegava, congelava o rumo do último
   * passo e desferia o golpe de perfil.
   */
  it.each(['zombie', 'skeleton', 'spider'])('%s: encara enquanto ATACA, parado', (tipo) => {
    const def = MOB_TYPES[tipo]
    // nasce já colado no jogador, e o jogador está atrás dele (−Z)
    const m = createMob(tipo, 0, 64, 0, 1)
    m.yaw = 0 // olhando pra +Z, de costas pro alvo
    const alvoZ = -(def.range * 0.6)
    const eventos = []
    for (let i = 0; i < 20; i++) eventos.push(...stepMob(m, env(0, alvoZ), 0.05))
    expect(eventos, 'o teste não chegou a exercitar o ataque').toContain('attack')
    expect(encarando(m, 0, alvoZ), `${tipo} ataca de costas`).toBeGreaterThan(0.95)
  })

  it('o passivo que foge olha pra onde está fugindo, não pro perseguidor', () => {
    const m = createMob('pig', 0, 64, 0, 1)
    m.state = 'flee'
    m.timer = 4
    rodar(m, env(6, 0), 10)
    // fugindo do jogador em +X, ele corre pra −X e é pra lá que olha
    expect(encarando(m, 6, 0), 'o porco foge olhando pra trás').toBeLessThan(-0.9)
  })
})

describe('roquecraft - yaw é rumo, e é sempre um número', () => {
  it('yaw 0 significa olhar para +Z, a mesma frente do modelo', () => {
    const m = createMob('pig', 0, 64, 0, 1)
    m.yaw = 0
    const o = olhar(m)
    expect(o.z).toBeCloseTo(1, 6)
    expect(o.x).toBeCloseTo(0, 6)
  })

  /*
   * `rotation.y = NaN` faz o three descartar a matriz e o bicho SOME da tela,
   * sem erro no console. O guard está no renderizador, mas a origem tem que ser
   * limpa também: nenhum passo de IA pode produzir yaw não-finito.
   */
  it('nenhum passo de IA produz yaw não-finito', () => {
    for (const tipo of Object.keys(MOB_TYPES)) {
      const m = createMob(tipo, 0, 64, 0, 7)
      for (let i = 0; i < 200; i++) {
        stepMob(m, env(Math.sin(i) * 9, Math.cos(i) * 9), 0.05)
        expect(Number.isFinite(m.yaw), `${tipo} produziu yaw ${m.yaw} no passo ${i}`).toBe(true)
      }
    }
  })

  it('bicho parado mantém o rumo em vez de zerar', () => {
    const m = createMob('cow', 0, 64, 0, 3)
    m.yaw = 1.9
    m.state = 'idle'
    m.timer = 99
    rodar(m, { ...env(50, 50), player: null }, 5)
    expect(m.yaw).toBeCloseTo(1.9, 6)
  })
})

describe('roquecraft — andar de verdade e sumir de longe', () => {
  it('a animação de caminhada só avança quando o corpo ANDA', () => {
    // ⚠️ `moved = moved || mx !== 0` invertido troca a resposta: quem andou
    // reporta parado, e quem está parado reporta que andou. `mob.anim` é o que
    // o render lê para mover as pernas — invertido, o zumbi persegue deslizando
    // e gesticula parado.
    // ⚠️ A PERSEGUIÇÃO É EM DIAGONAL de propósito. Num eixo só, o outro passo é
    // zero, e a própria inversão (`mz === 0`) daria verdadeiro por acidente: o
    // teste passaria com o defeito no lugar. Andando nos dois eixos, nenhuma
    // das duas comparações invertidas salva o mutante.
    const andando = createMob('zombie', 0, 64, 0, 7)
    rodar(andando, env(10, 10), 10)
    expect(andando.anim).toBeGreaterThan(0)
    expect(Math.hypot(andando.x, andando.z)).toBeGreaterThan(0.1)
    expect(Math.abs(andando.x)).toBeGreaterThan(0.01)
    expect(Math.abs(andando.z)).toBeGreaterThan(0.01)

    // Encurralado entre paredes: a IA manda andar, o corpo não sai do lugar.
    const preso = createMob('zombie', 0, 64, 0, 7)
    preso.anim = 5
    const paredes = {
      solidAt: (x, y) => y < 64 || true,
      lightAt: () => 0,
      isDay: false,
      skyExposed: () => false,
      player: { x: 10, y: 64, z: 0 },
    }
    for (let i = 0; i < 10; i++) stepMob(preso, paredes, 0.05)
    expect(preso.anim).toBeLessThan(5)
  })

  it('criatura EXATAMENTE no limite de sumiço ainda existe', () => {
    // `Math.hypot(...) > limite` afrouxado para `>=` some com a criatura parada
    // na linha exata do limite. Não é caso de borda inventado: o limite é uma
    // distância fixa e o bicho que persegue o jogador a atravessa devagar,
    // ficando nela por vários quadros.
    const jogador = { x: 0, y: 64, z: 0 }
    const noLimite = createMob('zombie', DESPAWN_DIST, 64, 0, 1)
    expect(shouldDespawn(noLimite, jogador)).toBe(false)

    const umPassoAlem = createMob('zombie', DESPAWN_DIST + 0.001, 64, 0, 1)
    expect(shouldDespawn(umPassoAlem, jogador)).toBe(true)
  })

  it('o passivo aguenta muito mais longe, e o domesticado nunca some', () => {
    const jogador = { x: 0, y: 64, z: 0 }
    expect(shouldDespawn(createMob('pig', DESPAWN_DIST_PASSIVO, 64, 0, 1), jogador)).toBe(false)
    expect(shouldDespawn(createMob('pig', DESPAWN_DIST_PASSIVO + 0.001, 64, 0, 1), jogador)).toBe(
      true,
    )

    const bicho = createMob('pig', 10000, 64, 0, 1)
    bicho.domestica = true
    expect(shouldDespawn(bicho, jogador)).toBe(false)
  })

  it('sorteio de zero itens não vira pilha vazia no chão', () => {
    // `if (n > 0)` afrouxado para `>=` empurra `{ count: 0 }` pro mundo: uma
    // pilha de zero item, que a interface desenha e o jogador não consegue pegar.
    const zumbi = createMob('zombie', 0, 64, 0, 1)
    const drops = mobDrops(zumbi, () => 0)
    expect(drops.every((d) => d.count > 0)).toBe(true)
  })
})
