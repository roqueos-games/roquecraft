import { describe, it, expect } from 'vitest'
import {
  criarCamera,
  seguirAltura,
  impactoDeQueda,
  trancoDeDano,
  avancarCamera,
  deslocamentoY,
  rolagemTotal,
  poseDaCamera,
  mudouOFov,
  assentarCamera,
  orbitaDoMenu,
  ORBITA,
  PASSO_MINIMO_DE_FOV,
  TAU_DEGRAU,
  MAX_DEGRAU,
  FOV_CORRIDA,
  ROLAGEM_LATERAL,
  IMPACTO_MAX,
  TORCAO_DANO,
} from '../../src/servicos/camera.js'
import { AUTO_STEP_HEIGHT } from '../../src/servicos/physics.js'

// O founder pediu (2026-08-23): "melhore a animação da câmera ao andar e subir
// em um bloco sem pular e também melhore as animações gerais da câmera".
//
// Subir sem pular é o caso duro: `degrau()` na física escreve `pos.y = alvoY`,
// um teleporte de até 1,2 bloco em um frame. A câmera lia isso direto.
//
// O que se afirma aqui é AMORTECIMENTO, e amortecimento tem duas armadilhas
// clássicas: depender do frame rate e explodir num frame longo. As duas têm
// teste.

const rodar = (cam, segundos, dt, entrada) => {
  for (let t = 0; t < segundos - 1e-9; t += dt) avancarCamera(cam, dt, entrada)
  return cam
}

describe('roquecraft - a câmera alcança o corpo depois do degrau', () => {
  it('subir um bloco andando deixa o olho para trás, não teleporta', () => {
    const cam = criarCamera()
    seguirAltura(cam, 64, true)
    seguirAltura(cam, 65, true) // degrau automático de 1 bloco
    // no instante do degrau o olho ainda está ~1 bloco abaixo do corpo
    expect(deslocamentoY(cam)).toBeCloseTo(-1, 2)
  })

  it('e alcança em ~0,1 s, sem passar do ponto', () => {
    const cam = criarCamera()
    seguirAltura(cam, 64, true)
    seguirAltura(cam, 65, true)
    rodar(cam, TAU_DEGRAU, 1 / 120)
    // uma constante de tempo = 63% do caminho
    expect(deslocamentoY(cam)).toBeGreaterThan(-0.4)
    expect(deslocamentoY(cam)).toBeLessThan(-0.3)
    rodar(cam, 0.6, 1 / 120)
    expect(Math.abs(deslocamentoY(cam))).toBeLessThan(0.001)
    // decaimento exponencial não ultrapassa o zero: subir não pode dar solavanco
    expect(deslocamentoY(cam)).toBeLessThanOrEqual(0)
  })

  it('pular NÃO é amortecido: no ar o olho acompanha o corpo', () => {
    const cam = criarCamera()
    seguirAltura(cam, 64, true)
    seguirAltura(cam, 65.2, false) // saiu do chão
    expect(deslocamentoY(cam)).toBe(0)
  })

  it('cair NÃO é amortecido', () => {
    const cam = criarCamera()
    seguirAltura(cam, 70, false)
    seguirAltura(cam, 66, false)
    expect(deslocamentoY(cam)).toBe(0)
  })

  it('ondulação de terreno abaixo do limiar não conta como degrau', () => {
    const cam = criarCamera()
    seguirAltura(cam, 64, true)
    seguirAltura(cam, 64.02, true)
    expect(deslocamentoY(cam)).toBe(0)
  })

  it('teleporte (respawn, resgate) não é amortecido', () => {
    // Um salto maior que o degrau automático não é degrau: é outro lugar.
    const cam = criarCamera()
    seguirAltura(cam, 64, true)
    seguirAltura(cam, 100, true)
    expect(deslocamentoY(cam)).toBe(0)
  })

  it('dois degraus seguidos não afundam a câmera no chão', () => {
    const cam = criarCamera()
    seguirAltura(cam, 64, true)
    seguirAltura(cam, 65, true)
    seguirAltura(cam, 66, true)
    expect(deslocamentoY(cam)).toBeGreaterThanOrEqual(-MAX_DEGRAU)
    expect(deslocamentoY(cam)).toBeGreaterThanOrEqual(-1.3)
  })

  it('o limite de degrau acompanha a física, não é número solto', () => {
    expect(MAX_DEGRAU).toBeGreaterThanOrEqual(AUTO_STEP_HEIGHT)
  })
})

describe('roquecraft - baque de aterrissagem', () => {
  it('a queda maior baixa mais a cabeça', () => {
    const curta = impactoDeQueda(criarCamera(), 1)
    const longa = impactoDeQueda(criarCamera(), 6)
    expect(longa).toBeLessThan(curta)
    expect(curta).toBeLessThan(0)
  })

  it('tem teto: despencar de 100 blocos não joga a câmera pro subsolo', () => {
    const cam = criarCamera()
    impactoDeQueda(cam, 100)
    expect(deslocamentoY(cam)).toBeGreaterThanOrEqual(-IMPACTO_MAX)
  })

  it('volta ao repouso em menos de meio segundo', () => {
    const cam = criarCamera()
    impactoDeQueda(cam, 5)
    rodar(cam, 0.5, 1 / 120)
    expect(Math.abs(deslocamentoY(cam))).toBeLessThan(0.01)
  })

  it('a mola sobe de volta antes de assentar (tem repique, não é só um degrau)', () => {
    const cam = criarCamera()
    impactoDeQueda(cam, 8)
    let acima = false
    for (let i = 0; i < 60; i++) {
      avancarCamera(cam, 1 / 120)
      if (deslocamentoY(cam) > 0.001) acima = true
    }
    expect(acima, 'sem repique o pouso parece um corte, não um baque').toBe(true)
  })

  it('⚠️ um frame engasgado NÃO explode a mola', () => {
    // Com Euler explícito e passo de frame inteiro, k·dt² passa de 1 e a mola
    // diverge — a câmera sai do mundo depois de um travamento. O sub-passo fixo
    // é o que impede isso, e é isto que este teste guarda.
    const cam = criarCamera()
    impactoDeQueda(cam, 10)
    for (let i = 0; i < 20; i++) avancarCamera(cam, 0.1) // 20 frames de 10 fps
    expect(Number.isFinite(deslocamentoY(cam))).toBe(true)
    expect(Math.abs(deslocamentoY(cam))).toBeLessThan(0.05)
  })

  it('o baque é o mesmo a 30 e a 240 fps', () => {
    const a = criarCamera()
    const b = criarCamera()
    impactoDeQueda(a, 4)
    impactoDeQueda(b, 4)
    rodar(a, 0.2, 1 / 30)
    rodar(b, 0.2, 1 / 240)
    expect(deslocamentoY(a)).toBeCloseTo(deslocamentoY(b), 2)
  })
})

describe('roquecraft - inclinação e campo de visão', () => {
  it('andar de lado inclina para o lado contrário, como o corpo pende', () => {
    const dir = criarCamera()
    rodar(dir, 1, 1 / 60, { strafe: 1 })
    const esq = criarCamera()
    rodar(esq, 1, 1 / 60, { strafe: -1 })
    expect(dir.rolagem).toBeCloseTo(-ROLAGEM_LATERAL, 3)
    expect(esq.rolagem).toBeCloseTo(ROLAGEM_LATERAL, 3)
  })

  it('a inclinação é discreta: menos de dois graus', () => {
    const cam = criarCamera()
    rodar(cam, 2, 1 / 60, { strafe: 1 })
    expect(Math.abs(cam.rolagem)).toBeLessThan((2 * Math.PI) / 180)
  })

  it('correr abre o campo de visão e soltar devolve', () => {
    const cam = criarCamera()
    expect(cam.fov).toBe(1)
    rodar(cam, 1, 1 / 60, { correndo: true })
    expect(cam.fov).toBeCloseTo(FOV_CORRIDA, 3)
    rodar(cam, 1, 1 / 60, { correndo: false })
    expect(cam.fov).toBeCloseTo(1, 3)
  })

  it('a abertura é gradual, não um corte', () => {
    const cam = criarCamera()
    avancarCamera(cam, 1 / 60, { correndo: true })
    expect(cam.fov).toBeGreaterThan(1)
    expect(cam.fov).toBeLessThan(1 + (FOV_CORRIDA - 1) * 0.2)
  })

  it('desligar o efeito no meio da corrida volta ao neutro sem salto', () => {
    const cam = criarCamera()
    rodar(cam, 1, 1 / 60, { strafe: 1, correndo: true })
    const antes = cam.fov
    avancarCamera(cam, 1 / 60, { strafe: 0, correndo: false })
    expect(Math.abs(cam.fov - antes)).toBeLessThan(0.01) // um frame não corta
    rodar(cam, 1, 1 / 60, { strafe: 0, correndo: false })
    expect(cam.fov).toBeCloseTo(1, 3)
    expect(cam.rolagem).toBeCloseTo(0, 3)
  })

  it('entrada absurda de manche não vira tela torta', () => {
    const cam = criarCamera()
    rodar(cam, 1, 1 / 60, { strafe: 99 })
    expect(Math.abs(cam.rolagem)).toBeLessThanOrEqual(ROLAGEM_LATERAL + 1e-6)
  })

  it('levar pancada joga a cabeça pro lado e ela volta sozinha', () => {
    const cam = criarCamera()
    trancoDeDano(cam, 6)
    expect(Math.abs(rolagemTotal(cam))).toBeGreaterThan(0.01)
    expect(deslocamentoY(cam)).toBeLessThanOrEqual(0) // e afunda junto
    rodar(cam, 0.6, 1 / 120)
    expect(Math.abs(rolagemTotal(cam))).toBeLessThan(0.001)
  })

  it('⚠️ pancadas seguidas ALTERNAM de lado', () => {
    // Sempre pro mesmo lado, cinco golpes empurram a tela pro canto e viram
    // enjoo em vez de susto.
    const cam = criarCamera()
    trancoDeDano(cam, 4)
    const a = cam.torcao
    trancoDeDano(cam, 4)
    const b = cam.torcao
    expect(Math.sign(a)).not.toBe(Math.sign(b))
  })

  it('a torção tem teto: nem o golpe mais forte tira a mira do lugar', () => {
    const cam = criarCamera()
    trancoDeDano(cam, 999)
    expect(Math.abs(cam.torcao)).toBeLessThanOrEqual(TORCAO_DANO + 1e-9)
    expect(Math.abs(cam.torcao)).toBeLessThan((4 * Math.PI) / 180)
  })

  it('dano zero ou negativo não faz nada', () => {
    const cam = criarCamera()
    expect(trancoDeDano(cam, 0)).toBe(0)
    expect(trancoDeDano(cam, -3)).toBe(0)
    expect(cam.torcao).toBe(0)
  })

  it('dt zero ou negativo não mexe em nada', () => {
    const cam = criarCamera()
    impactoDeQueda(cam, 3)
    const antes = deslocamentoY(cam)
    avancarCamera(cam, 0, { correndo: true })
    avancarCamera(cam, -1, { correndo: true })
    expect(deslocamentoY(cam)).toBe(antes)
  })
})

// ⚠️ ESTE BLOCO SEGURA O BALANCO PRESO AO CORPO.
//
// A conta morava solta dentro de `frame`, no laco de render, e por isso nunca
// teve teste: pra chegar nela era preciso um motor WebGL e um mundo.
describe('poseDaCamera: onde a camera fica neste quadro', () => {
  const OLHO = [10, 64, 20]
  const semBalanco = (yaw = 0, cam = criarCamera()) =>
    poseDaCamera({ olho: OLHO, yaw, bal: null, cam, fovBase: 75 })

  it('sem balanco, a camera fica no olho', () => {
    const p = semBalanco()
    expect([p.x, p.y, p.z]).toEqual([10, 64, 20])
    expect(p.rolagem).toBe(0)
    expect(p.fov).toBe(75)
  })

  it('o balanco lateral acompanha o YAW, e nao o leste do mundo', () => {
    // Somado direto em x, o jogador andando pro norte veria a cabeca balancar
    // pra frente e pra tras em vez de de um lado pro outro.
    const bal = { x: 0.3, y: 0, rolagem: 0 }
    const cam = criarCamera()
    const olhandoLeste = poseDaCamera({ olho: OLHO, yaw: 0, bal, cam, fovBase: 75 })
    const olhandoNorte = poseDaCamera({ olho: OLHO, yaw: Math.PI / 2, bal, cam, fovBase: 75 })
    // Olhando pro leste (yaw 0) o desvio inteiro cai em x; girado 90 graus, em z.
    expect(olhandoLeste.x - 10).toBeCloseTo(0.3, 6)
    expect(olhandoLeste.z - 20).toBeCloseTo(0, 6)
    expect(olhandoNorte.x - 10).toBeCloseTo(0, 6)
    expect(olhandoNorte.z - 20).toBeCloseTo(0.3, 6)
  })

  it('o desvio lateral tem sempre o MESMO tamanho, seja qual for o yaw', () => {
    const bal = { x: 0.3, y: 0, rolagem: 0 }
    const cam = criarCamera()
    for (const yaw of [0, 0.7, 1.9, Math.PI, 5.5]) {
      const p = poseDaCamera({ olho: OLHO, yaw, bal, cam, fovBase: 75 })
      expect(Math.hypot(p.x - 10, p.z - 20)).toBeCloseTo(0.3, 6)
    }
  })

  it('o balanco vertical NAO gira: sobe e desce e sobe e desce', () => {
    const bal = { x: 0, y: 0.05, rolagem: 0 }
    const cam = criarCamera()
    for (const yaw of [0, 1.2, 3.9]) {
      expect(poseDaCamera({ olho: OLHO, yaw, bal, cam, fovBase: 75 }).y).toBeCloseTo(64.05, 6)
    }
  })

  it('a rolagem soma o pender da caminhada ao tranco do golpe', () => {
    const cam = criarCamera()
    trancoDeDano(cam, 6, 1)
    const comBalanco = poseDaCamera({
      olho: OLHO,
      yaw: 0,
      bal: { x: 0, y: 0, rolagem: 0.02 },
      cam,
      fovBase: 75,
    })
    expect(comBalanco.rolagem).toBeCloseTo(0.02 + rolagemTotal(cam), 9)
  })

  it('o degrau e o baque entram no y, com o mesmo piso de sempre', () => {
    const cam = criarCamera()
    impactoDeQueda(cam, 8)
    expect(semBalanco(0, cam).y).toBeCloseTo(64 + deslocamentoY(cam), 9)
  })

  it('o FOV do jogador e a base; correr multiplica', () => {
    const cam = criarCamera()
    avancarCamera(cam, 0.5, { correndo: true })
    expect(cam.fov).toBeGreaterThan(1)
    expect(poseDaCamera({ olho: OLHO, yaw: 0, bal: null, cam, fovBase: 90 }).fov).toBeCloseTo(
      90 * cam.fov,
      9,
    )
  })
})

describe('mudouOFov: a matriz de projecao nao e de graca', () => {
  it('mudanca imperceptivel nao paga a matriz', () => {
    expect(mudouOFov(75, 75)).toBe(false)
    expect(mudouOFov(75, 75 + PASSO_MINIMO_DE_FOV / 2)).toBe(false)
  })

  it('mudanca visivel paga, pros dois lados', () => {
    expect(mudouOFov(75, 78)).toBe(true)
    expect(mudouOFov(78, 75)).toBe(true)
  })
})

// ⚠️ A ORBITA DA PORTA. Enjoar na tela inicial e a pior hora possivel pra
// enjoar: a pessoa ainda nao tem motivo nenhum pra aguentar.
describe('orbitaDoMenu: a volta lenta da tela inicial', () => {
  const ANCORA = { x: 100, y: 70, z: -50 }

  it('uma volta inteira leva perto de dois minutos', () => {
    // 0,055 rad/s nao e um numero bonito, e um limite de conforto.
    const voltaEmSegundos = (2 * Math.PI) / ORBITA.velocidade
    expect(voltaEmSegundos).toBeGreaterThan(100)
    expect(voltaEmSegundos).toBeLessThan(130)
  })

  it('o yaw anda com o tempo, e so com o tempo', () => {
    expect(orbitaDoMenu({ ancora: ANCORA, yaw: 0, dt: 1 }).yaw).toBeCloseTo(ORBITA.velocidade, 9)
    expect(orbitaDoMenu({ ancora: ANCORA, yaw: 2, dt: 0 }).yaw).toBe(2)
  })

  it('a camera fica sempre a MESMA distancia da ancora', () => {
    // Um raio que varia faria a paisagem "respirar" pra frente e pra tras, que
    // e outro jeito de enjoar.
    for (const yaw of [0, 1.3, 3.9, 7.7, 20]) {
      const { pos } = orbitaDoMenu({ ancora: ANCORA, yaw, dt: 0 })
      expect(Math.hypot(pos.x - ANCORA.x, pos.z - ANCORA.z)).toBeCloseTo(ORBITA.raio, 9)
    }
  })

  it('a altura NAO oscila: so o entorno gira', () => {
    for (const yaw of [0, 2.2, 5.5]) {
      expect(orbitaDoMenu({ ancora: ANCORA, yaw, dt: 0.016 }).pos.y).toBe(ANCORA.y)
    }
  })

  it('a paisagem gira mais devagar do que o olhar: e o que faz o mundo parecer grande', () => {
    const a = orbitaDoMenu({ ancora: ANCORA, yaw: 0, dt: 0 }).pos
    const b = orbitaDoMenu({ ancora: ANCORA, yaw: Math.PI, dt: 0 }).pos
    // Meia volta de yaw move a camera um QUARTO de volta (arco 0.5), nao meia.
    const anguloA = Math.atan2(a.z - ANCORA.z, a.x - ANCORA.x)
    const anguloB = Math.atan2(b.z - ANCORA.z, b.x - ANCORA.x)
    expect(Math.abs(anguloB - anguloA)).toBeCloseTo(Math.PI * ORBITA.arco, 6)
    expect(ORBITA.arco).toBeLessThan(1)
  })

  it('sem ancora o yaw ainda anda, e nao ha posicao pra escrever', () => {
    // Antes do mundo carregar nao ha onde orbitar. O relogio nao pode parar por
    // isso, senao a tela inicial congela no escuro.
    const r = orbitaDoMenu({ ancora: null, yaw: 1, dt: 0.5 })
    expect(r.pos).toBe(null)
    expect(r.yaw).toBeGreaterThan(1)
  })
})

describe('camera — as bordas do degrau, do baque e do tranco', () => {
  // As mesmas expressões do fonte, para os limites baterem bit a bit — e as
  // alturas ancoradas em ZERO, senão `(64 + limite) - 64` já não é o limite.
  const MIN_DEGRAU = 0.06
  const MAX_DEGRAU = AUTO_STEP_HEIGHT + 0.05

  it('a primeira leitura de altura só memoriza, não anima', () => {
    // `cam.yAnterior === null` invertido faz a PRIMEIRA leitura calcular um
    // degrau a partir de `null` (dy = y) e a segunda em diante não memorizar
    // nada: a câmera dá um solavanco do tamanho da altura do mundo ao nascer.
    const cam = criarCamera()
    expect(seguirAltura(cam, 64, true)).toBe(0)
    expect(cam.degrau).toBe(0)
    expect(seguirAltura(cam, 64.2, true)).toBeCloseTo(0.2, 6)
    expect(cam.degrau).toBeLessThan(0)
  })

  it('degrau exatamente no mínimo conta; abaixo dele, não', () => {
    // `dy < MIN_DEGRAU`: o piso existe para o balanço da caminhada não virar
    // degrau. Já `dy > MAX_DEGRAU` corta a QUEDA, que tem animação própria.
    const noMinimo = criarCamera()
    seguirAltura(noMinimo, 0, true)
    expect(seguirAltura(noMinimo, MIN_DEGRAU, true)).toBe(MIN_DEGRAU)

    const abaixo = criarCamera()
    seguirAltura(abaixo, 0, true)
    expect(seguirAltura(abaixo, MIN_DEGRAU - 0.001, true)).toBe(0)
  })

  it('degrau exatamente no máximo conta; acima dele, não', () => {
    const noMaximo = criarCamera()
    seguirAltura(noMaximo, 0, true)
    expect(seguirAltura(noMaximo, MAX_DEGRAU, true)).toBe(MAX_DEGRAU)

    const acima = criarCamera()
    seguirAltura(acima, 0, true)
    expect(seguirAltura(acima, MAX_DEGRAU + 0.001, true)).toBe(0)
  })

  it('as três recusas do degrau valem SEPARADAMENTE', () => {
    // `!noChao || dy < MIN || dy > MAX` virando `&&` só recusa quando as três
    // valem juntas — ou seja, quase nunca: no ar, com degrau pequeno E grande
    // ao mesmo tempo, o que é impossível. A câmera passa a "degrauzar" durante
    // a queda inteira.
    const noAr = criarCamera()
    seguirAltura(noAr, 64, false)
    expect(seguirAltura(noAr, 64.2, false)).toBe(0)
  })

  it('queda de altura zero não dá baque', () => {
    // `!(queda > 0)` afrouxado para `>=` faz todo pouso de altura zero — que é
    // o que acontece ao simplesmente ANDAR num piso plano com quicadas
    // numéricas — sacudir a câmera.
    const cam = criarCamera()
    expect(impactoDeQueda(cam, 0)).toBe(0)
    expect(cam.impacto).toBe(0)
    expect(impactoDeQueda(cam, 3)).toBeLessThan(0)
  })

  it('dano zero não sacode a tela', () => {
    const cam = criarCamera()
    expect(trancoDeDano(cam, 0)).toBe(0)
    expect(cam.torcao).toBe(0)
  })

  it('a torção alterna de lado a cada pancada', () => {
    // `lado ?? (cam.ladoDano = -(cam.ladoDano || -1))`: com `||` no lugar do
    // `??`, um `lado` explícito de valor 0 seria descartado — mas o que este
    // teste segura é a alternância, que é o que impede cinco pancadas seguidas
    // de empurrarem a tela sempre pro mesmo canto e virarem enjoo.
    const cam = criarCamera()
    trancoDeDano(cam, 4)
    const primeira = Math.sign(cam.torcao)
    trancoDeDano(cam, 4)
    expect(Math.sign(cam.torcao)).toBe(-primeira)
    trancoDeDano(cam, 4)
    expect(Math.sign(cam.torcao)).toBe(primeira)
  })

  it('lado explícito manda sobre a alternância', () => {
    const cam = criarCamera()
    trancoDeDano(cam, 4, 1)
    expect(Math.sign(cam.torcao)).toBe(1)
    trancoDeDano(cam, 4, 1)
    expect(Math.sign(cam.torcao)).toBe(1)
  })

  it('passo de tempo zero não avança nada', () => {
    // `!(dt > 0)` afrouxado para `>=`: um quadro de duração zero — dois quadros
    // no mesmo milissegundo — passaria a rodar a mola do impacto com `h = 0` e
    // o laço `restante > 1e-6` giraria sem fim.
    const cam = criarCamera()
    impactoDeQueda(cam, 3)
    const antes = { ...cam }
    expect(avancarCamera(cam, 0)).toBe(cam)
    expect(cam.impacto).toBe(antes.impacto)
    expect(cam.impactoV).toBe(antes.impactoV)
  })

  it('o baque NÃO some no primeiro instante', () => {
    // ⚠️ `Math.abs(impacto) < 1e-4 && Math.abs(impactoV) < 1e-3` virando `||`
    // zera a mola assim que UMA das duas fica pequena — e logo depois do pouso
    // a velocidade ainda é praticamente zero. O baque inteiro desapareceria no
    // primeiro quadro, e o pouso de uma queda de cinco metros não sacudiria
    // nada.
    const cam = criarCamera()
    impactoDeQueda(cam, 5)
    const noPouso = cam.impacto
    expect(noPouso).toBeLessThan(-0.05)
    avancarCamera(cam, 1e-6)
    expect(cam.impacto).toBeLessThan(-0.05)
  })

  it('a mola do impacto assenta em zero, e as duas condições valem juntas', () => {
    // `Math.abs(impacto) < 1e-4 && Math.abs(impactoV) < 1e-3` virando `||`
    // zera a mola no meio do movimento — o baque some pela metade, no instante
    // em que a velocidade passa por perto de zero.
    const cam = criarCamera()
    impactoDeQueda(cam, 5)
    for (let i = 0; i < 400; i++) avancarCamera(cam, 1 / 60)
    expect(cam.impacto).toBe(0)
    expect(cam.impactoV).toBe(0)
  })

  it('mudança de FOV menor que o passo mínimo não vale a pena redesenhar', () => {
    // `Math.abs(atual - alvo) > PASSO_MINIMO_DE_FOV` afrouxado para `>=` manda
    // recalcular a projeção no limiar exato, todo quadro, para sempre.
    // Ancorado em zero: `Math.abs(0 - P)` é exatamente P.
    expect(mudouOFov(0, PASSO_MINIMO_DE_FOV)).toBe(false)
    expect(mudouOFov(0, PASSO_MINIMO_DE_FOV * 2)).toBe(true)
    expect(mudouOFov(1, 1)).toBe(false)
  })
})

//
// ASSENTAR A CÂMERA — a escrita no objeto do three, que saiu do laço de quadro.
//
// O que importa aqui é o PORTÃO de `updateProjectionMatrix`: ele é caro, e
// chamá-lo todo quadro por um centésimo de grau é gastar matriz pra não mudar
// nada na tela. Enquanto isso morava no componente, não havia como afirmá-lo
// sem abrir o navegador.
describe('assentarCamera', () => {
  const cameraFalsa = (fov = 70) => {
    const c = {
      fov,
      position: {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          this.x = x
          this.y = y
          this.z = z
        },
      },
      rotation: { x: 0, y: 0, z: 0 },
      projecoes: 0,
      updateProjectionMatrix() {
        this.projecoes++
      },
    }
    return c
  }
  const olhar = (cam, yaw, pitch) => {
    cam.rotation.y = yaw
    cam.rotation.x = pitch
  }
  const pose = (extra = {}) => ({ x: 1, y: 2, z: 3, rolagem: 0.05, fov: 70, ...extra })

  it('põe posição, olhar e rolagem', () => {
    const cam = cameraFalsa()
    assentarCamera(cam, pose(), 0.5, -0.25, olhar)
    expect([cam.position.x, cam.position.y, cam.position.z]).toEqual([1, 2, 3])
    expect(cam.rotation.y).toBe(0.5)
    expect(cam.rotation.x).toBe(-0.25)
    expect(cam.rotation.z).toBe(0.05)
  })

  it('mudança de FOV grande recalcula a projeção UMA vez', () => {
    const cam = cameraFalsa(70)
    expect(assentarCamera(cam, pose({ fov: 80 }), 0, 0, olhar)).toBe(true)
    expect(cam.fov).toBe(80)
    expect(cam.projecoes).toBe(1)
  })

  it('FOV parado NÃO recalcula — o portão é o ponto de existir esta função', () => {
    const cam = cameraFalsa(70)
    expect(assentarCamera(cam, pose({ fov: 70 }), 0, 0, olhar)).toBe(false)
    expect(cam.projecoes).toBe(0)
  })

  it('cem quadros com FOV oscilando abaixo do passo mínimo não gastam matriz', () => {
    // ⚠️ É ASSIM QUE O CUSTO VOLTA: não num quadro, mas em sessenta por segundo
    // de ruído numérico logo abaixo do limiar.
    const cam = cameraFalsa(70)
    for (let i = 0; i < 100; i++) {
      assentarCamera(cam, pose({ fov: 70 + (i % 2 ? PASSO_MINIMO_DE_FOV / 3 : 0) }), 0, 0, olhar)
    }
    expect(cam.projecoes).toBe(0)
    // e a posição continua sendo escrita todo quadro, que é o trabalho dela
    expect(cam.position.x).toBe(1)
  })

  it('a rolagem é escrita mesmo quando o FOV não muda', () => {
    const cam = cameraFalsa(70)
    assentarCamera(cam, pose({ fov: 70, rolagem: 0.3 }), 0, 0, olhar)
    expect(cam.rotation.z).toBe(0.3)
  })
})
