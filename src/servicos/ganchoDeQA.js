// RoqueCraft - O GANCHO DE QA: `window.__roquecraft`.
//
// ⚠️ ESTE CORTE E POR AUDIENCIA, NAO POR CONTAGEM DE DEPENDENCIA.
//
// A rule 44 diz que um corte com mais de uma duzia de dependencias esta no
// lugar errado, e este tem dezenas. A regra continua valendo pro JOGO: ela
// existe pra impedir que logica de jogo vire um contexto de quarenta fios.
//
// Aqui a situacao e outra. Este arquivo nao e jogo: e a superficie de TESTE, e
// a natureza dela e ser larga - ela expoe o jogo inteiro pras sondas, e por
// isso conhece o jogo inteiro. O que se ganha movendo nao e desacoplamento; e
// tirar 330 linhas de andaime de dentro do componente de producao. Ninguem mais
// no componente le uma linha disto.
//
// ⚠️ O CONTEXTO TEM DUAS METADES, E A DIFERENCA IMPORTA.
//
// `vivo` e um objeto de ACESSORES (`get`/`set`), nao de valores: `engine`,
// `world`, `ticks`, `yaw`, `pitch` e companhia sao `let` do componente,
// recriados em troca de qualidade e em mundo novo. Lendo por acessor, o gancho
// fala sempre com o motor VIVO; capturando o valor, ele passaria a sessao
// inteira falando com o motor morto (rule 44).
//
// O resto vem por desestruturacao porque sao objetos estaveis (refs, reativos,
// filas) ou funcoes.

import { emModoE2E } from '@roqueos-games/jogo-sdk'
import { findSpawn } from './worldgen.js'
import { auditarMalhaViva } from './auditoriaDeMalha.js'
import { criarQaDeCena } from './qaDeCena.js'
import { criarQaDeNavegacao } from './qaDeNavegacao.js'
import { criarQaDeSom } from './qaDeSom.js'
import { criarQaDeInventario } from './qaDeInventario.js'
import { criarQaDeMira } from './qaDeMira.js'
import { criarQaDeTerreno } from './qaDeTerreno.js'
import { criarQaDeAldeia } from './qaDeAldeia.js'
import { criarQaDoGoal20 } from './qaDoGoal20.js'
import { criarQaDeFluidos } from './qaDeFluidos.js'
import { criarQaDeQuedas } from './qaDeQuedas.js'
import { criarQaDeMobs } from './qaDeMobs.js'
import { addXp } from './survival.js'
import { criarQaDeCombate } from './qaDeCombate.js'
import { criarQaDeEntrada } from './qaDeEntrada.js'
import { criarQaDeTempo } from './qaDeTempo.js'
import { fortalezaDaSemente } from './geradores.js'
import { centroDoAnelDe } from './fortaleza.js'

/**
 * Instala `window.__roquecraft`. Inerte em producao: sai na primeira linha.
 *
 * @param {object} ctx
 * @param {object} ctx.vivo  acessores do que e recriado (ver o bloco acima)
 * @returns {() => void} desinstala o gancho
 */
export function montarGanchoDeQA(ctx) {
  if (!emModoE2E()) return () => {}
  const V = ctx.vivo
  const {
    player,
    entidades,
    flying,
    survival,
    underwater,
    fatalError,
    mp,
    seed,
    currentTarget,
    filaDeAtualizacoes,
    mundoVivo,
    inventory,
    loading,
    settings,
    mode,
    startFromSave,
    menuOpen,
    destravarAudio,
    profundidadeDoOlho,
    applyEdit,
    editsMap,
    visitarCelula,
    quedasNoAr,
    tickQuedas,
    keys,
    doPlace,
    tryInteract,
    breakBlock,
    climaDoJogo,
    climaAgora,
    mobMirado,
    tryAttack,
    hurt,
    guardaLevantada = () => false,
    heldItem,
    avisarMobilia,
    toggleInventory,
    pickBlock,
    soltarItem,
    biomeLabel,
    fps,
    dormir,
    avisoDaCama,
    pontoDeRenascimento,
    respawnPlayer,
    enterMenu,
    startNewWorld,
    montarPayloadDeSave,
    openLobby,
    togglePause,
    setMode,
    applySettings,
    aberto,
    selectedSlot,
  } = ctx

  const qaDeSom = criarQaDeSom({ audio: () => V.audio, destravar: destravarAudio })
  const qaDeNavegacao = criarQaDeNavegacao({
    engine: () => V.engine,
    world: () => V.world,
    player,
    noiseCtx: () => V.noiseCtx,
    flying: () => flying,
    yaw: () => V.yaw,
    pitch: () => V.pitch,
    olhar: (y, p) => {
      V.yaw = y
      V.pitch = p
    },
  })
  const qaDeCena = criarQaDeCena({
    engine: () => V.engine,
    world: () => V.world,
    profundidadeDoOlho,
    submerso: () => underwater.value,
  })
  const qaDeMira = criarQaDeMira({
    engine: () => V.engine,
    world: () => V.world,
    currentTarget,
  })
  const qaDeTerreno = criarQaDeTerreno({
    world: () => V.world,
    ticks: () => V.ticks,
    applyEdit,
    editsMap,
  })
  // ⚠️ UMA DEPENDÊNCIA, e a sonda deixa de cravar coordenada no fonte. Ver a
  // nota de abertura de `qaDeAldeia.js`.
  const qaDeAldeia = criarQaDeAldeia({ seed })
  const qaDoGoal20 = criarQaDoGoal20({ engine: () => V.engine })
  const qaDeFluidos = criarQaDeFluidos({
    world: () => V.world,
    player,
    survival,
    submerso: underwater,
    fila: filaDeAtualizacoes,
    visitarCelula,
  })
  const qaDeQuedas = criarQaDeQuedas({
    engine: () => V.engine,
    quedasNoAr,
    fila: filaDeAtualizacoes,
    tickQuedas,
    // O par getter/setter agora e do proprio `mundoVivo`, que e o dono do
    // interruptor: o componente so repassa.
    congelado: mundoVivo.congelado,
    congelar: mundoVivo.congelar,
  })
  const qaDeEntrada = criarQaDeEntrada({
    keys,
    world: () => V.world,
    player,
    yaw: () => V.yaw,
    flying,
    currentTarget,
    doPlace,
    tryInteract,
    breakBlock,
    // GETTER: `entrada` é montada DEPOIS do gancho no componente (ver o `lazy`
    // lá). Passar o valor daria `undefined` pra todo mundo, em silêncio.
    entrada: ctx.entrada,
  })
  const qaDeTempo = criarQaDeTempo({
    // A escrita em `V.ticks` volta pro dono: é `let` deste módulo, e o laço do
    // quadro a lê. Escrever numa cópia deixaria `setTime` mentindo.
    andarPara: (v) => {
      V.ticks = v
    },
    engine: () => V.engine,
    world: () => V.world,
    player,
    clima: climaDoJogo,
    agora: climaAgora,
    ticks: () => V.ticks,
    receberRelogio: ctx.receberRelogio,
  })
  const qaDeMobs = criarQaDeMobs({
    mobs: entidades.mobs,
    esvaziarMobs: entidades.limpar,
    world: () => V.world,
    player,
    flying,
    yaw: () => V.yaw,
    olhar: (y, p) => {
      V.yaw = y
      V.pitch = p
    },
    mobMirado,
  })
  const qaDeCombate = criarQaDeCombate({
    // Os três andam a cada quadro: getters, nunca valores.
    restante: () => V.attackCooldown,
    total: () => V.recargaAtual,
    ultimo: () => V.ultimoGolpe,
    atacar: tryAttack,
    // ⚠️ SÓ A ANIMAÇÃO, sem alvo e sem dano. `atacar` depende de mira e de
    // recarga: fotografar o golpe por ele daria um quadro em repouso sempre que
    // não houvesse nada na frente, e foi por isso que a queixa "a movimentação
    // está ruim" nunca teve foto nenhuma para sustentar o veredito.
    golpear: (tipo = 'hit') => V.engine?.viewmodel?.swing(tipo),
    machucar: hurt,
    guardaLevantada,
    survival,
    // XP pelo MESMO caminho do jogo (`addXp`), e não escrevendo `level` na mão:
    // uma sonda que cravasse o nível testaria a própria sonda. A curva é
    // `7 + nivel*2` por degrau, então o laço é quem sabe quando parou.
    darNivel: (alvo) => {
      let guarda = 0
      while (survival.level < alvo && guarda++ < 500) addXp(survival, 7 + survival.level * 2)
      return survival.level
    },
    // GETTER: o mapa de efeitos é dono do composable do corpo, e quem o lê aqui
    // precisa do de AGORA (mundo novo recria o composable).
    efeitos: ctx.efeitos,
    tomarEfeito: ctx.tomarEfeito,
    flechas: entidades.flechas,
  })
  const qaDeInventario = criarQaDeInventario({
    inventory,
    selectedSlot,
    aberto,
    // GETTER: `V.mobilia` é reatribuída em mundo novo. Passar o valor daria ao QA
    // o mapa de mobília do mundo anterior, em silêncio.
    mobilia: () => V.mobilia,
    heldItem,
    avisarMobilia,
    toggleInventory,
    pickBlock,
    soltarItem,
    drops: entidades.drops,
  })
  // AUDITORIA DE MALHA NO JOGO RODANDO.
  //
  // O mesher já foi provado nos testes de unidade — bloco isolado emite as 6
  // faces, e um mundo inteiro gerado e percorrido não perde nenhuma. Mas o
  // teste roda o pipeline INLINE, e o jogo roda em WORKER, com chunk chegando
  // fora de ordem, descarregando atrás do jogador e voltando. É nessa diferença
  // que mora o relato do founder: "para os lados e para trás os blocos estão
  // com faces vazias".
  //
  // Aqui a pergunta é feita à CENA de verdade: toda face que as regras mandam
  // desenhar existe como geometria em `sectionMeshes`?
  //
  // ⚠️ ESCOPO. A auditoria usa o MESMO `faceVisible` do mesher, então ela não
  // julga a regra — julga se a geometria que a regra pede chegou à cena. Um erro
  // DENTRO de `faceVisible` passa por aqui e é pego pelos testes de unidade, que
  // afirmam o resultado esperado à mão.
  //
  // A primeira versão disto só olhava bloco opaco e cheio, e por isso não teria
  // visto a queixa do gelo ("blocos de gelo sem a parte das laterais e inferior")
  // nem a da camada de neve — as duas caem fora daquele recorte. Agora cobre
  // todas as classes, e a atribuição de plano trata laje e lâmina d'água, cujas
  // faces não caem em coordenada inteira.
  window.__roquecraft = {
    get state() {
      return {
        ready: !loading.value && !fatalError.value,
        error: fatalError.value || null,
        chunks: V.world?.loadedCount || 0,
        sections: V.engine?.sectionMeshes.size || 0,
        drawCalls: V.engine?.drawCalls || 0,
        triangles: V.engine?.triangles || 0,
        quality: settings.quality,
        usingWorker: !!V.world?.usingWorker,
        player: { x: player.x, y: player.y, z: player.z },
        yaw: V.yaw,
        pitch: V.pitch,
        block: V.world
          ? V.world.getBlock(Math.floor(player.x), Math.floor(player.y) - 1, Math.floor(player.z))
          : 0,
        biome: biomeLabel.value,
        mode: mode.value,
        ticks: V.ticks,
        health: survival.health,
        hunger: survival.hunger,
        level: survival.level,
        inventory: inventory.value.map((s) => (s ? { item: s.item, count: s.count } : null)),
        mobs: entidades.mobs().length,
        drops: entidades.drops().length,
        mp: { active: mp.active, mode: mp.mode, players: mp.players },
        fps: fps.value,
      }
    },
    // Espelho do estado de RENDER. O QA precisa disso pra distinguir "a
    // paisagem sumiu" de "a névoa engoliu a paisagem" sem adivinhar pelo pixel.
    get debug() {
      if (!V.engine) return null
      return {
        fog: {
          near: V.engine.scene.fog?.near,
          far: V.engine.scene.fog?.far,
          color: V.engine.scene.fog?.color?.getHexString(),
        },
        camera: {
          y: V.engine.camera.position.y,
          far: V.engine.camera.far,
          fov: V.engine.camera.fov,
        },
        sun: {
          intensity: V.engine.sun.intensity,
          y: V.engine.sun.position.y - V.engine.camera.position.y,
        },
        exposure: V.engine.renderer.toneMappingExposure,
        renderDistance: settings.renderDistance,
        underwater: underwater.value,
        groundBelow: V.world ? V.world.heightAt(Math.floor(player.x), Math.floor(player.z)) : -1,
      }
    },
    // A superfície de QA da CENA (motor + mundo) mora em `qaDeCena`: são 142
    // linhas com quatro dependências reais, e por isso saíram inteiras.
    // QA de áudio (banco, ambiente, pico, ganho offline) em `qaDeSom`:
    // 63 linhas com três dependências.
    // Inventário, mão e mobília em `qaDeInventario`: 12 métodos com dez
    // dependências. O contorno do bloco mirado em `qaDeMira`: três métodos com
    // três dependências.
    // O mundo de blocos parado (ler coluna, chave, luz; escrever bloco;
    // perguntar ao save) em `qaDeTerreno`: quatro dependências. O que se mexe
    // saiu espelhando os serviços que já existem - `qaDeFluidos` para
    // `fluidos.js` (seis) e `qaDeQuedas` para `quedas.js` (seis).
    // Criaturas em `qaDeMobs` (oito dependências) e o golpe em `qaDeCombate`
    // (sete). `dropsInfo` foi junto com `soltarItemQA` pro `qaDeInventario`:
    // item no chão é o mesmo assunto que item na mão.
    // Dirigir o jogo (tecla, clique, mira, voo) em `qaDeEntrada`: dez
    // dependências, e o módulo inteiro existe porque o pointer lock não engata
    // em headless. Relógio e clima em `qaDeTempo`: cinco.
    ...qaDeSom,
    ...qaDeCena,
    ...qaDeInventario,
    ...qaDeMira,
    ...qaDeTerreno,
    ...qaDeAldeia,
    ...qaDoGoal20,
    ...qaDeFluidos,
    ...qaDeQuedas,
    ...qaDeMobs,
    ...qaDeCombate,
    ...qaDeEntrada,
    ...qaDeTempo,
    auditarMalha: (raio = 24) =>
      auditarMalhaViva({ engine: V.engine, world: V.world, player, raio }),
    // Gotas de borrifo VIVAS na cena. É o par visual do `somLeitos`: as duas
    // saem da MESMA queda dominante, e uma sonda que só olhasse o som não
    // separaria "a cachoeira soa mas não espuma" de "está tudo lá".
    borrifoVivo: () => V.gotasDoBorrifo?.length ?? -1,
    // Em que dimensão o mundo está AGORA. Sai do cliente de mundo e não de uma
    // variável do componente: é o cliente que manda a dimensão para o worker, e
    // é a resposta dele que diz o que está sendo gerado.
    // ── COMÉRCIO ──────────────────────────────────────────────────────────
    // A sonda precisa do que a TELA mostra (as ofertas com o motivo de recusa)
    // e do MESMO clique que o botão dispara. Ler as ofertas do mob seria ler o
    // dado cru e pular a conta de "posso pagar isto?" — que é o que se quer
    // provar.
    // A mobília da sala (Onda 6.3): o que chegaria pela rede, e o que sairia.
    mobiliaDaSala: (k, dado) => ctx.paineis().aplicarMobilia(k, dado),
    entradaDaSala: (k) => ctx.paineis().entradaDeMobilia(k),
    ofertasAbertas: () => ctx.paineis().ofertasDoAldeao.value.map((o) => ({ ...o })),
    trocarComAldeao: (i) => ctx.paineis().acaoDoAldeao('trocar', i),
    aldeaoAberto: () => ctx.paineis().aldeaoAberto.value?.id ?? null,
    // ── O ALDEÃO COMO PESSOA (onda 9) ───────────────────────────────────
    //
    // ⚠️ SAI DO MESMO `computed` QUE A TELA LÊ, e não do mob. Ler `mob.npc`
    // provaria que o estado existe — que é justamente o que 38 testes verdes já
    // provavam enquanto NADA no jogo importava o arquivo. O que falta provar é
    // que a pessoa chega na tela, e a tela lê daqui.
    conversaAberta: () => {
      const c = ctx.paineis().conversaDoAldeao.value
      return c ? { ...c } : null
    },
    // As MESMAS portas dos botões do painel. Chamar `npc.registrar` direto
    // mediria a regra, não o caminho.
    falarComAldeao: (assunto = 'saudacao') => ctx.paineis().acaoDoAldeao(assunto),
    presentearAldeao: (item) => ctx.paineis().acaoDoAldeao('presentear', item),
    /** O aldeão que está na mira, do jeito que o jogo o conhece. */
    pessoaNaMira: () => {
      const m = mobMirado()
      if (!m?.npc) return null
      return { id: m.id, nome: m.npc.nome, amizade: m.npc.amizade, oficio: m.profissao }
    },
    /** Quem mora nesta vila, na ordem em que o mundo os pôs de pé. */
    moradoresPerto: () =>
      entidades
        .mobs()
        .filter((m) => m.type === 'aldeao')
        .map((m) => ({
          id: m.id,
          nome: m.npc?.nome ?? null,
          oficio: m.profissao,
          amizade: m.npc?.amizade ?? null,
          ofertas: m.ofertas?.length ?? 0,
          x: Math.round(m.x),
          z: Math.round(m.z),
          // A CASA (a origem) e o estado da IA: e o que a sonda da rotina le.
          // `x`/`z` acima sao arredondados de proposito (foto de onde ele esta);
          // a distancia ate a casa precisa das coordenadas cruas.
          casa: { x: m.origemX, z: m.origemZ },
          daCasa: Math.hypot(m.x - (m.origemX + 0.5), m.z - (m.origemZ + 0.5)),
          estado: m.state,
        })),
    /** Abre o painel deste aldeão pelo id, sem depender da mira. */
    abrirAldeao: (id) => {
      const m = entidades.mobs().find((x) => x.id === id)
      return m ? ctx.paineis().comercio.abrirCom(m, true) : false
    },
    miraNoMob: () => {
      const m = mobMirado()
      return m ? { id: m.id, type: m.type } : null
    },
    // ── REGER O MUNDO (criativo) ────────────────────────────────────────
    //
    // ⚠️ AS PORTAS DA TELA, e não as do motor. Chamar `clima.forcar` direto
    // daqui mediria a regra do clima — que já tem teste de unidade. O que só o
    // jogo rodando responde é se o BOTÃO chega lá, e o botão é `ctx.criativo`.
    criativoAberto: () => ctx.criativo().aberto.value,
    abrirCriativo: () => ctx.criativo().alternar(),
    relogioTravado: () => ctx.criativo().travado.value,
    dimensaoAtual: () => V.world?.dimensao ?? null,
    // A fortaleza desta semente: o MESMO plano que o gerador escreve. A sonda
    // precisa saber onde ir, e o jogador descobre pelo olho — que é o que ela
    // também mede.
    fortalezaInfo: () => {
      const p = fortalezaDaSemente(seed.value)
      if (!p) return null
      return {
        centro: { ...p.centro },
        chaoDaSala: p.chaoDaSala,
        olhos: p.olhos,
        anel: centroDoAnelDe(p),
        molduras: p.anel.map((m) => ({ x: m.x, y: m.y, z: m.z, id: m.id })),
      }
    },
    // Entrar no jogo pela mesma porta do jogador: sair do menu e POUSAR. A
    // queixa do founder é sobre o estado da malha DEPOIS de pousar, e teleportar
    // pro chão pularia justamente o trecho sob suspeita.
    entrarNoJogo: () => startFromSave(),
    // ⚠️ O SINAL QUE FECHA OS ATALHOS DO DESKTOP. A sonda de atalhos precisa
    // separar "a janela do jogo está aberta" de "o jogador está JOGANDO": com o
    // menu aberto o desktop TEM que continuar respondendo, senão o conserto
    // vira uma prisão. Até a extração isto lia o registro de donos do teclado
    // do RoqueOS (`focoDoTeclado.js`); agora o jogo pede o teclado ao host e o
    // QA lê o que o próprio jogo pediu, na entrada.
    tecladoEhDoJogo: () => Boolean(ctx.entrada?.()?.tecladoReivindicado?.()),
    // `teleport` liga o voo pra enquadrar cena; quando o assunto É a queda, o
    // QA precisa desligar.
    // Navegação de QA (achar lugar no mundo e apontar a câmera) mora em
    // `qaDeNavegacao`: 164 linhas com seis dependências reais.
    ...qaDeNavegacao,
    // Espera o mundo REALMENTE chegar ao redor do jogador. Sem isto o harness
    // fotografava logo depois de teleportar e pegava o terreno ainda vazio -
    // o frame saía como céu puro e parecia defeito de névoa/render (perdi meia
    // dúzia de rodadas do QA de 2026-08-19 nisso).
    // Pousa o jogador na superfície da coluna atual (o `stage` deixa a câmera
    // no alto; pra testar quebrar/colocar é preciso estar ao alcance do chão).
    // Dormir sem clicar: `tryInteract` depende de raycast, e a sonda precisa
    // separar "a regra do sono" de "a mira acertou a cama".
    dormirEm: (x, y, z) => dormir({ x, y, z }),
    avisoDaCama: () => avisoDaCama.value,
    pontoDeRenascimento: () =>
      pontoDeRenascimento.value ? { ...pontoDeRenascimento.value } : null,
    renascer: () => {
      respawnPlayer()
      return { x: player.x, y: player.y, z: player.z }
    },
    // Tela inicial: o QA precisa fotografar a porta de entrada e provar que os
    // botoes fazem o que dizem.
    openMenu: () => {
      enterMenu()
      return true
    },
    menuOpen: () => menuOpen.value,
    menuContinue: () => {
      startFromSave()
      return !menuOpen.value
    },
    menuNewWorld: () => {
      const antes = seed.value
      startNewWorld()
      return { antes, depois: seed.value, mudou: antes !== seed.value }
    },
    // Chama a MESMA função do autosave e devolve o que iria pro disco, sem
    // escrever nada. Assim a sonda mede o payload REAL em vez de uma
    // reconstrução dele que poderia divergir sem ninguém perceber.
    payloadDeSave: () => montarPayloadDeSave(),

    // ── O MUNDO SALVO QUE VOLTA ────────────────────────────────────────────
    //
    // ⚠️ ESTES DOIS EXISTEM PORQUE O CICLO REAL NÃO PODE SER MEDIDO AQUI: o
    // autosave está fechado em modo E2E, então não há como plantar, gravar,
    // recarregar a página e ver. O que se pode fazer é reproduzir o ESTADO em
    // que o jogo acorda depois de carregar um save — registro de edições cheio,
    // fila de atualizações vazia — e medir o que acontece com e sem
    // `acordarPlantios`.
    //
    // Sem os dois, o defeito "a lavoura do save nunca mais cresce" só se
    // enxergaria voltando ao jogo no dia seguinte.
    esvaziarFila: () => {
      filaDeAtualizacoes.limpar()
      return { fila: filaDeAtualizacoes.tamanho, esperando: filaDeAtualizacoes.esperando }
    },
    acordarPlantios: () => mundoVivo.acordarPlantios(),
    // ⚠️ NÃO EXPONHA `persistencia.gravacoes` AQUI. Já tentei: o harness roda em
    // modo E2E, e o modo E2E é justamente uma das portas que fecham o autosave.
    // O contador seria zero SEMPRE — e uma sonda lendo zero não conseguiria
    // separar "o debounce colapsou certo" de "a porta nunca deixou gravar".
    // Instrumento que não pode acusar não é instrumento. O debounce é medido
    // em `tests/unit/composables/useRoqueCraftPersistencia.spec.js`, que tem
    // prova de vida; aqui mede-se o CONTEÚDO do save, que é o que só o jogo
    // rodando sabe dizer.
    // Estado REAL do V.audio. "Esta mudo" tem quatro causas com o mesmo sintoma
    // (contexto nao criado / suspenso / ganho zero / toggle desligado) e so
    // medindo da pra saber qual.
    qaPlayers: (lista) => {
      V.qaJogadores = Array.isArray(lista) && lista.length ? lista : null
      return V.qaJogadores?.length || 0
    },
    openLobby: () => openLobby(),
    openPause: () => togglePause(),
    setMode: (m) => setMode(m),
    setQuality: (q) => applySettings({ ...settings, quality: q }),
    // Leva o jogador ao bioma pedido (busca em espiral pela geração, que é
    // pura). Serve o QA: sem isto, toda foto sai do bioma onde a semente
    // calhou de nascer e o mundo parece ter um clima só.
    // ⚠️ ISTO POUSAVA NA BEIRADA DO BIOMA, e a foto saía do bioma VIZINHO.
    //
    // A varredura devolvia a PRIMEIRA coluna que casava, que por construção é a
    // borda: ela cresce em anéis a partir da origem e para no primeiro acerto.
    // A sonda do halo pediu deserto, o HUD escreveu "Deserto" (o jogador ESTAVA
    // numa coluna de deserto) e a foto era floresta fechada — os pixels que ela
    // mediu eram tronco e copa. O rótulo estava certo e a cena estava errada,
    // que é o jeito mais convincente de uma sonda mentir.
    //
    // `puro` exige que o disco inteiro em volta seja do mesmo bioma. Sem achar,
    // a exigência cai pela metade e depois a zero — e a `pureza` devolvida diz
    // qual delas valeu, para o chamador poder desistir em vez de fotografar.
    //
    // ⚠️ E O PADRÃO É ZERO, DE PROPÓSITO. A primeira versão pôs 14 como padrão e
    // isso mudou a CENA DE TODAS as sondas que já existiam, em silêncio. A da
    // cáustica quebrou na hora ("sem lâmina rasa num raio de 40"): ela pede
    // PRAIA, e praia é por definição a fronteira entre terra e água — exigir um
    // disco puro de praia é exigir o que não existe, e a escada de fallback só
    // a levou para outro lugar, longe da água rasa que ela precisa fotografar.
    //
    // Quem precisa de interior aberto pede (a sonda do halo pede 16). Mudança
    // que altera o comportamento de todo mundo tem que ser pedida, não herdada.
    stage: async (opts = {}) => {
      V.ticks = opts.ticks ?? 10600
      // findSpawn já garante terra seca com vizinhança seca - a foto de capa
      // não pode cair no meio do oceano (aconteceu no QA de 2026-08-19)
      const sp = findSpawn(V.noiseCtx)
      player.x = sp.x
      player.z = sp.z
      player.y =
        (V.world.surfaceY(Math.floor(sp.x), Math.floor(sp.z)) || sp.y) + (opts.height ?? 16)
      player.vy = 0
      mode.value = 'creative'
      flying.value = true
      V.yaw = opts.yaw ?? 0.7
      V.pitch = opts.pitch ?? -0.32
      V.world.setPlayerPosition(player.x, player.y, player.z)
      await window.__roquecraft.waitChunks(opts.radius ?? 5)
      // um respiro extra pra as malhas das seções chegarem depois dos blocos
      await new Promise((r) => setTimeout(r, opts.wait ?? 1800))
      return { chunks: V.world.loadedCount, y: player.y }
    },
    waitReady: async (timeout = 20000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < timeout) {
        if (!loading.value) return !fatalError.value
        await new Promise((r) => setTimeout(r, 100))
      }
      return false
    },
  }

  return () => {
    if (typeof window !== 'undefined' && window.__roquecraft) delete window.__roquecraft
  }
}
