// GANCHO DE QA: AS CRIATURAS.
//
// Nascer uma criatura onde a sonda quer, listar as que existem, limpar tudo, e
// enquadrar o grupo pra foto. Espelha `mobs.js` e `pecuaria.js`.
//
// ⚠️ `mobs` É REATRIBUÍDA. `limparMobs` faz `mobs = []` no componente, e é por
// isso que a lista entra por GETTER e o esvaziar volta por FUNÇÃO. Receber o
// array e chamar `.length = 0` funcionaria hoje e quebraria no dia em que o
// componente trocasse a lista - o mesmo silêncio do resto da rule 44.
//
// ⚠️ `yaw` e `pitch` são variáveis de módulo do componente. `frameMobs` MIRA no
// centroide, então precisa escrever nelas - e escrever numa cópia deixaria a
// câmera olhando pro lado errado sem nenhum vermelho. A escrita volta por
// `olhar(y, p)`, o mesmo contrato de `qaDeNavegacao`.
//
// É SERVIÇO E NÃO COMPOSABLE: nada aqui guarda temporizador nem assinatura.

import { MOB_TYPES, createMob, hurtMob } from './mobs.js'
import { blockDef } from './blocks.js'

/**
 * @param {object} ctx
 * @param {() => Array} ctx.mobs  GETTER: a lista é reatribuída em `limparMobs`
 * @param {() => void} ctx.esvaziarMobs  quem reatribui é o componente
 * @param {() => object} ctx.world  GETTER: mundo novo recria o cliente
 * @param {object} ctx.player  o objeto vivo (nunca reatribuído)
 * @param {import('vue').Ref<boolean>} ctx.flying
 * @param {() => number} ctx.yaw  GETTER: variável de módulo do componente
 * @param {(y: number, p: number) => void} ctx.olhar  a escrita volta pro dono
 * @param {(alcance?: number) => object|null} ctx.mobMirado  a mira DO JOGO
 */
export function criarQaDeMobs({
  mobs,
  esvaziarMobs,
  world,
  player,
  flying,
  yaw,
  olhar,
  mobMirado,
}) {
  return {
    // Que criaturas existem agora, por tipo. `state.mobs` só dá a contagem, e
    // contagem não distingue porco de zumbi - que é exatamente a pergunta da
    // rodada que ligou a luz.
    criaturas: () =>
      mobs().map((m) => ({
        tipo: m.type,
        x: m.x,
        y: m.y,
        z: m.z,
        // A hostilidade mora na DEFINIÇÃO, não na instância. Sem expô-la aqui,
        // a sonda da cama não tem como montar a cena "tem monstro por perto"
        // sem adivinhar quais tipos são hostis.
        hostil: !!MOB_TYPES[m.type]?.hostile,
      })),

    mobsInfo: () =>
      mobs().map((m) => ({
        id: m.id,
        type: m.type,
        vida: m.health,
        x: +m.x.toFixed(2),
        y: +m.y.toFixed(2),
        z: +m.z.toFixed(2),
        // O pavio do creeper. Sem ele a sonda teria que adivinhar QUANDO
        // fotografar o bicho inchado, e fotografaria um creeper calmo achando
        // que estava fotografando um aceso - instrumento concordando com o
        // defeito, de novo.
        pavio: +(m.pavio || 0).toFixed(2),
        // Comércio: a sonda da aldeia precisa saber QUAL aldeão é qual, e
        // separar "não tem ofertas" de "não abriu a tela".
        profissao: m.profissao || null,
        ofertas: m.ofertas?.length || 0,
        // Pecuária. A sonda precisa dos três pra separar "o clique não chegou
        // na criatura" de "chegou e a regra recusou" - sem eles, um `place()`
        // que devolve `false` não diz qual dos dois aconteceu.
        amor: +(m.amor || 0).toFixed(1),
        bebe: +(m.bebe || 0).toFixed(1),
        tosquiada: !!m.tosquiada,
      })),

    // QUEM o jogo acha que está sob a mira, pela mira DELE.
    //
    // ⚠️ Existe porque `place()` devolvendo `false` é ambíguo: pode ser "o raio
    // não pegou bicho nenhum" ou "pegou e a regra recusou". Sem separar os dois,
    // uma sonda vermelha manda consertar a metade errada - e eu já mandei.
    miradoQA: () => mobMirado()?.id ?? null,

    limparMobs: () => {
      const n = mobs().length
      esvaziarMobs()
      return n
    },

    // Nasce NA FRENTE da camera, a distancia e desvio lateral pedidos. A versao
    // antiga colocava todo mundo em (x+3, z) - as sete criaturas empilhavam no
    // mesmo ponto e o print do QA mostrava um zumbi cortado na borda do quadro.
    spawnMob: (type, dist = 4, side = 0) => {
      // `yaw` e variavel do modulo, NAO campo de `player`. Ler player.yaw dava
      // undefined -> Math.sin(undefined) = NaN -> a criatura nascia em coordenada
      // NaN, sumia do mundo e ainda contaminava a posicao do jogador quando o QA
      // enquadrava pelo centroide (QA de 2026-08-19).
      const fx = Math.sin(yaw())
      const fz = -Math.cos(yaw())
      const x = player.x + fx * dist + fz * -side
      const z = player.z + fz * dist + fx * side
      const w = world()
      // Desce por folhagem: `surfaceY` devolve o topo SOLIDO, e folha e solida -
      // a ovelha nascia em cima da copa da arvore (QA de 2026-08-19).
      let top = w.surfaceY(Math.floor(x), Math.floor(z))
      if (Number.isFinite(top)) {
        let guarda = 0
        while (guarda++ < 24 && blockDef(w.getBlock(Math.floor(x), top - 1, Math.floor(z)))?.cutout)
          top--
      }
      const m = createMob(type, x, (Number.isFinite(top) ? top : player.y) + 1, z, 7)
      if (m) mobs().push(m)
      return !!m
    },

    /**
     * Manda a primeira criatura do tipo ANDAR até (x, z): estado `wander` com
     * alvo fixo e timer longo, pelo mesmo caminho que o vagueio usa.
     *
     * ⚠️ A SONDA DA PORTA PRECISA DE UM ALDEÃO QUE VÁ PARA A PORTA, não de um
     * que talvez vá. Sem isto o teste era uma loteria de vagueio: em 60 s ele
     * abria a porta e voltava sem passar, e a sonda acusava a IA por um sorteio.
     * Devolve `false` se não há criatura do tipo.
     */
    mandarMob: (tipo, x, z) => {
      const m = mobs().find((c) => c.type === tipo)
      if (!m || !Number.isFinite(x) || !Number.isFinite(z)) return false
      m.state = 'wander'
      m.timer = 99
      m.targetX = x
      m.targetZ = z
      return true
    },

    /**
     * Fere a criatura pelo MESMO `hurtMob` do jogo (o passo seguinte a tira
     * da lista e dispara o que a morte dela dispara). Existe pelo dragão: 200
     * de vida a golpe de espada seriam dois minutos de sonda por nada.
     */
    ferirMob: (tipo, quanto) => {
      const m = mobs().find((c) => c.type === tipo)
      if (!m || !Number.isFinite(quanto)) return null
      hurtMob(m, quanto, true)
      return m.health
    },

    // Enquadra o GRUPO de criaturas: acha o centroide, poe a camera a `dist`
    // blocos dele e mira. Enquadrar "recuando o que ja estava" nao funciona -
    // a camera recua junto com o referencial e o leque some no matagal.
    frameMobs: (dist = 10, up = 4.5) => {
      const lista = mobs()
      if (!lista.length) return false
      const validos = lista.filter((m) => Number.isFinite(m.x) && Number.isFinite(m.z))
      if (!validos.length) return false
      let cx = 0
      let cy = 0
      let cz = 0
      for (const m of validos) {
        cx += m.x
        cy += m.y
        cz += m.z
      }
      cx /= validos.length
      cy /= validos.length
      cz /= validos.length
      // camera atras do centroide, na direcao oposta ao olhar atual
      const fx = Math.sin(yaw())
      const fz = -Math.cos(yaw())
      player.x = cx - fx * dist
      player.z = cz - fz * dist
      player.y = cy + up
      player.vy = 0
      flying.value = true
      // Mira EXPLICITA no centroide. Confiar no yaw anterior deixava o grupo no
      // canto do quadro quando o centroide nao estava exatamente na frente.
      olhar(Math.atan2(cx - player.x, -(cz - player.z)), -Math.atan2(up, dist))
      world()?.setPlayerPosition(player.x, player.y, player.z)
      return { cx, cy, cz, n: validos.length }
    },
  }
}
