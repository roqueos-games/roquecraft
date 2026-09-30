// RoqueCraft - persistência do mundo pessoal na conta, pela capacidade `progresso`.
//
// O mundo é INFINITO, então salvar voxels está fora de questão. O que se salva
// é a SEMENTE (o terreno é reproduzível) + os EDITS do jogador + o estado do
// personagem. Um jogador que construiu bastante ocupa alguns milhares de
// entradas; o doc segue muito abaixo do limite de 1 MB do Firestore.
//
// Doc: users/{uid}/roqueos/roquecraft (o padrão de dados por-usuário do RoqueOS).
// Quem escolhe o documento agora é o host (`progresso`): o jogo não conhece
// Firestore nem uid. O documento e os campos são os de antes da extração.
//
// Os edits vêm de `serializeEdits(world)`: um array plano [cx, cz, li, id, ...].
// `li` é o índice local dentro da coluna do chunk - mais compacto que x,y,z e já
// é a chave que o pipeline usa.

import { deserializeEdits } from './chunkStore.js'
import { MOB_TYPES, MAX_MOBS } from './mobs.js'
import { ofertasParaSave } from './comercio.js'
import { npcParaSave } from './npc.js'
import { serializeInventory, deserializeInventory } from './inventory.js'
import { serializeSurvival, deserializeSurvival } from './survival.js'
import { efeitosParaSave, efeitosDoSave } from './efeitos.js'
import { semListaDentroDeLista, comListaDentroDeLista } from './documentoDoSave.js'

/** A dimensão em que todo mundo está hoje. O Nether e o End entram por aqui. */
export const DIMENSAO_PADRAO = 'overworld'

/**
 * Versão do gerador de terreno.
 *
 * ⚠️ ELA SÓ SOBE QUANDO O TERRENO MUDA, e é o que permite mudar a geração sem
 * mexer no mundo de quem já construiu: um save com `generatorVersion: 1` pede o
 * gerador 1, para sempre. Sem isso, melhorar a worldgen é trocar o chão debaixo
 * da casa do jogador — que é o motivo de a worldgen estar congelada na prática.
 */
export const GERADOR_ATUAL = 1

import { normalizeTicks } from './daycycle.js'
import { TETO_DO_PAYLOAD } from './edicoes.js'

// Teto de segurança: 60k edits ≈ 240k números ≈ bem dentro do limite do doc.
export const MAX_SAVED_EDITS = 60000

// Ponto só é ponto com os três números finitos. Um `{x: NaN}` gravado no save
// vira um renascimento em lugar nenhum, e o jogador cai do mundo ao morrer —
// falha silenciosa que só aparece na pior hora possível.
const pontoValido = (p) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)

/**
 * ITEM NO CHÃO, pronto pra gravar.
 *
 * ⚠️ TETO DE 400, e ele existe pela mesma razão que o teto das edições: um
 * jogador que exploda uma montanha em modo criativo espalha milhares de itens
 * pelo chão, e o documento do save tem limite. Perder os últimos itens de uma
 * bagunça é muito melhor que perder o save inteiro num autosave silencioso.
 *
 * A ORDEM da lista é a de queda, então o teto descarta os mais NOVOS. Isso é
 * deliberado: o que o jogador largou primeiro é o que ele provavelmente
 * organizou, e o que caiu por último é entulho de explosão.
 *
 * O `age` vai junto porque item some sozinho depois de 240 s. Sem gravar a
 * idade, recarregar o mundo daria vida nova a tudo que estava quase sumindo —
 * e o chão de uma base antiga viraria um depósito permanente.
 */
const TETO_DE_ITENS_NO_CHAO = 400
const serializarDrops = (drops) =>
  (Array.isArray(drops) ? drops : [])
    .filter(
      (d) =>
        d &&
        typeof d.item === 'string' &&
        [d.x, d.y, d.z].every((n) => Number.isFinite(n)) &&
        d.count > 0,
    )
    .slice(0, TETO_DE_ITENS_NO_CHAO)
    .map((d) => ({
      i: d.item,
      n: Math.min(64, Math.round(d.count)),
      x: Number(d.x.toFixed(2)),
      y: Number(d.y.toFixed(2)),
      z: Number(d.z.toFixed(2)),
      a: Math.round(d.age || 0),
    }))

const desserializarDrops = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter((d) => d && typeof d.i === 'string' && [d.x, d.y, d.z].every((n) => Number.isFinite(n)))
    .slice(0, TETO_DE_ITENS_NO_CHAO)
    .map((d) => ({
      item: d.i,
      count: Number.isFinite(d.n) ? Math.max(1, Math.min(64, d.n)) : 1,
      x: d.x,
      y: d.y,
      z: d.z,
      age: Number.isFinite(d.a) ? Math.max(0, d.a) : 0,
    }))

/**
 * CRIATURA VIVA, pronta pra gravar.
 *
 * O que estava montado antes: o mundo guardava o terreno, os baús, a cama e até
 * o item caído no chão — e esquecia o rebanho. Você cercava um curral, fechava
 * o jogo, voltava, e o curral estava vazio. A vaca não era estado de jogo pro
 * save; era enfeite.
 *
 * ⚠️ O HOSTIL VAI JUNTO, e isso é escolha, não descuido. É o que o original
 * faz — deslogar não evapora o zumbi encostado em você. E o contrário abriria
 * um buraco de verdade: fechar o app com duas vidas viraria botão de fuga, já
 * que a vida do jogador É gravada e a do inimigo não. Quem acorda de dia com um
 * zumbi ao lado vê ele queimar, que é o comportamento certo e já existe
 * (`burnsInSun`).
 *
 * ⚠️ NÃO SE GRAVA A IA — `state`, `timer`, `targetX`, `attackCooldown` ficam de
 * fora. Isso se refaz sozinho no primeiro quadro; gravado, seria ruído ocupando
 * documento e um zumbi restaurado no meio de um bote que não existe mais.
 *
 * O teto é o mesmo `MAX_MOBS` da simulação: gravar mais criatura do que o jogo
 * aceita rodar é gravar lixo que o boot descarta em seguida.
 */
const serializarMobs = (mobs) =>
  (Array.isArray(mobs) ? mobs : [])
    .filter(
      (m) =>
        m &&
        !m.remote &&
        MOB_TYPES[m.type] &&
        [m.x, m.y, m.z].every((n) => Number.isFinite(n)) &&
        m.health > 0,
    )
    .slice(0, MAX_MOBS)
    .map((m) => ({
      t: m.type,
      x: Number(m.x.toFixed(2)),
      y: Number(m.y.toFixed(2)),
      z: Number(m.z.toFixed(2)),
      r: Number((m.yaw || 0).toFixed(2)),
      v: Math.max(1, Math.round(m.health)),
      // v7: FILHOTE e TOSQUIA. Sem os dois, recarregar promovia todo bezerro a
      // vaca adulta e devolvia a lã de toda ovelha tosquiada — o mesmo defeito
      // que a `age` do item no chão teve na v5, e pelo mesmo motivo: era estado
      // de jogo que parecia enfeite.
      b: m.bebe > 0 ? Math.round(m.bebe) : 0,
      l: m.tosquiada ? 1 : 0,
      // v8: DOMÉSTICA. Sem ela, recarregar devolvia o rebanho como fauna
      // qualquer, e a primeira caminhada longa o apagava por distância.
      d: m.domestica ? 1 : 0,
      // v12: O ALDEÃO. Sem estes quatro campos, recarregar devolvia um aldeão
      // SEM PROFISSÃO e SEM OFERTAS — `aldeoesQueFaltam` já contava ele como
      // presente, então nenhum outro nascia no lugar, e a vila inteira virava
      // gente muda que não negocia. O defeito estava lá desde a v6 e ninguém
      // reportou porque parecia decisão de jogo.
      //
      // Só o que NÃO se recalcula viaja: `p` a profissão, `e` o estoque que
      // restava, `n` a amizade e a memória, e `ox`/`oz` o berço — de onde o
      // nome e o sorteio de ofertas saem de novo, iguais, com a mesma semente.
      p: m.profissao || null,
      e: ofertasParaSave(m.ofertas),
      n: m.npc ? npcParaSave(m.npc) : null,
      ox: Number.isFinite(m.origemX) ? Math.round(m.origemX) : 0,
      oz: Number.isFinite(m.origemZ) ? Math.round(m.origemZ) : 0,
    }))

const desserializarMobs = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter((m) => m && MOB_TYPES[m.t] && [m.x, m.y, m.z].every((n) => Number.isFinite(n)))
    .slice(0, MAX_MOBS)
    .map((m) => ({
      type: m.t,
      x: m.x,
      y: m.y,
      z: m.z,
      yaw: Number.isFinite(m.r) ? m.r : 0,
      // Vida acima do máximo do tipo seria um porco de 40 de vida sobrevivendo
      // a quatro machadadas — save corrompido virando trapaça silenciosa.
      health: Number.isFinite(m.v)
        ? Math.max(1, Math.min(MOB_TYPES[m.t].health, Math.round(m.v)))
        : MOB_TYPES[m.t].health,
      bebe: Number.isFinite(m.b) ? Math.max(0, m.b) : 0,
      tosquiada: !!m.l,
      domestica: !!m.d,
      // v12: o que o aldeão era. Só os campos crus — quem os transforma em
      // ofertas e em pessoa é `reidratarAldeoes`, que precisa da SEMENTE e não
      // a tem aqui. Save antigo cai em `null`, e a reidratação dá conta.
      profissao: typeof m.p === 'string' ? m.p : null,
      estoqueSalvo: Array.isArray(m.e) ? m.e : null,
      npcSalvo: m.n && typeof m.n === 'object' ? m.n : null,
      origemX: Number.isFinite(m.ox) ? m.ox : Math.round(m.x),
      origemZ: Number.isFinite(m.oz) ? m.oz : Math.round(m.z),
    }))

/**
 * O que sobra do teto do payload para as OUTRAS dimensões.
 *
 * ⚠️ A DIMENSÃO ONDE O JOGADOR ESTÁ TEM PRIORIDADE, e isso é uma escolha. O teto
 * de 240.000 números não dobrou por existir uma segunda dimensão: ele é o que o
 * documento aguenta. Dividir meio a meio truncaria o mundo de quem nunca foi ao
 * Nether; dar tudo ao atual apagaria o Nether de quem está nele. Quem está sendo
 * jogado agora enche primeiro, o resto divide a sobra — e truncar é pior que
 * gravar tudo, mas muito melhor que perder o save inteiro.
 */
export function recortarOutrasDimensoes(edits, outras) {
  if (!Array.isArray(outras) || !outras.length) return []
  let sobra = Math.max(0, TETO_DO_PAYLOAD - (edits?.length || 0))
  const saida = []
  for (const [id, lista] of outras) {
    if (sobra <= 0) break
    if (!Array.isArray(lista) || !lista.length) continue
    const recorte = lista.length <= sobra ? lista : lista.slice(0, sobra - (sobra % 4))
    if (!recorte.length) break
    saida.push([id, recorte])
    sobra -= recorte.length
  }
  return saida
}

export function buildSavePayload({
  worldId,
  dimensionId,
  generatorVersion,
  seed,
  edits,
  outrasDimensoes,
  player,
  inventory,
  survival,
  efeitos,
  ticks,
  mode,
  hotbar,
  settings,
  mobilia,
  renascimento,
  drops,
  mobs,
  dragaoMorto,
}) {
  return semListaDentroDeLista({
    // v3: entra `mobilia` — o conteúdo de baú e fornalha, que não cabe no
    // `Uint8Array` de id puro do mundo. `parseSave` continua lendo v1 e v2.
    // v4: entra `renascimento` — a cama. Sem ele, dormir grava um ponto que
    // some no primeiro recarregamento, e o jogador descobre isso morrendo.
    // v5: entra `drops` — item no chão. Era estado de JOGO tratado como
    // efêmero: você quebrava um baú cheio, o telefone tocava, e ao voltar o
    // chão estava limpo. A auditoria de 24/08 achou isso olhando quais `let`
    // eram estado de jogo e não estavam no save.
    // v6: entram os `mobs` — o rebanho. Era o último estado de jogo de fora:
    // você cercava um curral, fechava o app, e voltava pra um curral vazio.
    // v7: entram FILHOTE e TOSQUIA. A pecuária chegou logo depois da v6, e sem
    // esses dois campos recarregar promovia todo bezerro a adulto e devolvia a
    // lã de toda ovelha tosquiada.
    // v8: entra `domestica` — a marca de quem o jogador criou. Sem ela o
    // rebanho voltava como fauna qualquer e a primeira caminhada longa o
    // apagava por distância, em silêncio.
    // v9: entram a IDENTIDADE e a VERSÃO DO GERADOR. Semente não identifica um
    // mundo — dois mundos diferentes podem ter a mesma, e é isso que fazia
    // "solo → sala → solo" comparar seed e achar que era a mesma sessão
    // (RC-03). E sem `generatorVersion` não há como mudar a geração sem mudar
    // o terreno debaixo de quem já construiu: com ela, mundo antigo continua
    // gerando pelo gerador antigo, e só mundo novo usa o novo.
    //
    // `dimensionId` entra agora, valendo 'overworld' para todo mundo, porque o
    // dia em que o Nether existir o save já vai saber dizer onde o jogador
    // estava — e migrar save NAQUELE dia seria migrar às cegas.
    // v10: entra `outrasDimensoes` — as edições das dimensões em que o jogador
    // NÃO está. Enquanto o save tinha um mapa só, gravar estando no Nether
    // escreveria a caverna por cima do mundo, e a saída provisória foi recusar
    // a gravação fora do overworld: construir lá valia pela sessão. Agora vale
    // de verdade. Save v9 não tem o campo, e não precisa: quem o gravou estava
    // no overworld e não tinha para onde ir.
    // v11: entra `efeitos` — as poções com prazo. Elas não cabem em `survival`
    // porque não são estado de corpo: `serializeSurvival` grava vida, fome e
    // fôlego, que existem sempre; um efeito é uma lista que quase sempre está
    // vazia, e é isso que a deixa custar ZERO no save de quem não bebeu nada.
    // v12: entra O ALDEÃO — profissão, estoque, amizade e berço. Ver o comentário
    // dentro de `serializarMobs`: sem eles a vila voltava muda do save.
    // v13: NENHUMA LISTA DENTRO DE LISTA. O v12 tinha quatro (inventário,
    // outras dimensões, efeitos, conteúdo da mobília) e o Firestore recusa
    // todas: qualquer item na mão, ou o primeiro portal, e o mundo parava de
    // gravar na conta em silêncio. A regra é uma só e está em
    // `documentoDoSave.js`: lista dentro de lista vira `{ _a: [...] }` na ida
    // (aqui) e volta a lista em `parseSave`, que continua lendo o v12.
    version: 13,
    worldId: worldId || `w${seed}`,
    dimensionId: dimensionId || DIMENSAO_PADRAO,
    generatorVersion: Number.isFinite(generatorVersion) ? generatorVersion : GERADOR_ATUAL,
    seed,
    mode: mode === 'creative' ? 'creative' : 'survival',
    edits: edits || [],
    outrasDimensoes: recortarOutrasDimensoes(edits, outrasDimensoes),
    player: player
      ? {
          x: Number(player.x.toFixed(2)),
          y: Number(player.y.toFixed(2)),
          z: Number(player.z.toFixed(2)),
          yaw: Number((player.yaw || 0).toFixed(3)),
          pitch: Number((player.pitch || 0).toFixed(3)),
        }
      : null,
    inventory: inventory ? serializeInventory(inventory) : [],
    survival: survival ? serializeSurvival(survival) : null,
    // `null` quando não há nenhum, e é a forma que mantém o save pequeno: o
    // mundo sem poção nenhuma grava a chave com `null` e nada mais.
    efeitos: efeitosParaSave(efeitos),
    ticks: Math.round(normalizeTicks(ticks || 0)),
    hotbar: Number.isFinite(hotbar) ? hotbar : 0,
    settings: settings
      ? {
          renderDistance: settings.renderDistance,
          quality: settings.quality,
          fov: settings.fov,
          sensitivity: settings.sensitivity,
          autoJump: !!settings.autoJump,
          viewBob: settings.viewBob !== false,
          showStats: !!settings.showStats,
          sound: !!settings.sound,
          minimapa: settings.minimapa !== false,
          skin: typeof settings.skin === 'string' ? settings.skin : '',
        }
      : null,
    // Só a mobília com alguma coisa dentro é gravada (ver `serializarMobilia`):
    // mil baús vazios não podem inflar o documento.
    mobilia: Array.isArray(mobilia) ? mobilia : [],
    // Ponto de renascimento da cama, ou null pra nascer onde o mundo manda.
    renascimento: pontoValido(renascimento)
      ? {
          x: Number(renascimento.x.toFixed(2)),
          y: Number(renascimento.y.toFixed(2)),
          z: Number(renascimento.z.toFixed(2)),
        }
      : null,
    // O dragão caiu neste mundo? Save antigo não tem: `false`, e ele está lá.
    dragaoMorto: !!dragaoMorto,
    // Item no chão. Save antigo não tem, e `[]` é a resposta certa.
    drops: serializarDrops(drops),
    // O rebanho e quem estiver caçando ele.
    mobs: serializarMobs(mobs),
    updatedAt: Date.now(),
  })
}

/**
 * Gravar e ler o mundo, sobre `host.progresso`. Os nomes e o comportamento são
 * os de antes da extração, quando isto era `setDoc`/`getDoc` do Firestore:
 *
 * - `saveRoqueCraft(payload)` SUBSTITUI o documento (sem `mesclar`), como o
 *   `setDoc` sem merge substituía. Sem onde guardar (convidado), devolve false
 *   sem tentar, como o `if (!uid)`. Recusa do host LANÇA, como o `setDoc`
 *   lançava: é o que manda a falha para o `aoFalhar` do autosave em vez de
 *   contá-la como gravação.
 * - `loadRoqueCraft()` devolve o save já passado pelo `parseSave`, ou null
 *   quando não há save. Quando NÃO CONSEGUE LER, rejeita (o host rejeita com
 *   `.codigo = 'indisponivel'`), e é essa rejeição que o RC-02 precisa para não
 *   gravar um mundo vazio por cima do salvo (ver `cargaDoSave.js`).
 *
 * O uid saiu dos dois: quem sabe se há conta é o host (`disponivel()`).
 *
 * @param {object | undefined} progresso a capacidade `progresso` do host
 */
export function criarSaveDoRoqueCraft(progresso) {
  const disponivel = () => Boolean(progresso?.disponivel())
  return {
    disponivel,

    async saveRoqueCraft(payload) {
      if (!disponivel()) return false
      if (!(await progresso.salvar(payload))) {
        throw new Error('o host recusou o save do RoqueCraft (veja o aviso do host no console)')
      }
      return true
    },

    async loadRoqueCraft() {
      if (!disponivel()) return null
      const dados = await progresso.carregar()
      if (!dados) return null
      return parseSave(dados)
    },
  }
}

// Toda leitura passa por aqui: um save de versão antiga (ou corrompido) NÃO pode
// derrubar o jogo. Campo faltando vira padrão, campo absurdo vira padrão.
/**
 * A identidade do mundo que está abrindo.
 *
 * Save carregado já vem com os três campos (o `parseSave` preenche os antigos);
 * mundo NOVO não tem save nenhum, e aí a identidade nasce da semente sorteada.
 * `w<semente>` e não um sorteio próprio: enquanto cada jogador tem um mundo só,
 * derivar é estável e dispensa guardar estado antes da primeira gravação.
 */
export function identidadeDe(salvo, semente) {
  return {
    worldId: salvo?.worldId || `w${semente}`,
    dimensionId: salvo?.dimensionId || DIMENSAO_PADRAO,
    generatorVersion: Number.isFinite(salvo?.generatorVersion)
      ? salvo.generatorVersion
      : GERADOR_ATUAL,
  }
}

export function parseSave(documento) {
  if (!documento || typeof documento !== 'object') return null
  // v13 chega com `{ _a: [...] }` onde havia lista dentro de lista; v12 e
  // anteriores chegam sem, e voltam iguais. Depois daqui, um formato só.
  const data = comListaDentroDeLista(documento)
  const seed = Number.isFinite(data.seed) ? data.seed : 1
  return {
    version: data.version || 1,
    // ⚠️ SAVE ANTIGO GANHA IDENTIDADE DERIVADA DA SEMENTE, e não sorteada.
    //
    // Sorteio aqui daria um id novo a cada leitura enquanto o jogador não
    // salvasse — e duas leituras do MESMO mundo com ids diferentes é
    // exatamente o que a identidade existe para impedir. `w<seed>` é estável,
    // e é verdade para o único mundo que cada jogador tem hoje.
    worldId: typeof data.worldId === 'string' && data.worldId ? data.worldId : `w${seed}`,
    dimensionId:
      typeof data.dimensionId === 'string' && data.dimensionId ? data.dimensionId : DIMENSAO_PADRAO,
    // Save sem o campo foi gerado pelo gerador 1, que é o único que existiu.
    generatorVersion: Number.isFinite(data.generatorVersion) ? data.generatorVersion : 1,
    seed,
    mode: data.mode === 'creative' ? 'creative' : 'survival',
    edits: deserializeEdits(Array.isArray(data.edits) ? data.edits : []),
    // Save v9 ou anterior não tem o campo: lista vazia, e o jogador continua
    // com o mundo que ele tinha. Migração sem migrador.
    outrasDimensoes: (Array.isArray(data.outrasDimensoes) ? data.outrasDimensoes : [])
      .filter((par) => Array.isArray(par) && typeof par[0] === 'string' && Array.isArray(par[1]))
      .map(([id, lista]) => [id, deserializeEdits(lista)]),
    player:
      data.player && [data.player.x, data.player.y, data.player.z].every((n) => Number.isFinite(n))
        ? {
            x: data.player.x,
            y: data.player.y,
            z: data.player.z,
            yaw: Number.isFinite(data.player.yaw) ? data.player.yaw : 0,
            pitch: Number.isFinite(data.player.pitch) ? data.player.pitch : 0,
          }
        : null,
    inventory: deserializeInventory(data.inventory),
    survival: deserializeSurvival(data.survival),
    // Save v1..v10 não tem efeito: mapa vazio, que é o estado em que foi
    // gravado. `efeitosDoSave` também prende o prazo ao teto — save adulterado
    // dava velocidade por trinta e um anos.
    efeitos: efeitosDoSave(data.efeitos),
    ticks: Number.isFinite(data.ticks) ? normalizeTicks(data.ticks) : 1000,
    hotbar: Number.isFinite(data.hotbar) ? Math.max(0, Math.min(8, data.hotbar)) : 0,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : null,
    // Save antigo não tem: vira lista vazia, e o mundo carrega sem mobília —
    // que é exatamente o estado em que ele foi salvo.
    mobilia: Array.isArray(data.mobilia) ? data.mobilia : [],
    // Save antigo (v1..v3) não tem cama, e `null` é a resposta certa: nasce
    // onde o mundo manda, como sempre nasceu.
    renascimento: pontoValido(data.renascimento) ? { ...data.renascimento } : null,
    dragaoMorto: data.dragaoMorto === true,
    // Save v1..v4 não tem item no chão: lista vazia, que é exatamente o estado
    // em que esses mundos foram gravados.
    drops: desserializarDrops(data.drops),
    // Save v1..v5 não tem rebanho: lista vazia. O mundo repovoa sozinho pelas
    // regras de spawn, então o jogador antigo não perde nada — só não reencontra
    // exatamente as mesmas vacas.
    mobs: desserializarMobs(data.mobs),
  }
}
