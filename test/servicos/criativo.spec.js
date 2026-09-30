import { describe, it, expect } from 'vitest'
import {
  ABAS,
  ABA_PADRAO,
  abaVizinha,
  ehAba,
  HORAS,
  CAINDO,
  velocidadeDoRelogio,
  podeReger,
  ticksDaFracao,
  fracaoDosTicks,
  leituraDoClima,
  estadoInicial,
  soltarTudo,
  coordenadaDigitada,
  lembrarDeOndeSaiu,
  LIMITE_DA_COORDENADA,
  TETO_DO_HISTORICO,
  LUGARES_DO_MUNDO,
} from '../../src/servicos/criativo.js'
import {
  TICKS_PER_DAY,
  advanceTime,
  DAWN,
  NOON,
  DUSK,
  MIDNIGHT,
} from '../../src/servicos/daycycle.js'
import { tempestadeDe } from '../../src/servicos/clima.js'

describe('os controles de criativo', () => {
  it('só existe no criativo', () => {
    expect(podeReger('creative')).toBe(true)
    expect(podeReger('survival')).toBe(false)
    expect(podeReger('spectator')).toBe(false)
    expect(podeReger(undefined)).toBe(false)
  })

  it('⚠️ o cadeado PARA o relógio de verdade', () => {
    // A prova não é o booleano: é o tick não andar depois de um segundo cheio.
    // Um teste que só afirmasse `velocidadeDoRelogio(true) === 0` passaria
    // mesmo que ninguém ligasse esse número em `advanceTime`.
    const t0 = 5000
    expect(advanceTime(t0, 1, velocidadeDoRelogio(true)), 'travado').toBe(t0)
    expect(advanceTime(t0, 1, velocidadeDoRelogio(false)), 'solto').toBeGreaterThan(t0)
  })

  it('a fração e os ticks são a mesma grandeza nos dois sentidos', () => {
    for (const t of [0, 1, 6000, 12000, 18000, 23999]) {
      expect(ticksDaFracao(fracaoDosTicks(t)), `ida e volta em ${t}`).toBe(t)
    }
    expect(ticksDaFracao(0)).toBe(0)
    // Um dia inteiro dá a volta e retorna ao amanhecer, não a 24000.
    expect(ticksDaFracao(1)).toBe(0)
  })

  it('fração inválida não vira NaN no relógio', () => {
    for (const v of [NaN, undefined, -3, Infinity]) {
      expect(Number.isFinite(ticksDaFracao(v)), `${v}`).toBe(true)
    }
  })

  it('os quatro instantes são os do ciclo, não números soltos', () => {
    // ⚠️ COMPARADO COM `daycycle`, e não com literais. Se o ciclo mudar o que
    // chama de meio-dia, este teste cai junto em vez de o painel mandar o
    // jogador para uma hora que não é mais aquela.
    expect(HORAS.map((h) => h.ticks)).toEqual([DAWN, NOON, DUSK, MIDNIGHT])
    expect(new Set(HORAS.map((h) => h.chave)).size, 'chave repetida').toBe(4)
    for (const h of HORAS) expect(h.ticks).toBeLessThan(TICKS_PER_DAY)
  })

  it('a leitura do clima não recalcula a tempestade — cita a do jogo', () => {
    for (const c of [0, 0.2, 0.6, 0.9, 1]) {
      expect(leituraDoClima(c).tempestade, `chuva ${c}`).toBe(tempestadeDe(c))
    }
  })

  it('⚠️ o limiar de "está caindo" é o do HUD, não o da umidade', () => {
    // `LIMIAR_CHUVA` é 0,76 e é limiar de UMIDADE — usar ele aqui faria o painel
    // escrever "céu limpo" com a chuva na tela. O do HUD é 0,05.
    expect(CAINDO).toBe(0.05)
    expect(leituraDoClima(0.04).precipita).toBe(false)
    expect(leituraDoClima(0.06).precipita).toBe(true)
    expect(leituraDoClima(0.5).precipita).toBe(true)
  })

  it('chuva inválida não vira leitura inválida', () => {
    for (const v of [NaN, undefined, -1, 5]) {
      const l = leituraDoClima(v)
      expect(Number.isFinite(l.chuva), `${v}`).toBe(true)
      expect(l.chuva).toBeGreaterThanOrEqual(0)
      expect(l.chuva).toBeLessThanOrEqual(1)
    }
  })

  it('⚠️ null e zero são coisas DIFERENTES', () => {
    // `null` é "o mundo decide"; zero é céu limpo FORÇADO. Colapsar os dois faz
    // o botão de soltar não soltar nada — o jogador fica preso num céu limpo
    // que ele não escolheu.
    expect(estadoInicial().chuva).toBe(null)
    expect(soltarTudo().chuva).toBe(null)
    expect(soltarTudo().chuva).not.toBe(0)
  })

  it('soltar tudo solta os DOIS juntos', () => {
    expect(soltarTudo()).toEqual({ travado: false, chuva: null })
  })
})

// ⚠️ AS ABAS NASCERAM PORQUE O PAINEL IA CRESCER: o Goal 23 acrescenta
// teleporte (dimensão, lugares, coordenada) ao mesmo painel, e numa coluna só
// chegar ao último controle custaria uma volta inteira de Tab.
describe('criativo — as abas do painel', () => {
  it('há abas, cada uma com chave e rótulo traduzível', () => {
    expect(ABAS.length).toBeGreaterThan(1)
    for (const a of ABAS) {
      expect(a.chave, 'aba sem chave').toBeTruthy()
      expect(a.i18n, `aba ${a.chave} sem rótulo`).toMatch(/^roqueCraft\./)
    }
    expect(ABA_PADRAO, 'a aba padrão não está na lista').toBe(ABAS[0].chave)
  })

  it('a seta anda na fila e VOLTA nas pontas', () => {
    const [primeira, segunda] = ABAS.map((a) => a.chave)
    const ultima = ABAS.at(-1).chave
    expect(abaVizinha(primeira, 1)).toBe(segunda)
    expect(abaVizinha(ultima, 1), 'parou na última em vez de voltar').toBe(primeira)
    expect(abaVizinha(primeira, -1), 'parou na primeira em vez de voltar').toBe(ultima)
  })

  // ⚠️ Save antigo e estado corrompido chegam aqui. Devolver `undefined` daria
  // um painel sem aba nenhuma: um retângulo vazio, sem erro no console.
  it('aba desconhecida cai na primeira, e não em nada', () => {
    expect(abaVizinha('nao-existe', 1)).toBe(ABA_PADRAO)
    expect(abaVizinha(undefined, -1)).toBe(ABA_PADRAO)
  })

  it('passo que não é ±1 não mexe na aba', () => {
    expect(abaVizinha(ABA_PADRAO, 0)).toBe(ABA_PADRAO)
    expect(abaVizinha(ABA_PADRAO, 5)).toBe(ABA_PADRAO)
  })

  it('ehAba conhece as que existem, e recusa o resto', () => {
    for (const a of ABAS) expect(ehAba(a.chave)).toBe(true)
    expect(ehAba('teleporte-que-ainda-nao-existe')).toBe(false)
    expect(ehAba('')).toBe(false)
  })
})

// GOAL 23, ONDA 4: a coordenada digitada e a memória de onde se saiu.
describe('a coordenada digitada', () => {
  it('X e Z inteiros, Y opcional; espaço e vírgula decimal são tolerados', () => {
    expect(coordenadaDigitada({ x: '120', z: '-45' })).toEqual({ x: 120, z: -45, y: null })
    expect(coordenadaDigitada({ x: ' 120 ', z: '-45', y: '' })).toEqual({ x: 120, z: -45, y: null })
    expect(coordenadaDigitada({ x: '12,7', z: '3.9', y: '70' })).toEqual({ x: 12, z: 3, y: 70 })
    expect(coordenadaDigitada({ x: 0, z: 0 })).toEqual({ x: 0, z: 0, y: null })
  })

  it('⚠️ "12abc" NÃO é 12: o jogador iria para onde não digitou', () => {
    expect(coordenadaDigitada({ x: '12abc', z: '1' })).toBe(null)
    expect(coordenadaDigitada({ x: '1', z: 'um' })).toBe(null)
    expect(coordenadaDigitada({ x: '1', z: '1', y: 'alto' })).toBe(null)
    expect(coordenadaDigitada({ x: '', z: '1' })).toBe(null)
    expect(coordenadaDigitada({ z: '1' })).toBe(null)
    expect(coordenadaDigitada()).toBe(null)
  })

  it('fora do limite do mundo não vai', () => {
    expect(coordenadaDigitada({ x: String(LIMITE_DA_COORDENADA), z: '0' })).not.toBe(null)
    expect(coordenadaDigitada({ x: String(LIMITE_DA_COORDENADA + 1), z: '0' })).toBe(null)
    expect(coordenadaDigitada({ x: '0', z: String(-LIMITE_DA_COORDENADA - 1) })).toBe(null)
  })
})

describe('de onde se saiu', () => {
  it('guarda dimensão e posição, no fim, sem tocar a lista de antes', () => {
    const antes = []
    const depois = lembrarDeOndeSaiu(antes, { dimensao: 'nether', x: 1, y: 2, z: 3, vy: 9 })
    expect(depois).toEqual([{ dimensao: 'nether', x: 1, y: 2, z: 3 }])
    expect(antes).toEqual([])
    expect(lembrarDeOndeSaiu(null, { dimensao: 'end', x: 0, y: 0, z: 0 })).toHaveLength(1)
  })

  it('lembra só as últimas TETO_DO_HISTORICO, e é a mais velha que cai', () => {
    let h = []
    for (let i = 0; i < TETO_DO_HISTORICO + 3; i++)
      h = lembrarDeOndeSaiu(h, { dimensao: 'overworld', x: i, y: 0, z: 0 })
    expect(h).toHaveLength(TETO_DO_HISTORICO)
    expect(h[0].x).toBe(3)
    expect(h.at(-1).x).toBe(TETO_DO_HISTORICO + 2)
  })

  it('os lugares do mundo têm chave i18n no namespace do painel', () => {
    expect(LUGARES_DO_MUNDO.map((l) => l.chave)).toEqual([
      'nascimento',
      'cama',
      'vila',
      'fortaleza',
    ])
    for (const l of LUGARES_DO_MUNDO) expect(l.i18n).toMatch(/^roqueCraft\.criativo\./)
  })
})
