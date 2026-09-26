// A ABERTURA: como o jogador ENTRA no mundo.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE ISTO NUNCA TEVE TESTE, e o endereço era a
// razão: as sete funções moravam soltas no meio de `ROSRoqueCraft.vue`, entre o
// boot e o laço de quadro, cada uma mexendo em `let` do componente. Conferir
// qualquer uma delas exigia subir navegador — e por isso nenhuma era conferida,
// apesar de o histórico delas ser uma lista de defeito caro:
//
//  - sair do menu DESLIGAVA o voo e deixava cair: o jogador morria de dano de
//    queda antes do primeiro passo (relato do founder, 2026-08-20)
//  - nascer no primeiro apoio de cima pra baixo punha o jogador empoleirado num
//    galho, porque folha colide (QA de 2026-08-20)
//  - `pousarSeguro` com uma cópia da política de nascimento com piso 1 desfazia
//    o pouso do boot e enterrava o jogador numa caverna
//  - sem `fallStart`, o motor achava que ele tinha despencado do céu
//
// A POLÍTICA de onde se pode nascer não mora aqui: é `nascimento.js`, pura e
// testada. Aqui mora a AMARRAÇÃO dela com o mundo vivo, o menu e o save — que é
// justamente onde as cópias divergiam.
//
// ⚠️ TUDO O QUE É `let` DO COMPONENTE ENTRA POR ACESSOR, nunca por valor.
// `world`, `noiseCtx`, `ticks`, `yaw`, `pitch`, `savedPlayer` e `menuAnchor`
// são reatribuídos em troca de qualidade, mundo novo e troca de dimensão; lidos
// por valor, este arquivo falaria com o mundo de quando foi montado. É o mesmo
// padrão do gancho de QA (ver `espelho.js`).

/**
 * @param {object} ctx
 * @param {object} ctx.jogador  o corpo do jogador (x, y, z, vy, fallStart)
 * @param {{value: boolean}} ctx.voando
 * @param {{value: boolean}} ctx.menuAberto
 * @param {{value: boolean}} ctx.pausado
 * @param {{value: boolean}} ctx.temSave
 * @param {{value: number}} ctx.diaDoSave
 * @param {{value: number}} ctx.semente
 * @param {{value: string}} ctx.modo
 * @param {{value: number}} ctx.slotEscolhido
 * @param {{value: Array}} ctx.inventario
 * @param {object} ctx.sobrevivencia  estado reativo
 * @param {object} ctx.entidades  o composable das listas (`limpar`)
 * @param {() => object|null} ctx.mundo  GETTER: o mundo é recriado
 * @param {[() => number, (v:number)=>void]} ctx.instante  `ticks` do componente
 * @param {[() => number, (v:number)=>void]} ctx.guinada  `yaw`
 * @param {[() => number, (v:number)=>void]} ctx.inclinacao  `pitch`
 * @param {[() => object|null, (v:object|null)=>void]} ctx.posicaoDoSave  `savedPlayer`
 * @param {(a: object|null) => void} ctx.ancorarMenu  guarda a pose de órbita
 * @param {() => boolean} ctx.cancelado  o componente desmontou?
 * @param {() => void} ctx.soltarPonteiro
 * @param {object} ctx.regras  as funções puras (injetadas: o teste dubla)
 */
export function useRoqueCraftAbertura(ctx) {
  const {
    jogador: p,
    voando,
    menuAberto,
    pausado,
    temSave,
    diaDoSave,
    semente,
    modo,
    slotEscolhido,
    inventario,
    sobrevivencia,
    entidades,
    mundo,
    ancorarMenu,
    cancelado,
    soltarPonteiro,
    regras,
  } = ctx
  const [lerTicks, porTicks] = ctx.instante
  const [lerYaw, porYaw] = ctx.guinada
  const [lerPitch, porPitch] = ctx.inclinacao
  const [lerSalvo, porSalvo] = ctx.posicaoDoSave
  const [lerRuido, porRuido] = ctx.ruido

  /**
   * O leitor de blocos que a política de nascimento espera, ligado ao mundo
   * vivo.
   *
   * ⚠️ SEM `?.` AQUI, DE PROPÓSITO. Nada neste caminho roda antes de o boot
   * criar o mundo: quem chama é o próprio boot (depois do `createWorldClient`),
   * `pousarSeguro` e o resgate de soterramento. Uma meia-defesa — `w?.getBlock`
   * ao lado de `w.solidAt` — não protege nada (a segunda linha estoura do mesmo
   * jeito) e ainda faz o leitor acreditar que o nulo está tratado. Se o mundo
   * faltar aqui, é erro de programação e tem que aparecer alto, não virar uma
   * coluna de ar silenciosa que joga o jogador pro vazio.
   */
  const mundoDoNascimento = () => {
    const w = mundo()
    return {
      chaveEm: (x, y, z) => regras.blockDef(w.getBlock(x, y, z) ?? 0)?.key || '',
      solidAt: w.solidAt,
      surfaceY: (x, z) => w.surfaceY(x, z),
      landingSpot: regras.landingSpot,
      safeSpawn: regras.safeSpawn,
    }
  }

  const chaoParaNascer = (tetoExtra = 0, tetoPadrao = 100) =>
    regras.politicaDeNascimento(mundoDoNascimento(), p.x, p.z, tetoExtra, tetoPadrao)

  /**
   * Segura o jogador no ar até o chunk chegar. Sem isto ele cai no vazio: o
   * mundo ainda não existe embaixo dele.
   */
  function esperarOChaoChegar(limiteMs = 9000) {
    return new Promise((resolve) => {
      const t0 = Date.now()
      const ver = () => {
        if (cancelado()) return resolve(false)
        if (mundo()?.isLoaded(Math.floor(p.x), Math.floor(p.z))) return resolve(true)
        if (Date.now() - t0 > limiteMs) return resolve(false)
        setTimeout(ver, 60)
      }
      ver()
    })
  }

  /** Põe a câmera numa pose de cartão-postal e liga a órbita. */
  function entrarNoMenu() {
    menuAberto.value = true
    pausado.value = false
    const topo = mundo()?.surfaceY(Math.floor(p.x), Math.floor(p.z))
    const ancora = { x: p.x, y: (Number.isFinite(topo) ? topo : p.y) + 26, z: p.z }
    ancorarMenu(ancora)
    p.x = ancora.x
    p.y = ancora.y
    p.z = ancora.z
    p.vy = 0
    voando.value = true
    porPitch(-0.3)
    soltarPonteiro()
  }

  /**
   * Sair do menu é POUSAR, não desligar o voo e deixar cair. A primeira versão
   * largava o jogador a ~40 blocos do chão.
   */
  async function sairDoMenu() {
    menuAberto.value = false
    ancorarMenu(null)
    porPitch(-0.05)
    await pousarSeguro()
    voando.value = false
  }

  /**
   * Acha o chão de verdade e zera a queda.
   *
   * ⚠️ MESMA política do boot, e não uma cópia com piso 1. Esta função roda
   * DEPOIS do boot e reposiciona o jogador: com piso 1 ela desfazia o pouso
   * correto e o enterrava numa caverna.
   */
  async function pousarSeguro() {
    voando.value = true
    p.vy = 0
    await esperarOChaoChegar(7000)
    const { top, safe: chao } = chaoParaNascer()
    if (chao) {
      p.x = chao.x
      p.y = chao.y
      p.z = chao.z
    } else if (Number.isFinite(top)) {
      p.y = top + 1
    }
    p.vy = 0
    p.fallStart = p.y
    // Olhar pro lado ABERTO. Pousar certo e nascer de cara numa parede de terra
    // é a mesma primeira impressão ruim de cair do céu (print 50 do QA 20/08).
    const w = mundo()
    porYaw(regras.melhorVista(w.solidAt, p.x, p.y, p.z))
    porPitch(-0.05)
    w.setPlayerPosition(p.x, p.y, p.z)
  }

  /** "Continuar": volta pra onde o save mandou o jogador estar. */
  async function comecarDoSave() {
    const salvo = lerSalvo()
    if (salvo) {
      p.x = salvo.x
      p.y = salvo.y
      p.z = salvo.z
      p.vy = 0
      p.fallStart = p.y
      mundo().setPlayerPosition(p.x, p.y, p.z)
    }
    return sairDoMenu()
  }

  /**
   * Mundo novo: semente nova, inventário e sobrevivência do zero. O save antigo
   * só morre quando o autosave rodar — até lá dá pra fechar o app e não perder
   * nada.
   */
  async function comecarMundoNovo() {
    semente.value = Math.floor(1 + Math.random() * 999999)
    porTicks(1000)
    Object.assign(sobrevivencia, regras.createSurvivalState())
    inventario.value =
      modo.value === 'creative' ? regras.creativeStarter() : regras.survivalStarter()
    slotEscolhido.value = 0
    entidades.limpar()
    porRuido(regras.createNoiseContext(semente.value))
    const sp = regras.findSpawn(lerRuido())
    p.x = sp.x
    p.z = sp.z
    // +2, não +40: o mundo ainda vai ser gerado, e `pousarSeguro` corrige a
    // altura com o topo REAL depois que o chunk chegar.
    p.y = sp.y + 2
    p.vy = 0
    p.fallStart = p.y
    mundo().reset(semente.value, null)
    porSalvo({ x: p.x, y: p.y, z: p.z })
    temSave.value = true
    diaDoSave.value = 1
    return sairDoMenu()
  }

  return {
    mundoDoNascimento,
    chaoParaNascer,
    esperarOChaoChegar,
    entrarNoMenu,
    sairDoMenu,
    pousarSeguro,
    comecarDoSave,
    comecarMundoNovo,
    // Só pra quem precisa ler o relógio sem importar o componente inteiro.
    instante: lerTicks,
    guinada: lerYaw,
    inclinacao: lerPitch,
  }
}
