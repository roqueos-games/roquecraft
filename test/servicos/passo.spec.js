import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  criarCaminhada,
  avancarCaminhada,
  balancoDaCamera,
  METROS_POR_PASSO,
  recortarPasso,
} from '../../src/servicos/passo.js'

/**
 * A CAMINHADA: cadência, estabilidade e sincronia.
 *
 * Duas queixas do founder em 2026-08-23: "na areia dá passo mesmo eu parado" e
 * "na grama demora demais entre um passo e outro". Medido no jogo antes de
 * mexer: 0,667 s e 3,13 m entre passos, em todos os materiais.
 *
 * O passo parado eu NÃO consegui reproduzir em cinco bancadas (pista seca,
 * manche de toque real no iPhone, areia seca, beira d'água e areia submersa).
 * Por isso a correção não persegue um caso: ela troca velocidade por
 * DESLOCAMENTO REAL, e sem deslocamento não existe passo — não importa o que a
 * velocidade diga.
 */

/** Anda `metros` em passos de `dt` a `vel` m/s, devolvendo quantas passadas. */
function caminhar(c, metros, vel, dt) {
  let restante = metros
  let passos = 0
  let tempo = 0
  while (restante > 1e-9) {
    const d = Math.min(restante, vel * dt)
    passos += avancarCaminhada(c, d, dt, true)
    restante -= d
    tempo += dt
  }
  return { passos, tempo }
}

describe('roquecraft - cadência do passo', () => {
  /*
   * O NÚMERO DA QUEIXA. A 4,7 m/s (velocidade de caminhada do jogo) o intervalo
   * medido era 0,667 s. Um humano nessa velocidade pisa a cada ~0,32 s.
   */
  it('a 4,7 m/s o intervalo fica entre 0,30 e 0,38 s', () => {
    const c = criarCaminhada()
    const { passos, tempo } = caminhar(c, 47, 4.7, 1 / 60)
    const intervalo = tempo / passos
    expect(intervalo).toBeGreaterThan(0.3)
    expect(intervalo).toBeLessThan(0.38)
  })

  it('andar devagar dá menos passos que andar rápido, no mesmo tempo', () => {
    const lento = criarCaminhada()
    const rapido = criarCaminhada()
    const a = caminhar(lento, 10, 1.5, 1 / 60)
    const b = caminhar(rapido, 30, 4.5, 1 / 60)
    expect(a.tempo).toBeCloseTo(b.tempo, 1)
    expect(a.passos).toBeLessThan(b.passos)
  })

  /*
   * ⚠️ A CADÊNCIA NÃO PODE DEPENDER DO FRAME RATE.
   *
   * O acumulador antigo ZERAVA ao disparar, jogando fora o excesso do último
   * quadro. Medido: 2,15 m por passada a 60 fps e 3,13 m a ~5 fps — o ritmo do
   * jogo mudava conforme a máquina engasgava, e no celular do founder isso é
   * o tempo todo. Subtrair o limiar em vez de zerar resolve.
   */
  it.each([
    ['60 fps', 1 / 60],
    ['30 fps', 1 / 30],
    ['12 fps', 1 / 12],
    ['6 fps', 1 / 6],
  ])('a mesma distância dá o mesmo número de passos a %s', (_nome, dt) => {
    const c = criarCaminhada()
    const { passos } = caminhar(c, 60, 4.7, dt)
    // 60 m / 1,5 m por passada = 40, com no máximo uma de folga na borda
    expect(Math.abs(passos - 60 / METROS_POR_PASSO)).toBeLessThanOrEqual(1)
  })
})

describe('roquecraft - parado não dá passo', () => {
  it('deslocamento zero não dispara nada, por mais tempo que passe', () => {
    const c = criarCaminhada()
    let passos = 0
    for (let i = 0; i < 600; i++) passos += avancarCaminhada(c, 0, 1 / 60, true)
    expect(passos).toBe(0)
  })

  /*
   * O CASO QUE MOTIVOU A TROCA. Física oscilando, manche encostado ou pé preso
   * num muro davam VELOCIDADE sem tirar o jogador do lugar — e o portão antigo
   * era `veloc > 0.9`, com o input só normalizado acima de 1, então qualquer
   * resíduo de analógico caía justo em cima da fronteira.
   */
  it('tremer no lugar não vira caminhada', () => {
    const c = criarCaminhada()
    let passos = 0
    // 3 mm por quadro pra frente e pra trás: velocidade instantânea de 0,18 m/s
    for (let i = 0; i < 600; i++) passos += avancarCaminhada(c, 0.003, 1 / 60, true)
    expect(passos).toBe(0)
  })

  it('no ar não dá passo, mesmo percorrendo distância', () => {
    const c = criarCaminhada()
    let passos = 0
    for (let i = 0; i < 300; i++) passos += avancarCaminhada(c, 4.7 / 60, 1 / 60, false)
    expect(passos).toBe(0)
  })

  it('distância não-finita não quebra nem dispara', () => {
    const c = criarCaminhada()
    expect(avancarCaminhada(c, NaN, 1 / 60, true)).toBe(0)
    expect(Number.isFinite(c.fase)).toBe(true)
  })
})

describe('roquecraft - a câmera e o som são a mesma coisa', () => {
  /*
   * O PEDIDO DO FOUNDER: "dar a sensação de andar movimentando a câmera e
   * sincronizando com o som". Sincronia aqui não é ajuste fino, é construção:
   * o mesmo `fase` que vira a passada é o que desenha o balanço. Este teste
   * fixa isso — no quadro em que o passo dispara, a câmera está no ponto baixo.
   */
  it('no quadro da passada a cabeça está no ponto mais baixo', () => {
    const c = criarCaminhada()
    const dt = 1 / 240 // fino, pra pegar o quadro exato
    const passo = 4.7 * dt
    let achou = 0
    let fundo = 0
    for (let i = 0; i < 4000; i++) {
      const virou = avancarCaminhada(c, passo, dt, true)
      const y = balancoDaCamera(c).y
      fundo = Math.min(fundo, y)
      if (virou > 0 && c.intensidade > 0.9) {
        achou++
        // no instante da passada, |cos(fase)| ≈ 1 → y no extremo negativo
        expect(y).toBeLessThan(fundo * 0.9)
      }
    }
    expect(achou, 'o teste não chegou a exercitar nenhuma passada').toBeGreaterThan(5)
  })

  it('parado a câmera fica parada', () => {
    const c = criarCaminhada()
    caminhar(c, 20, 4.7, 1 / 60)
    expect(Math.abs(balancoDaCamera(c).y)).toBeGreaterThan(0.01)
    // parou de andar: em meio segundo o balanço tem que ter ido embora
    for (let i = 0; i < 30; i++) avancarCaminhada(c, 0, 1 / 60, true)
    const b = balancoDaCamera(c)
    expect(Math.abs(b.y)).toBeLessThan(0.001)
    expect(Math.abs(b.x)).toBeLessThan(0.001)
    expect(Math.abs(b.rolagem)).toBeLessThan(0.001)
  })

  it('o balanço entra e sai suave, sem salto', () => {
    const c = criarCaminhada()
    let anterior = balancoDaCamera(c).y
    let maiorSalto = 0
    for (let i = 0; i < 200; i++) {
      avancarCaminhada(c, 4.7 / 60, 1 / 60, true)
      const y = balancoDaCamera(c).y
      maiorSalto = Math.max(maiorSalto, Math.abs(y - anterior))
      anterior = y
    }
    // um salto grande num quadro é o solavanco que dá enjoo
    expect(maiorSalto).toBeLessThan(0.02)
  })

  it('o balanço lateral completa um ciclo a cada DUAS passadas', () => {
    // o peso alterna de perna: se x fechasse o ciclo em uma passada, o corpo
    // penderia sempre pro mesmo lado.
    const c = criarCaminhada()
    const dt = 1 / 240
    c.intensidade = 1
    const xs = []
    let passos = 0
    while (passos < 2) {
      passos += avancarCaminhada(c, 4.7 * dt, dt, true)
      xs.push(balancoDaCamera(c).x)
    }
    expect(Math.min(...xs)).toBeLessThan(-0.01)
    expect(Math.max(...xs)).toBeGreaterThan(0.01)
  })
})

describe('roquecraft - o balanço é desligável', () => {
  /*
   * Balanço de câmera provoca enjoo em parte das pessoas. Um efeito de imersão
   * que passa mal não é opcional de luxo, é acessibilidade — e a preferência
   * some fácil num refactor se ninguém estiver olhando.
   *
   * Lê o componente como TEXTO: importá-lo aqui traria três.js, canvas e o
   * mundo inteiro pra afirmar uma linha de condição.
   */
  const fonte = readFileSync(resolve(__dirname, '../../src/JogoRoqueCraft.vue'), 'utf8')

  it('o laço de render consulta a preferência antes de balançar', () => {
    expect(fonte).toMatch(/settings\.viewBob === false \? null : balancoDaCamera\(/)
  })

  it('a preferência tem padrão, é lida do save e chega na tela de pausa', () => {
    expect(fonte, 'sem padrão').toMatch(/viewBob: true/)
    // ⚠️ A LEITURA DO SAVE MUDOU DE ENDEREÇO EM 26/08 - e o guard foi ATRÁS
    // dela. A regra saiu de dentro de `boot` pra `services/roquecraft/ajustes.js`,
    // onde ela ganhou teste próprio (inclusive o caso que este guard vigia: o
    // `!== false`, pra save antigo sem o campo não abrir com o balanço
    // desligado).
    const ajustes = readFileSync(resolve(__dirname, '../../src/servicos/ajustes.js'), 'utf8')
    expect(ajustes, 'não é lida do save').toMatch(/ajustes\.viewBob = s\.viewBob !== false/)
    expect(fonte, 'o componente parou de aplicar os ajustes do save').toMatch(/aplicarAjustes\(/)
    const pausa = readFileSync(resolve(__dirname, '../../src/componentes/RCPause.vue'), 'utf8')
    expect(pausa, 'sem interruptor na tela de pausa').toMatch(/local\.viewBob/)
  })
})

describe('passo — as três condições de "não está andando"', () => {
  it('cada condição sozinha já para o balanço', () => {
    // `!noChao || !Number.isFinite(andou) || vel < PARADO_M_POR_S` virando `&&`
    // só para quando as TRÊS valem ao mesmo tempo: no ar, com distância NaN, e
    // devagar. Na prática o balanço da câmera nunca mais para — o jogador
    // parado fica com a tela subindo e descendo.
    const noAr = criarCaminhada()
    noAr.intensidade = 1
    expect(avancarCaminhada(noAr, 1, 0.1, false)).toBe(0)
    expect(noAr.intensidade).toBeLessThan(1)

    const distanciaTorta = criarCaminhada()
    distanciaTorta.intensidade = 1
    expect(avancarCaminhada(distanciaTorta, NaN, 0.1, true)).toBe(0)
    expect(distanciaTorta.intensidade).toBeLessThan(1)

    const devagar = criarCaminhada()
    devagar.intensidade = 1
    expect(avancarCaminhada(devagar, 0.001, 0.1, true)).toBe(0)
    expect(devagar.intensidade).toBeLessThan(1)
  })

  it('parar NÃO zera a fase — senão a câmera salta ao encostar num muro', () => {
    const c = criarCaminhada()
    avancarCaminhada(c, 2, 0.1, true)
    const faseAndando = c.fase
    avancarCaminhada(c, 0, 0.1, true)
    expect(c.fase).toBe(faseAndando)
  })

  it('intensidade ZERO não desenha balanço nenhum', () => {
    // `k <= 0` apertado para `<`: com intensidade exatamente zero — que é o
    // estado de quem está PARADO — o balanço passa a ser calculado mesmo assim,
    // e como `Math.cos(fase)` não é zero, a câmera fica deslocada no repouso.
    const c = criarCaminhada()
    c.intensidade = 0
    c.fase = 1.234
    expect(balancoDaCamera(c)).toEqual({ x: 0, y: 0, rolagem: 0 })
    expect(balancoDaCamera(c, 5)).toEqual({ x: 0, y: 0, rolagem: 0 })
  })

  it('amplitude zero também é repouso', () => {
    const c = criarCaminhada()
    c.intensidade = 1
    c.fase = 1.234
    expect(balancoDaCamera(c, 0)).toEqual({ x: 0, y: 0, rolagem: 0 })
  })
})

describe('passo — recorte do som', () => {
  const canal = (n) => [Float32Array.from({ length: n }, () => 1)]

  it('som mais curto que o teto não é recortado', () => {
    // `canais[0].length <= n` apertado para `<`: um som com EXATAMENTE a
    // duração máxima passa a ser recortado e ganha um fade que não precisava.
    const taxa = 1000
    const durMax = 0.5
    const n = Math.floor(durMax * taxa) // 500
    expect(recortarPasso(canal(n), taxa, durMax)).toBeNull()
    expect(recortarPasso(canal(n + 1), taxa, durMax)).not.toBeNull()
  })

  it('taxa inválida não recorta nada', () => {
    // Taxa zero levaria a `n = 0`, e `src.slice(0, 0)` é um som VAZIO — o passo
    // ficaria mudo. NaN e Infinity atravessam qualquer comparação e precisam do
    // `Number.isInteger`.
    expect(recortarPasso(canal(9999), 0)).toBeNull()
    expect(recortarPasso(canal(9999), -5)).toBeNull()
    expect(recortarPasso(canal(9999), NaN)).toBeNull()
    expect(recortarPasso(canal(9999), Infinity)).toBeNull()
    expect(recortarPasso([], 1000)).toBeNull()
  })

  it('o recorte termina em silêncio, não em corte seco', () => {
    const taxa = 1000
    const recortado = recortarPasso(canal(2000), taxa, 0.5)
    expect(recortado[0]).toHaveLength(500)
    expect(recortado[0][0]).toBe(1)
    expect(recortado[0][499]).toBeLessThan(0.2)
  })
})
