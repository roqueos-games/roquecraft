import { describe, it, expect, vi } from 'vitest'
import { createPipeline } from '../../src/servicos/chunkPipeline.js'
import { chunkKey, CHUNK_SIZE, localIndex } from '../../src/servicos/constants.js'
import { ID } from '../../src/servicos/blocks.js'
import { pickSpawn, MIN_SPAWN_DIST, MAX_SPAWN_DIST, MOB_TYPES } from '../../src/servicos/mobs.js'
import { relogioSintetico, moer } from './relogioDoPipeline.js'
import { TETO_DE_MUNDO } from '../tetos.js'

// ⚠️ ESTE ARQUIVO GERA MUNDO, E GERAR MUNDO CUSTA SEGUNDOS DE VERDADE.
//
// Raio 8 são 289 chunks, cada um com 65 mil blocos de ruído 3D: 8,5s por teste
// numa máquina ociosa, e o trabalho é o mesmo em qualquer uma. O teto global de
// 15s existe para pegar teste que TRAVA, e com a máquina carregada (um build
// ao lado, um sweep de mutação, o LM Studio) ele passa a reprovar teste que está
// fazendo exatamente o que devia -- vermelho que depende da carga, que é o tipo
// que ensina a ignorar vermelho. O teto vem de `tests/setup/tetos.js`, num
// lugar só: sob `--coverage` ele PRECISA ser outro, e o porquê está medido lá.
vi.setConfig({ testTimeout: TETO_DE_MUNDO })

// A NOITE NÃO TINHA PERIGO, E ERA UMA LINHA.
//
// `mobEnv()` no componente dizia `lightAt: () => 15`. `pickSpawn` lê essa luz,
// conclui "está claro", e `hostile` nunca é verdadeiro. Zumbi, esqueleto e
// aranha existem em `mobs.js` — 430 linhas de tipos, IA e perseguição — e nunca
// nasceram, nem uma vez, desde que o jogo existe.
//
// A luz mora no worker, e a thread principal não a enxergava. Agora o pipeline
// ESPELHA a luz dos chunks perto do jogador (`emitirLuz`), num raio pequeno de
// propósito: o spawn olha de 14 a 46 blocos, então 5 chunks bastam e custam
// ~3,9 MB em vez dos ~27 MB do raio de renderização inteiro.
//
// Este arquivo guarda as três metades do conserto: o espelho chega, ele é
// limitado, e "não sei a luz" NÃO vira "pode nascer".

async function sessao({ seed = 4242, raio = 8, ticks = 400 } = {}) {
  const luzes = new Map()
  const blocos = new Map()
  const pipe = createPipeline({
    seed,
    renderDistance: raio,
    agora: relogioSintetico(),
    emit: (msg) => {
      if (msg.t === 'luz') luzes.set(chunkKey(msg.cx, msg.cz), msg.light)
      else if (msg.t === 'chunk') blocos.set(chunkKey(msg.cx, msg.cz), msg.blocks)
      else if (msg.t === 'unload') {
        luzes.delete(chunkKey(msg.cx, msg.cz))
        blocos.delete(chunkKey(msg.cx, msg.cz))
      }
    },
  })
  pipe.setCenter(0, 0, 4)
  await moer(pipe, {
    orcamento: 8,
    trabalho: ticks * 40,
    progresso: () => luzes.size + blocos.size,
  })
  return { pipe, luzes, blocos }
}

const luzEm = (luzes, x, y, z) => {
  const cx = Math.floor(x / CHUNK_SIZE)
  const cz = Math.floor(z / CHUNK_SIZE)
  const l = luzes.get(chunkKey(cx, cz))
  if (!l) return null
  const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  // `localIndex` importado do módulo: escrever a conta de novo aqui foi o que
  // fez a primeira versão deste teste ler zero num mundo perfeitamente aceso.
  const p = l[localIndex(lx, y, lz)]
  return { ceu: (p >> 4) & 15, bloco: p & 15 }
}

describe('espelho de luz do cliente', () => {
  // UMA sessão para os testes que só LEEM. Montar o pipeline custa ~4 s (ele
  // gera e acende o mundo de verdade); cinco montagens punham 21 s na suíte
  // inteira por nada. O teste da tocha monta a sua, porque muta o mundo.
  let comum = null
  const lido = () => (comum ??= sessao())

  it('chega para os chunks em volta do jogador', async () => {
    const { luzes } = await lido()
    expect(luzes.size, 'nenhuma luz espelhada — a ponte não existe').toBeGreaterThan(0)
    expect(luzes.has(chunkKey(0, 0)), 'o chunk do jogador tem que vir').toBe(true)
  })

  it('é LIMITADO: chunk longe não vem, mesmo carregado', async () => {
    // É o ponto do desenho. Espelhar o raio inteiro custaria ~27 MB; o spawn
    // não olha além de 46 blocos.
    const { luzes, blocos } = await lido()
    expect(blocos.has(chunkKey(7, 0)), 'o bloco desse chunk tem que ter vindo').toBe(true)
    expect(luzes.has(chunkKey(7, 0)), 'a luz desse chunk NÃO pode ter vindo').toBe(false)
  })

  it('cobre com folga o raio de spawn de criatura', async () => {
    const { luzes } = await lido()
    // 5 chunks = 80 blocos. O spawn vai a 46, o despawn a 72.
    const alcance = Math.max(...[...luzes.keys()].map((k) => Math.abs(Number(k.split(',')[0]))))
    expect(alcance * CHUNK_SIZE).toBeGreaterThanOrEqual(MAX_SPAWN_DIST)
    expect(MIN_SPAWN_DIST).toBeLessThan(MAX_SPAWN_DIST)
  })

  it('a luz espelhada é a luz de verdade: céu 15 no topo, 0 no fundo da rocha', async () => {
    const { luzes } = await lido()
    const topo = luzEm(luzes, 2, 120, 2)
    const fundo = luzEm(luzes, 2, 2, 2)
    expect(topo, 'sem dado no topo').not.toBeNull()
    expect(topo.ceu, 'céu aberto tem que ter skylight cheio').toBe(15)
    expect(fundo.ceu, 'fundo da rocha tem que estar apagado').toBe(0)
  })

  it('acender uma tocha REENVIA a luz do chunk', async () => {
    // Sem o reenvio, colocar tocha deixava de impedir spawn até o chunk
    // recarregar — e o jogador não tem como saber disso.
    const { pipe, luzes } = await sessao()
    const alvo = { x: 3, y: 40, z: 3 }
    const antes = luzEm(luzes, alvo.x, alvo.y, alvo.z)
    pipe.edit(alvo.x, alvo.y, alvo.z, ID.torch)
    // Sem `progresso` de propósito: reenviar a luz de um chunk que já existe não
    // muda contagem nenhuma, então aqui o certo é moer um tanto FIXO -- que, com
    // o relógio sintético, é o mesmo tanto em qualquer máquina.
    await moer(pipe, { orcamento: 8, trabalho: 400 })
    const depois = luzEm(luzes, alvo.x, alvo.y, alvo.z)
    expect(antes).not.toBeNull()
    expect(depois.bloco, 'a tocha tem que acender a célula dela').toBeGreaterThan(antes.bloco)
  })
})

describe('pickSpawn e a luz', () => {
  const base = (over = {}) => ({
    player: { x: 0, y: 64, z: 0 },
    solidAt: (x, y) => (y === 63 ? 1 : 0),
    surfaceY: () => 64,
    biomeAt: () => 'plains', // os nomes de bioma são minúsculos (`BIOMES`)
    isDay: false,
    allowHostile: true,
    lightAt: () => 0,
    ...over,
  })

  // rnd fixo: ângulo 0, distância no meio da faixa
  const rnd = () => 0.5

  // ⚠️ A LISTA VIROU DERIVADA. Era `['zombie','skeleton','spider']` escrita à
  // mão, e o creeper — hostil, nascido no escuro — reprovou o teste ao entrar
  // no jogo. Acrescentar o nome à lista teria funcionado e não teria ensinado
  // nada; lida de `MOB_TYPES`, ela acompanha sozinha quem vier depois, e o
  // teste passa a exigir a propriedade em vez do nome.
  const HOSTIS = Object.values(MOB_TYPES)
    .filter((d) => d.hostile)
    .map((d) => d.key)

  it('a lista de hostis não está vazia (prova de vida do próprio critério)', async () => {
    // Sem isto, um `hostile` renomeado esvaziaria `HOSTIS` e os dois testes
    // abaixo passariam a não exigir nada.
    expect(HOSTIS.length).toBeGreaterThanOrEqual(4)
    expect(HOSTIS).toContain('creeper')
  })

  it('com o mundo escuro, nasce criatura HOSTIL', async () => {
    const c = pickSpawn(base(), rnd)
    expect(c, 'nada nasceu num mundo escuro').not.toBeNull()
    expect(HOSTIS).toContain(c.type)
  })

  it('PROVA DE VIDA: com o `lightAt: () => 15` antigo, nunca nasce hostil', async () => {
    // Este é o teste que descreve o defeito. Se ele parar de reprovar, a linha
    // voltou.
    let hostis = 0
    for (let i = 0; i < 200; i++) {
      const c = pickSpawn(base({ lightAt: () => 15, isDay: false }), () => (i * 0.618033) % 1)
      if (c && HOSTIS.includes(c.type)) hostis++
    }
    expect(hostis, 'com luz 15 fixa é impossível nascer hostil').toBe(0)
  })

  it('luz DESCONHECIDA (null) não faz nascer nada', async () => {
    // "Não sei" não pode virar "pode nascer": seria o mesmo defeito ao
    // contrário, com criatura brotando em pedaço de mundo não espelhado.
    expect(pickSpawn(base({ lightAt: () => null }), rnd)).toBeNull()
  })

  it('luz de tocha (nível 12) impede o hostil, mesmo de noite', async () => {
    expect(pickSpawn(base({ lightAt: () => 12 }), rnd)).toBeNull()
  })

  it('no criativo (`allowHostile` falso) nada hostil nasce', async () => {
    expect(pickSpawn(base({ allowHostile: false }), rnd)).toBeNull()
  })

  it('de dia e claro, nasce bicho PASSIVO', async () => {
    const c = pickSpawn(base({ lightAt: () => 15, isDay: true }), rnd)
    expect(c).not.toBeNull()
    expect(['zombie', 'skeleton', 'spider']).not.toContain(c.type)
  })
})
