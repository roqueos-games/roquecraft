<template>
  <div
    ref="rootEl"
    class="ros-roquecraft"
    :class="{ 'ros-roquecraft--locked': pointerLocked }"
    :dir="estado.idioma === 'ar-AR' ? 'rtl' : undefined"
    @contextmenu.prevent
  >
    <canvas ref="canvasEl" class="ros-roquecraft__canvas" />

    <!-- Carregando -->
    <div v-if="loading" class="ros-roquecraft__boot">
      <div class="ros-roquecraft__boot-logo">RoqueCraft</div>
      <div class="ros-roquecraft__boot-bar">
        <div class="ros-roquecraft__boot-fill" :style="{ width: `${bootPct}%` }" />
      </div>
      <span class="ros-roquecraft__boot-msg">{{ bootMsg }}</span>
    </div>

    <!-- Erro recuperável: NUNCA travar na tela de carregando (regra 36-games) -->
    <div v-else-if="fatalError" class="ros-roquecraft__error">
      <Icone nome="alerta" :tamanho="42" />
      <strong>{{ t('roqueCraft.error.title') }}</strong>
      <span>{{ fatalError }}</span>
      <button class="ros-roquecraft__retry" @click="retryBoot">
        <Icone nome="reiniciar" :tamanho="18" />{{ t('roqueCraft.error.retry') }}
      </button>
    </div>

    <template v-else>
      <!-- Tela inicial: o mundo continua rodando e a câmera orbita atrás dela -->
      <RCStart
        v-if="menuOpen && !lobbyOpen"
        :has-save="hasSave"
        :seed="seed"
        :mode="mode"
        :day="saveDay"
        @continue="startFromSave"
        @new-world="startNewWorld"
        @friends="openLobbyFromMenu"
        @settings="openSettingsFromMenu"
      />

      <!-- Mira e os recibos de combate. Ver `RCMira.vue`. -->
      <RCMira
        v-if="!telaAberta"
        :carga-do-golpe="recibos.cargaDoGolpe"
        :critico="recibos.critico"
        :carga-do-arco="recibos.cargaDoArco"
        :arco-armado="recibos.arcoArmado"
        :guarda="recibos.guarda"
      />

      <!-- Debaixo d'água / dano -->
      <div v-if="underwater" class="ros-roquecraft__water" aria-hidden="true" />
      <div class="ros-roquecraft__hurt" :style="{ opacity: hurtFlash }" aria-hidden="true" />

      <!-- Física congelada esperando a coluna do jogador. Meio segundo sem
           aviso lê como travamento; com aviso lê como carregamento. -->
      <div v-if="aguardandoTerreno && naPartida" class="ros-roquecraft__espera" role="status">
        {{ t('roqueCraft.loading') }}
      </div>

      <!-- Clique pra jogar (desktop) -->
      <button
        v-if="!pointerLocked && !isMobile && !telaAberta"
        class="ros-roquecraft__play"
        @click="requestLock"
      >
        <RCIcon nome="play" :size="34" />
        <strong>{{ t('roqueCraft.clickToPlay') }}</strong>
        <span>{{ t('roqueCraft.controlsHint') }}</span>
      </button>

      <!-- HUD some na tela inicial: vida, fome e hotbar por cima do menu
           denunciam que o "menu" é só um overlay em cima do jogo rodando. -->
      <RCHud
        v-if="naPartida"
        :pos="playerPos"
        :clock="clockText"
        :is-night-now="nightNow"
        :biome-label="biomeLabel"
        :fps="fps"
        :chunks="loadedChunks"
        :show-stats="settings.showStats"
        v-model:minimapa="settings.minimapa"
        :survival-mode="mode === 'survival'"
        :health="survival.health"
        :armadura="pontosDe(survival.armadura)"
        :hunger="survival.hunger"
        :air="survival.air"
        :level="survival.level"
        :xp="xpProgressValue"
        :hotbar="hotbarSlots"
        :selected="selectedSlot"
        :icons="icons"
        :item-toast="itemToast"
        :bed-toast="avisoDaCama"
        :mp-active="mp.active"
        :mp-players="mp.players"
        :mobile="isMobile"
        @select="selectSlot"
        @lobby="openLobby"
        @largar="dropHeld()"
      />

      <RCMobile
        v-if="isMobile && naPartida"
        :flying="flying"
        :na-agua="naAguaHud"
        :criativo="mode === 'creative'"
        :em-rede="mp.active"
        @move="onStickMove"
        @break-start="onMobileBreakStart"
        @break-end="onMobileBreakEnd"
        @place-start="onMobilePlaceStart"
        @place-end="onMobilePlaceEnd"
        @jump="(v) => (keys.Space = v)"
        @dive="(v) => (keys.ShiftLeft = v)"
        @inventory="toggleInventory"
        @fly="toggleFly"
        @pause="togglePause"
        @criativo="criativo.alternar()"
        @chat="openChat()"
      />

      <RCTelas
        :icons="icons"
        :aldeao-aberto="aldeaoAberto"
        :conversa="paineis.conversaDoAldeao.value"
        :ofertas="paineis.ofertasDoAldeao.value"
        :criativo="criativo"
        :mobilia="aberto"
        :conteudo="conteudoAberto"
        :fogo="fogoAberto"
        :progresso="progressoAberto"
        :inventario-aberto="inventoryOpen"
        :slots="inventory"
        :armadura="survival.armadura"
        :craft="activeCraftSlots"
        :grid-size="craftGridSize"
        :resultado="craftResult"
        :craftaveis="craftableNow"
        :criativo-ligado="mode === 'creative'"
        :todos-os-blocos="allBlockItems"
        :ponteiro="{ cursor: cursorStack, mouse: mousePos }"
        @fechar-comercio="fecharComercio"
        @acao-aldeao="paineis.acaoDoAldeao"
        @fechar-mobilia="fecharMobilia"
        @container-click="onContainerClick"
        @slot-click="onSlotClick"
        @fechar-inventario="closeInventory"
        @craft-click="onCraftClick"
        @pegar-resultado="takeCraftResult"
        @auto-craft="autoCraft"
        @dar="giveCreative"
      />

      <RCPause
        v-if="paused || survival.dead"
        :settings="settings"
        :mode="mode"
        :seed="seed"
        :mp-active="mp.active"
        :dead="survival.dead"
        :death-reason="deathReason"
        :pack="packInfo"
        :venceu="venceu"
        @resume="resumeGame"
        @lobby="openLobby"
        @settings="applySettings"
        @set-mode="setMode"
        @respawn="respawnPlayer"
      />

      <RCLobby
        v-if="lobbyOpen"
        :mp="mp"
        :players="lobbyPlayers"
        :has-account="!semConta"
        :skin="settings.skin"
        @close="closeLobby"
        @host="hostRoom"
        @join="joinByCode()"
        @code="(v) => (mp.codeInput = v)"
        @copy="copyInvite"
        @leave="leaveMultiplayer"
        @skin="escolherSkin"
      />

      <!-- Chat do multiplayer -->
      <div v-if="mp.active" class="ros-roquecraft__chat" :class="{ 'is-open': chatOpen }">
        <ul class="ros-roquecraft__chat-log ros-scrollbar-thin">
          <li v-for="m in chatLog" :key="m.id">
            <strong>{{ m.name }}</strong
            ><span>{{ m.text }}</span>
          </li>
        </ul>
        <input
          v-if="chatOpen"
          ref="chatInputEl"
          v-model="chatDraft"
          class="ros-roquecraft__chat-input"
          :placeholder="t('roqueCraft.mp.chatPlaceholder')"
          :aria-label="t('roqueCraft.mp.chatPlaceholder')"
          maxlength="160"
          @keydown.enter.prevent="submitChat"
          @keydown.esc.prevent="closeChat"
        />
        <!-- No toque não há Esc: o `x` é a única porta de sair do chat. -->
        <button
          v-if="chatOpen"
          class="rc-btn ros-roquecraft__chat-x"
          data-test="rc-chat-fechar"
          :aria-label="t('common.close')"
          @click="closeChat"
        >
          <RCIcon nome="fechar" :size="14" />
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, provide } from 'vue'
import { emModoE2E, estadoE2E } from '@roqueos-games/jogo-sdk'
import { CHAVE_DOS_TEXTOS, criarT } from './textosDoJogo.js'
import { criarNotificar } from './avisos.js'
import Icone from './Icone.vue'
import { bonusDeForca, efeitosDoSave } from './servicos/efeitos.js'
import { useRoqueCraftPaineis } from './composables/useRoqueCraftPaineis.js'
import { useMobileViewport } from './tela.js'
import { useRoqueCraftPersistencia } from './composables/useRoqueCraftPersistencia.js'
import { useRoqueCraftClima } from './composables/useRoqueCraftClima.js'
import { useRoqueCraftMultijogador } from './composables/useRoqueCraftMultijogador.js'
import { useRoqueCraftEntidades } from './composables/useRoqueCraftEntidades.js'
import { useRoqueCraftAbertura } from './composables/useRoqueCraftAbertura.js'
import { useRoqueCraftIndicadores } from './composables/useRoqueCraftIndicadores.js'
import { useRoqueCraftOlho } from './composables/useRoqueCraftOlho.js'
import { useRoqueCraftQualidade } from './composables/useRoqueCraftQualidade.js'
import { useRoqueCraftEntrada } from './composables/useRoqueCraftEntrada.js'
import { useRoqueCraftMundoVivo } from './composables/useRoqueCraftMundoVivo.js'
import { useRoqueCraftCorpo } from './composables/useRoqueCraftCorpo.js'
import { useRoqueCraftPainel } from './composables/useRoqueCraftPainel.js'
import { blockTintColor } from './servicos/aparencia.js'
import { aplicarAjustes } from './servicos/ajustes.js'
import { montarGanchoDeQA } from './servicos/ganchoDeQA.js'
import { momentoAgora } from './servicos/trilha.js'
import { estadoInicial } from './servicos/estadoInicial.js'
import { CARGA, carregarSave, avisarDaCarga, podeSalvar } from './servicos/cargaDoSave.js'
import { camadasDoBloco, montarIconesDoJogo } from './servicos/icones.js'
import { criarCena, montarMotor } from './servicos/cena.js'
import { criarMira } from './servicos/mira.js'
import { espelho } from './servicos/espelho.js'
import { resolverColocacao } from './servicos/colocacao.js'
import { usarItemNaMao } from './servicos/usoDeFerramenta.js'
import { criarTravessia } from './servicos/travessia.js'
import { interagirComBloco } from './servicos/interacao.js'
import { fatorDeEficiencia, bonusDeAfiacao } from './servicos/encantamento.js'
import { criarPaisagemSonora } from './servicos/paisagemSonora.js'
import { devolverAoInventario, criarMaoDaBancada } from './servicos/bancada.js'

import RCIcon from './componentes/RCIcon.vue'
import RCStart from './componentes/RCStart.vue'
import { familyOf } from './servicos/audio.js'
import { SKIN_PADRAO, normalizeSkinId } from './servicos/skins.js'
import RCHud from './componentes/RCHud.vue'
import RCMira from './componentes/RCMira.vue'
import RCTelas from './componentes/RCTelas.vue'
import RCPause from './componentes/RCPause.vue'
import RCLobby from './componentes/RCLobby.vue'
import RCMobile from './componentes/RCMobile.vue'

import {
  AIR,
  BLOCKS,
  BLOCO_DO_PORTAO,
  VARIANTE_DE_PORTAO,
  blockDef,
  breakTime,
  blockDrops,
  isUnbreakable,
  FACE_LAYERS,
} from './servicos/blocks.js'
import { itemDef, placeableBlock, toolOf, maxStack } from './servicos/items.js'
import { maoDoItem } from './servicos/pecaNaMao.js'
import { findRecipe, craftableWith } from './servicos/recipes.js'
import {
  createInventory,
  addItem,
  trocarItem,
  consumeOne,
  countAll,
  survivalStarter,
  creativeStarter,
  removeItem,
  espacoPara,
  HOTBAR_SIZE,
} from './servicos/inventory.js'
import {
  criarConstrucao,
  soltarColocar,
  registrarColocado,
  avancarColocar,
  chaveDaCelula,
  dentroDoJogador,
  escolherPickBlock,
  aplicarPickBlock,
} from './servicos/construcao.js'
import {
  criarMobilia,
  abrirMobilia,
  serializarMobilia,
  desserializarMobilia,
} from './servicos/mobilia.js'
import { createWorldClient } from './servicos/worldClient.js'
import { createNoiseContext, findSpawn, BIOME_NAMES } from './servicos/worldgen.js'
import { ondeFicaAFortaleza } from './servicos/fortaleza.js'
import { fortalezaDaSemente } from './servicos/geradores.js'
import { criarFimDeJogo } from './servicos/fimDeJogo.js'
import { passoDaMineracao } from './servicos/mineracao.js'
import { EYE_HEIGHT, safeSpawn, landingSpot, melhorVista } from './servicos/physics.js'
import { pousarJogador } from './servicos/nascimento.js'
import {
  outraMetade,
  podeDormir,
  amanhecerDepoisDe,
  monstroPerto,
  ehCabeceira,
} from './servicos/cama.js'
import { metadeGemea } from './servicos/duplos.js'
import { direcaoDoOlhar, aplicarNaCamera } from './servicos/aim.js'
import { balancoDaCamera } from './servicos/passo.js'
import { avancarCamera, poseDaCamera, assentarCamera, orbitaDoMenu } from './servicos/camera.js'
import { createSurvivalState, eat, addXp, addExhaustion, xpProgress } from './servicos/survival.js'
import { golpear, recargaDe, cargaDe } from './servicos/combate.js'
import { chaoParaNascer as politicaDeNascimento } from './servicos/nascimento.js'
import { alimentar, podeTosquiar, tosquiar } from './servicos/pecuaria.js'
import { hurtMob, MOB_TYPES, mobDef, empurrar, FORCA_EMPURRAO } from './servicos/mobs.js'
import { advanceTime, clockLabel, isNight, dayFactor } from './servicos/daycycle.js'
import { useRoqueCraftCriativo } from './composables/useRoqueCraftCriativo.js'
import { useRoqueCraftTelas } from './composables/useRoqueCraftTelas.js'
import { toChunkCoord, WORLD_HEIGHT } from './servicos/constants.js'
import { detectQuality, QUALITY } from './servicos/render/engine.js'
import * as Save from './servicos/roqueCraftSave.js'
const { buildSavePayload, parseSave, identidadeDe, criarSaveDoRoqueCraft } = Save
import { criarSessaoDeRede } from './servicos/sessaoDeRede.js'
import { espolioDaMorte } from './servicos/morte.js'
import { pontosDe } from './servicos/armadura.js'
import { criarSalaDoRoqueCraft } from './servicos/roqueCraftRoom.js'

// O contrato do jogo-sdk: `host` é tudo o que o jogo alcança do sistema (conta,
// avisos, sala, save, teclado, IA, perfil leve, idioma) e `estado` é o que o
// `index.js` mantém (`ativo`, `idioma`, `textos`). Até a extração isto era a
// prop `joinCode` e seis imports do RoqueOS (stores, boot do Firebase e i18n).
const props = defineProps({
  host: { type: Object, required: true },
  estado: { type: Object, required: true },
})

// O texto do jogo mora no jogo (`i18n/*.json`, carregado pelo `index.js`); as
// telas `RC*` pedem o mesmo `t` com `useTextos()`. Ver `textosDoJogo.js`.
const t = criarT(() => props.estado.textos)
provide(CHAVE_DOS_TEXTOS, t)

// Os avisos do jogo vão ao `host.avisar`, com o tipo do contrato (`avisos.js`).
const notificar = criarNotificar((mensagem, opcoes) => props.host.avisar(mensagem, opcoes))

// A sala ao vivo e o save na conta, sobre as capacidades do host. Os nomes das
// operações são os de antes da extração (ver `roqueCraftRoom.js` e
// `roqueCraftSave.js`).
const salaDoJogo = criarSalaDoRoqueCraft(props.host.salaAoVivo)
const saveDoJogo = criarSaveDoRoqueCraft(props.host.progresso)
const { saveRoqueCraft, loadRoqueCraft } = saveDoJogo
const { isMobile } = useMobileViewport()

// ── Estado de UI ────────────────────────────────────────────────────────────
const rootEl = ref(null)
const canvasEl = ref(null)
const chatInputEl = ref(null)
const loading = ref(true)
const bootPct = ref(0)
const bootMsg = ref('')
const fatalError = ref('')
const estadoDaCarga = ref(CARGA.NAO_TENTOU) // RC-02, ver `cargaDoSave.js`
const identidadeDoMundo = reactive({ worldId: '', dimensionId: '', generatorVersion: 1 })
// MENU INICIAL: o jogo abria direto no mundo, sem porta de entrada. Com o menu,
// o mundo já está carregado e girando atrás - a espera vira cenário em vez de
// barra de progresso.
const menuOpen = ref(false)
const hasSave = ref(false)
const saveDay = ref(1)
let savedPlayer = null
let menuAnchor = null
let audio = null
// A caminhada é UMA fase, e ela serve o som e a câmera. Ver `passo.js`: é o que
// impede o pé de bater num instante e a tela balançar noutro.
// Distância nadada desde a última braçada, e a velocidade vertical do frame
// ANTERIOR — a água já amorteceu a do frame atual, então ela não serve pra
// medir a violência da entrada.
const paused = ref(false)
const inventoryOpen = ref(false)
// O corpo na água, não só a CABEÇA. `underwater` responde por `headInWater` e é
// quem manda na névoa; o botão de mergulhar do celular tem que aparecer ANTES
// disso — quando o jogador está boiando com a cabeça de fora é exatamente
// quando ele precisa do botão pra afundar. `player` é objeto cru mexido pela
// física, então o espelho reativo é atualizado no mesmo lugar que `underwater`.

// Verdadeiro enquanto a física está congelada esperando a coluna do jogador
// chegar. Sem um aviso, um congelamento de meio segundo lê como travamento.
// Lista de jogadores remotos FALSA, so pro harness. Null em producao.
let qaJogadores = null
// O que o carregador de textura achou de resource pack local. Alimenta a seção
// de crédito do pack na tela de créditos - sem pack, a seção nem aparece.
const packInfo = ref(null)
const selectedSlot = ref(0)
const itemToast = ref('')
const icons = ref({})
const mode = ref('survival')
const seed = ref(1)
const deathReason = ref('')
// Recado curto da cama ("é dia", "tem monstro", "bom dia"). Vive num ref e não
// numa notificação do sistema porque é feedback DE JOGO: tem que aparecer sobre
// a cena, sem tirar o ponteiro nem empilhar na bandeja do RoqueOS.
const avisoDaCama = ref('')
// Onde renascer. `null` = no nascimento do mundo. Sobrevive ao save.
const pontoDeRenascimento = ref(null)
const dragaoMorto = ref(false)
const venceu = ref(false) // a tela de pausa lê: os créditos do fim (`fimDeJogo.js`)

const settings = reactive({
  renderDistance: 8,
  quality: 'high',
  fov: 72,
  sensitivity: 1,
  autoJump: true,
  // Balanço de câmera ligado por padrão, mas desligável: ele provoca enjoo em
  // parte das pessoas, e efeito de imersão que passa mal não é opcional de luxo.
  viewBob: true,
  showStats: false,
  sound: true,
  // Trilha separada do resto: quem joga com podcast no fone quer o som do jogo
  // e não a música. Zero desliga a trilha sem tirar passo, picareta e bicho.
  music: 0.55,
  // Aparência no multijogador. '' = ainda não escolheu; o render sorteia uma
  // skin estável pelo uid até a pessoa escolher.
  skin: SKIN_PADRAO,
})

// ── Estado de jogo ──────────────────────────────────────────────────────────
const inventory = ref(createInventory())
const craftSlots = ref(new Array(9).fill(null))
const craftGridSize = ref(2)
const cursorStack = ref(null)

// não-reativos (caminho quente do frame)
let yaw = 0
let pitch = 0
let ticks = 1000
// O relógio anda a 35% na tela inicial: a porta do jogo não é pra ver o dia passar.
const RELOGIO_NO_MENU = 0.35
// ── O CORPO DO JOGADOR ──────────────────────────────────────────────────────
//
// Fisica, passo, agua, camera e sobrevivencia moram em `useRoqueCraftCorpo`,
// com `player`, `survival`, a fase da caminhada e a animacao da camera DENTRO
// dele. Eram quinze pedacos de estado e 110 linhas do laco.
//
// ⚠️ `entrada` entra LAZY (`() => entrada`) porque ela e montada depois deste
// composable; passar o valor seria `ReferenceError` no setup (rule 44).
const corpoDoJogador = useRoqueCraftCorpo({
  mundo: { vivo: () => world, motor: () => engine },
  ajustes: settings,
  som: () => audio,
  entrada: () => entrada,
  ehCelular: isMobile,
  yaw: () => yaw,
  modo: () => mode.value,
  aoMorrer: (fonte) => onDeath(fonte),
  aoAndar: (x, z) =>
    multijogador.recentrar(toChunkCoord(Math.floor(x)), toChunkCoord(Math.floor(z))),
  chaoParaNascer: (teto, fundo) => chaoParaNascer(teto, fundo),
  // Efeito que some calado vira "o jogo ficou lento do nada".
  aoExpirarEfeito: (nome) =>
    notificar({ type: 'info', message: t(`roqueCraft.efeito.acabou.${nome}`) }),
  itemNaMao: () => itemDef(heldItem()?.item),
  gastarEscudo: (n) => gastarFerramentaNaMao(n),
})
const {
  corpo: player,
  survival,
  voando: flying,
  submerso: underwater,
  naAgua: naAguaHud,
  aguardandoTerreno,
  flashDeDano: hurtFlash,
  caminhada,
  camAnim,
  machucar: hurt,
  efeitos,
  tomarEfeito,
} = corpoDoJogador

// ── O PAINEL ────────────────────────────────────────────────────────────────
//
// Contagem de quadros, posicao, relogio, bioma e ouvinte de audio. Duas
// cadencias (0,5 s e 0,25 s) e nove refs que moravam soltos aqui.
const painel = useRoqueCraftPainel({
  mundo: () => world,
  corpo: {
    pos: player,
    yaw: () => yaw,
    pitch: () => pitch,
    alturaDoOlho: EYE_HEIGHT,
    flashDeDano: hurtFlash,
  },
  instante: () => ticks,
  relogio: clockLabel,
  ehNoite: isNight,
  rotuloDoBioma: (chave) => t(`roqueCraft.${chave}`),
  aoLerBioma: (b) => {
    climaDoJogo.passoLento(b)
    paisagem.atualizar(b)
  },
  ouvinte: (pos, dir) => audio?.setOuvinte?.(pos, dir),
})
const {
  fps,
  posicao: playerPos,
  horario: clockText,
  instanteNaTela,
  ehDeNoite: nightNow,
  chunksCarregados: loadedChunks,
  bioma: biomeLabel,
} = painel

let world = null
let engine = null
let entities = null
let textures = null
let rafId = null
let cancelled = false
let lastTime = 0
let resizeObs = null
let pararDeOuvirConta = null
let noiseCtx = null

// ── O MUNDO QUE SE MEXE ─────────────────────────────────────────────────────
//
// Edicao, fluido, gravidade, cerca e o registro de edicoes do save moram em
// `useRoqueCraftMundoVivo`. A fila de atualizacoes, o registro de quedas no ar
// e o mapa de edicoes sao DELE: eram quatro pedacos de estado e 155 linhas
// aqui, e nada disso tinha teste porque nao dava pra chamar sem o jogo montado.
//
// O contrato tem seis entradas. `world` e `motor` entram por getter porque sao
// recriados em troca de qualidade e em mundo novo (rule 44).
const mundoVivo = useRoqueCraftMundoVivo({
  world: () => world,
  motor: () => engine,
  rede: { ativo: () => mp.active, codigo: () => mp.code, publicar: salaDoJogo.publishEdit },
  guardar: () => scheduleSave(),
  soltarItem: (...a) => soltarItem(...a),
  // Luz COMBINADA com a hora do dia: fator 1 daria trigo crescendo de noite.
  luzEm: (x, y, z) => world?.luzCombinada(x, y, z, dayFactor(ticks)) ?? null,
})
const applyEdit = mundoVivo.editar
const visitarCelula = mundoVivo.visitarCelula
const tickQuedas = mundoVivo.passo
const filaDeAtualizacoes = mundoVivo.fila
const quedasNoAr = mundoVivo.quedasNoAr
const editsMap = mundoVivo.mapaDeEdicoes
// A travessia entre dimensões (relógio do portal, pouso, edições guardadas por
// dimensão) mora em `travessia.js`. O mapa de edições é passado por REFERÊNCIA:
// ele é o mesmo objeto que vai pro worker e pro save, e trocá-lo por um novo
// deixaria metade do jogo apontando pra dimensão anterior.
const travessia = criarTravessia({
  jogador: player,
  mundo: () => world,
  semente: () => seed.value,
  edicoes: editsMap,
  dimensaoAtual: () => world.dimensao,
  emSala: () => mp.active,
  resetar: (dim) => world.reset(seed.value, editsMap, dim),
  pousar: (p) => Object.assign(player, { ...p, vy: 0, fallStart: p.y }),
  pontoDeRetorno: () => pontoDeRenascimento.value || findSpawn(noiseCtx),
  aoSairDoFim: () => fimDeJogo.saiuDoFim(),
})
const collectEdits = mundoVivo.coletar

// ⚠️ TRES GRUPOS COM NOME, e nao vinte fios soltos: uma entidade vive NUM
// mundo, interage COM um jogador, dentro de uma PARTIDA.
const entidades = useRoqueCraftEntidades({
  mundo: {
    vivo: () => world,
    motor: () => engine,
    particulas: () => entities,
    editar: (x, y, z, id) => applyEdit(x, y, z, id),
  },
  jogador: {
    corpo: player,
    survival,
    inventario: inventory,
    modo: () => mode.value,
    naMao: () => heldItem(),
    machucar: (n, fonte, de) => hurt(n, fonte, de),
    // QUATRO argumentos: sem `pontos` o respingo de dano II chegava inteiro (sonda).
    tomarEfeito: (nome, nivel, duracao, pontos) => tomarEfeito(nome, nivel, duracao, pontos),
    instante: () => ticks,
    // O arco se gasta no soltar; a função é declarada abaixo (hoisting).
    gastarFerramenta: () => gastarFerramentaNaMao(),
  },
  partida: {
    semente: () => seed.value,
    // No multijogador so o ANFITRIAO simula; o convidado renderiza o espelho.
    simulando: () => !mp.active || mp.isHost,
    guardar: () => scheduleSave(),
    dragaoDeveExistir: () => fimDeJogo.dragaoDeveExistir(),
    dragaoCaiu: () => fimDeJogo.dragaoCaiu(),
  },
})
const fimDeJogo = criarFimDeJogo({
  dragaoMorto: () => dragaoMorto.value,
  marcarDragaoMorto: (v) => (dragaoMorto.value = v),
  editar: (x, y, z, id) => applyEdit(x, y, z, id),
  avisar: (chave) => notificar({ type: 'info', message: t(chave) }),
  salvar: scheduleSave,
  rolarCreditos: () => {
    venceu.value = true
    paused.value = true
    exitPointerLock()
  },
})
const soltarItem = entidades.soltarItem
// Cadência de colocar com o botão segurado. Regras em `construcao.js`.
const construcao = criarConstrucao()
// Mobília: os blocos que guardam estado (baú, fornalha, suporte). Ver `mobilia.js`.
let mobilia = criarMobilia()

// ── OS PAINÉIS ──────────────────────────────────────────────────────────────
// Baú, fornalha, suporte e comércio são quatro coisas no mundo e UMA na tela.
// Os quatro `ref`, os cinco `computed` e as quatro funções moram em
// `useRoqueCraftPaineis`; aqui fica só quem são os donos do estado.
const paineis = useRoqueCraftPaineis({
  mobilia: () => mobilia,
  inventario: { get: () => inventory.value, set: (v) => (inventory.value = v) },
  cursor: { get: () => cursorStack.value, set: (v) => (cursorStack.value = v) },
  maquina: { remover: removeItem, adicionar: addItem, espacoPara },
  salvar: scheduleSave,
  // Por função: `multijogador` nasce depois deste bloco. A sala, Onda 6.3.
  mobiliaMudou: (k, desfazer) => multijogador.publicarMobilia(k, true, desfazer),
  mobiliaQueimou: (k) => multijogador.publicarMobilia(k),
  regeMobilia: () => multijogador.regeMobilia(),
  avisar: (chave) => notificar({ type: 'info', message: t(chave) }),
  prenderPonteiro: () => requestLock(),
  // O aldeão que conversa: só com a `ia` do host (ver `falaDoRoqueOS.js`).
  ia: props.host.ia,
  naMao: () => heldItem()?.item || '',
  quando: () => ticks,
})
const {
  aberto,
  aldeaoAberto,
  avisarMobilia,
  conteudoAberto,
  fogoAberto,
  progressoAberto,
  fecharMobilia,
  quebrarMobilia,
  onContainerClick,
  fecharComercio,
} = paineis
let attackCooldown = 0
// Recarga CHEIA da arma usada no último golpe. Guardada separada porque a
// carga é uma fração dela, e trocar de arma no meio da recarga não pode
// reescrever a régua da janela que já está correndo.
let recargaAtual = recargaDe('mao')
// Último golpe resolvido, pro HUD poder mostrar carga e crítico. `t` conta o
// tempo desde o golpe: sem retorno visível, um golpe de 20% lê como
// travamento, não como mecânica.
let ultimoGolpe = null
// Espelhos reativos do combate, só pro HUD. Ficam fora do objeto do jogador de
// propósito: o laço de física roda 60×/s e não pode escrever em ref reativo a
// cada campo que muda.
// OS RECIBOS DA MIRA. A carga do golpe já aparecia; a do ARCO e a GUARDA eram
// calculadas a cada quadro e não chegavam na tela. Ver `useRoqueCraftIndicadores`.
const { estado: recibos, passo: passoDaMira } = useRoqueCraftIndicadores({
  cargaDoGolpe: () => cargaDe(attackCooldown, recargaAtual),
  critico: () => !!ultimoGolpe?.critico,
  cargaDoArco: () => entidades.cargaDoArco(),
  arcoArmado: () => entidades.arcoArmado(),
  guardaLevantada: () => corpoDoJogador.guardaLevantada(),
})
let toastTimer = null

// Quem é o jogador DENTRO da sala vem do host, no `criar` e no `entrar` da
// `salaAoVivo` (antes: o uid do `authStore`). Fora de sala é ''. Lido só em
// função, depois do setup: `multijogador` nasce lá embaixo.
const myUid = computed(() => multijogador.meuUid.value)
const hotbarSlots = computed(() => inventory.value.slice(0, HOTBAR_SIZE))
const xpProgressValue = computed(() => xpProgress(survival))
const allBlockItems = computed(() =>
  Object.values(BLOCKS)
    .filter((b) => !b.unbreakable || b.key === 'bedrock')
    .map((b) => b.key),
)
// A grade tem 9 posições, mas 2×2 só usa as 4 primeiras - passar as 9 pro
// componente desenharia 5 slots fantasma.
const activeCraftSlots = computed(() => craftSlots.value.slice(0, craftGridSize.value ** 2))

const craftResult = computed(() => {
  const r = findRecipe(
    craftSlots.value.slice(0, craftGridSize.value ** 2),
    craftGridSize.value,
    craftGridSize.value === 3,
  )
  return r ? { item: r.item, count: r.count } : null
})
const craftableNow = computed(() => {
  if (!inventoryOpen.value) return []
  const counts = countAll(inventory.value)
  return craftableWith(counts, craftGridSize.value === 3).slice(0, 24)
})

// ── Notificação de item na mão ──────────────────────────────────────────────
function showItemToast(key) {
  const def = itemDef(key)
  itemToast.value = def ? t(def.i18n) : ''
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (itemToast.value = ''), 1400)
}

function selectSlot(i) {
  selectedSlot.value = i
  const s = inventory.value[i]
  if (s) showItemToast(s.item)
}

const heldItem = () => inventory.value[selectedSlot.value] || null

// O que a mão MOSTRA: ferramenta (com o tier certo), bloco, ou punho. Chamado
// quando o slot muda - sem isso a picareta de diamante aparece como pau.
function syncHeld() {
  if (!engine) return
  const it = heldItem()
  if (!it) return engine.viewmodel.setHeld({ kind: 'hand' })
  const bloco = placeableBlock(it.item)
  // Ferramenta e tocha viram PEÇA; qual peça é regra de jogo, e mora no serviço.
  const mao = maoDoItem(it.item, toolOf(it.item), bloco ? blockDef(bloco)?.key : null)
  if (mao) return engine.viewmodel.setHeld(mao)
  if (!bloco) return engine.viewmodel.setHeld({ kind: 'hand' })
  // As SEIS camadas de textura do bloco, na ordem +x,-x,+y,-y,+z,-z. A versão
  // anterior mandava `blockLayer: 1` - um número inventado que nem chegava ao
  // shader - e o cubo da mão saía preto (QA de 2026-08-20).
  const def = blockDef(bloco)
  return engine.viewmodel.setHeld({
    kind: 'block',
    faceLayers: camadasDoBloco(bloco, FACE_LAYERS),
    // O tint do bioma não está disponível aqui (é por coluna do mundo); pro
    // item na mão basta uma cor representativa, senão a grama sai cinza.
    tint: def?.tint === 'grass' ? 0x86b356 : def?.tint === 'foliage' ? 0x5d9d3f : 0xffffff,
  })
}
watch([selectedSlot, inventory], syncHeld, { deep: true })
const heldTool = () => {
  const s = heldItem()
  return s ? toolOf(s.item) : null
}

// ── Boot ────────────────────────────────────────────────────────────────────
// O mesmo estado entra por DOIS caminhos (o boot e a volta da sala, RC-03). Um
// aplicador só: com dois, o campo novo entrava num e esquecia o outro.
function aplicarEstadoDoSave(i, cru) {
  seed.value = i.seed
  mode.value = i.mode
  ticks = i.ticks
  inventory.value = i.inventory
  selectedSlot.value = i.hotbar
  pontoDeRenascimento.value = i.renascimento
  dragaoMorto.value = i.dragaoMorto
  // Baú e fornalha. Save de versão anterior não tem o campo e volta vazio.
  mobilia = desserializarMobilia(cru?.mobilia)
  noiseCtx = createNoiseContext(i.seed)
  if (i.survival) Object.assign(survival, i.survival)
}

async function boot() {
  loading.value = true
  fatalError.value = ''
  bootPct.value = 5
  bootMsg.value = t('roqueCraft.boot.textures')

  // 1. save. Não ter save e não CONSEGUIR LER o save são coisas diferentes, e
  // confundi-las apagava mundo (RC-02). As regras moram em serviço, com teste.
  const carga = await carregarSave({
    disponivel: saveDoJogo.disponivel(),
    ehE2E: emModoE2E(),
    ler: loadRoqueCraft,
  })
  const saved = carga.salvo
  estadoDaCarga.value = carga.estado
  avisarDaCarga(carga, t, props.host.avisar)
  const inicio = estadoInicial({
    salvo: saved,
    doHarness: emModoE2E() ? estadoE2E('roquecraftSeed') : null,
    nova: Math.floor(1 + Math.random() * 999999),
  })
  aplicarEstadoDoSave(inicio, saved)
  Object.assign(identidadeDoMundo, identidadeDe(saved, inicio.seed))
  // `Object.assign` e não troca de referência: o mapa é do composable (rule 44).
  Object.assign(corpoDoJogador.limparEfeitos(), efeitosDoSave(saved?.efeitos))

  // 2. qualidade
  //
  // A regra (preferência salva vence a detecção, MENOS num aparelho que já se
  // declarou incapaz) mora em `ajustes.js`, com teste. Aqui fica só a ligação
  // com o áudio, que é efeito e não regra.
  aplicarAjustes({
    ajustes: settings,
    detectada: detectQuality({ leve: props.host.desempenho.modoLeve() }),
    perfis: QUALITY,
    ehCelular: isMobile.value,
    salvos: saved?.settings,
  })
  if (saved?.settings) {
    audio?.setEnabled(settings.sound)
    audio?.setVolumeMusica(settings.music)
  }

  // 3 e 4. texturas, motor, áudio e entidades
  //
  // Nascem juntas e nesta ordem (o motor precisa das texturas, as entidades
  // precisam da cena do motor). A montagem e as decisões dela moram em
  // `cena.js`, com teste contra dublês.
  const cena = await criarCena({
    settings,
    canvas: canvasEl.value,
    container: rootEl.value,
    ehE2E: emModoE2E(),
    aoProgredir: (pct, msg) => {
      bootPct.value = pct
      bootMsg.value = t(msg)
    },
  })
  textures = cena.textures
  engine = cena.engine
  audio = cena.audio
  entities = cena.entities
  packInfo.value = cena.pack

  // 5. ícones do inventário
  //
  // Que camada é o topo do cubo, quem empresta ícone a quem, e o fato de as
  // duas metades caírem SOZINHAS moram em `icones.js`, com teste.
  icons.value = await montarIconesDoJogo(textures.manifest, (metade, err) =>
    console.warn(`[RoqueCraft] ícones de ${metade} não geraram:`, err?.message),
  )

  // 6. mundo
  bootPct.value = 70
  bootMsg.value = t('roqueCraft.boot.world')
  world = createWorldClient({
    seed: seed.value,
    renderDistance: settings.renderDistance,
    onMesh: (m) => engine?.setSection(m.cx, m.sy, m.cz, m),
    onUnload: (cx, cz) => engine?.removeChunk(cx, cz),
    onChunk: () => {
      loadedChunks.value = world.loadedCount
    },
  })

  // posição inicial: a salva (se ainda for válida) ou um spawn seco novo
  const olhar = pousarJogador(player, saved?.player || findSpawn(noiseCtx))
  yaw = olhar.yaw
  pitch = olhar.pitch

  if (saved?.edits) {
    for (const [k, m] of saved.edits) editsMap.set(k, new Map(m))
  }
  travessia.doSave(saved?.outrasDimensoes)
  // Quem fechou o jogo no Nether reabre no Nether, com o mundo de lá.
  if (saved?.dimensionId) world.definirDimensao(saved.dimensionId)
  entidades.restaurarDoSave(saved)
  world.start(toChunkCoord(Math.floor(player.x)), toChunkCoord(Math.floor(player.z)), editsMap)
  // ⚠️ Sem isto o broto plantado ontem continua igual hoje. Ver `acordarPlantios`.
  mundoVivo.acordarPlantios()

  // 7. espera o chunk do spawn antes de soltar o jogador (senão ele cai no vazio)
  bootPct.value = 85
  bootMsg.value = t('roqueCraft.boot.spawn')
  await waitForSpawnChunk()
  // `landingSpot` procura de CIMA pra baixo a partir do topo real. `safeSpawn`
  // varre de baixo pra cima e, numa coluna com caverna, devolve a bolha de ar
  // subterrânea - o jogador nascia dentro do morro. A política toda mora em
  // `chaoParaNascer` (ver o comentário lá; ela é a razão de este trecho ser uma
  // linha).
  const { safe } = chaoParaNascer()
  if (safe) {
    player.x = safe.x
    player.y = safe.y
    player.z = safe.z
  }
  player.fallStart = player.y

  // Guarda onde o save mandou o jogador estar. O menu sobe a câmera pra orbitar
  // o mundo; "Continuar" precisa saber pra onde voltar.
  savedPlayer = { x: player.x, y: player.y, z: player.z }
  hasSave.value = inicio.temSave
  saveDay.value = inicio.dia

  bootPct.value = 100
  loading.value = false
  // E2E entra direto no jogo: o harness fotografa o mundo, não a porta.
  if (emModoE2E() && !estadoE2E('roquecraftMenu')) menuOpen.value = false
  else enterMenu()
  lastTime = performance.now()
  rafId = requestAnimationFrame(frame)
}

// ── A abertura ──────────────────────────────────────────────────────────────
//
// Entrar no menu, pousar, começar do save e começar de novo moram em
// `composables/useRoqueCraftAbertura.js`. Sete funções que nunca tiveram teste
// porque o endereço não deixava: cada uma mexia num `let` daqui. Os `let` entram
// por par [ler, pôr] e as regras puras por injeção, que é o que dá teste a elas.
const abertura = useRoqueCraftAbertura({
  jogador: player,
  voando: flying,
  menuAberto: menuOpen,
  pausado: paused,
  temSave: hasSave,
  diaDoSave: saveDay,
  semente: seed,
  modo: mode,
  slotEscolhido: selectedSlot,
  inventario: inventory,
  sobrevivencia: survival,
  entidades,
  mundo: () => world,
  instante: [() => ticks, (v) => (ticks = v)],
  guinada: [() => yaw, (v) => (yaw = v)],
  inclinacao: [() => pitch, (v) => (pitch = v)],
  posicaoDoSave: [() => savedPlayer, (v) => (savedPlayer = v)],
  ruido: [() => noiseCtx, (v) => (noiseCtx = v)],
  ancorarMenu: (a) => (menuAnchor = a),
  cancelado: () => cancelled,
  soltarPonteiro: () => exitPointerLock(),
  regras: {
    blockDef,
    landingSpot,
    safeSpawn,
    melhorVista,
    politicaDeNascimento,
    createNoiseContext,
    createSurvivalState,
    creativeStarter,
    survivalStarter,
    findSpawn,
  },
})
const enterMenu = abertura.entrarNoMenu
const chaoParaNascer = abertura.chaoParaNascer
const startFromSave = abertura.comecarDoSave
const startNewWorld = abertura.comecarMundoNovo
const waitForSpawnChunk = abertura.esperarOChaoChegar

function openLobbyFromMenu() {
  openLobby()
}

function openSettingsFromMenu() {
  paused.value = true
}

async function retryBoot() {
  teardownGame()
  cancelled = false
  try {
    await boot()
    installE2EHook()
  } catch (err) {
    fail(err)
  }
}

function fail(err) {
  console.error('[RoqueCraft] init falhou:', err)
  loading.value = false
  fatalError.value = err?.message || String(err)
}

// ── Laço principal ──────────────────────────────────────────────────────────

// ── O OLHO NUNCA RENDERIZA DE DENTRO DE UM BLOCO ────────────────────────────
//
// Com a câmera DENTRO da geometria, o culling de face frontal apaga tudo que
// está entre o olho e o resto do mundo. O que sobra na tela é o avesso: pedaços
// soltos de terreno, tufos de grama sem apoio, o interior dos blocos em preto e
// céu nos vãos. É indistinguível de "o mapa está quebrado" — e foi exatamente
// assim que o founder descreveu o print de 2026-08-23: "o mapa gerado está lá
// no céu".
//
// ⚠️ Este guarda NÃO é o conserto de uma causa; é o fechamento de uma CLASSE.
// Eu não consegui reproduzir o quadro dele, e medi bastante pra afirmar isso:
// a geração não tem bloco desconectado nem nada opaco entre o jogador e o céu
// (62.720 colunas), a malha não tem face faltando (782 mil blocos no desktop,
// 53 mil no WebKit do iPhone), o renderer não emite erro, e o desencalhe tira o
// jogador de dentro da pedra em menos de 300 ms. Sobra a janela entre o instante
// em que o olho entra na geometria e o instante em que a física o tira — e é uma
// janela real: teto baixo, laje, degrau automático, um bloco colocado na própria
// cabeça, um frame de lag no celular dele.
//
// Um jogo não deve depender de a física ser rápida pra não mostrar o avesso do
// mundo. Aqui o olho sobe até a primeira célula livre; se não houver nenhuma em
// dois blocos, ele desce pros pés, que é o pior caso e ainda assim melhor que
// renderizar de dentro da pedra.
/**
 * A célula tapa a visão?
 *
 * ⚠️ Não basta `opaqueAt`. FOLHA não é opaca — ela é recorte — e mesmo assim
 * enche a tela: com a cabeça dentro de uma copa, o quadro inteiro vira verde
 * escuro. Medido em 2026-08-23 na semente 2024: nascimento correto no chão
 * (y=71), meio-dia, e brilho médio de 30 em 255.
 */
// O OLHO — onde a câmera está e quanta água há entre ela e o ar. As duas
// perguntas moravam a setecentas linhas uma da outra neste arquivo.
const olho = useRoqueCraftOlho({
  jogador: player,
  mundo: () => world,
  submerso: () => underwater.value,
  defDoBloco: blockDef,
})
const { posicao: olhoSeguro, profundidade: profundidadeDoOlho } = olho

/**
 * Que momento o jogo está vivendo, para a trilha.
 *
 * ⚠️ "TENSÃO" É MOB HOSTIL PERTO E ACORDADO, não mob hostil existindo. De noite
 * o mapa inteiro tem zumbi; se a mera existência ligasse a música de perigo,
 * ela tocaria a noite toda e deixaria de significar qualquer coisa. O gatilho é
 * o mesmo que a IA usa pra perseguir (`state === 'chase'`), dentro de
 * `PERTO_TENSAO` blocos - ou seja: alguma coisa está vindo atrás de você AGORA.
 *
 * A regra em si mora em `trilha.js`, que é quem conhece os momentos; aqui fica
 * só a leitura do estado do jogo que ela precisa.
 */
const momentoDaTrilha = () =>
  momentoAgora({
    morto: survival.dead,
    noMenu: menuOpen.value,
    mobs: entidades.mobs(),
    jogador: player,
    noite: isNight(ticks),
  })

// O JOGO ESTÁ RODANDO? Uma resposta só. A divergência que esta linha temia
// aconteceu quatro vezes, e virou mecanismo em `useRoqueCraftTelas`.
const jogoAtivo = () => !paramOMundo.value && !survival.dead

function frame(now) {
  if (cancelled) return
  rafId = requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - lastTime) / 1000 || 0)
  lastTime = now
  // ⚠️ SEM MOTOR, SEM QUADRO. `refazerMotor` descarta o motor e ESPERA o novo;
  // entre um e outro este laço chamava o renderer descartado, que subia textura
  // de novo num contexto que o motor seguinte herda — é o `glTexStorage2D:
  // Texture is immutable` que a sonda `console-limpo` contou (9 em 4 trocas).
  if (!engine || !entities) return

  painel.contarQuadro(dt)

  if (menuOpen.value) {
    // O relógio anda mais devagar na porta: a tela inicial não é pra ver o dia
    // passar. A órbita (e o porquê da velocidade dela) mora em `camera.js`.
    ticks = advanceTime(ticks, dt, RELOGIO_NO_MENU)
    const orbita = orbitaDoMenu({ ancora: menuAnchor, yaw, dt })
    yaw = orbita.yaw
    if (orbita.pos) {
      player.x = orbita.pos.x
      player.y = orbita.pos.y
      player.z = orbita.pos.z
      world.setPlayerPosition(player.x, player.y, player.z)
    }
  }
  if (jogoAtivo()) {
    // A VELOCIDADE, e não um `if` aqui: ver `useRoqueCraftCriativo`.
    ticks = advanceTime(ticks, dt, criativo.velocidade())
    stepGame(dt, now)
  }

  // CÂMERA NA CABEÇA, com o corpo por baixo.
  //
  // O balanço sai da MESMA fase que dispara o som do passo (`passo.js`), então
  // a cabeça afunda no instante em que a bota bate. Amarrar os dois por
  // construção é o que separa isto de dois efeitos rodando lado a lado com
  // relógios próprios — que é como estava, e é o que soava amador.
  //
  // Desligável: balanço de câmera provoca enjoo em parte das pessoas, e um
  // efeito de imersão que passa mal não é opcional de luxo.
  // O degrau, o baque, a inclinação e o campo de visão vivem em `camera.js`,
  // pelo mesmo motivo que a cadência vive em `passo.js`: amortecimento é conta,
  // e conta se afirma em teste sem abrir navegador.
  avancarCamera(camAnim, dt, corpoDoJogador.entradaDaCamera())
  const pose = poseDaCamera({
    olho: olhoSeguro(),
    yaw,
    bal: settings.viewBob === false ? null : balancoDaCamera(caminhada),
    cam: camAnim,
    fovBase: settings.fov,
  })
  // A escrita no objeto do three (e o portão de `updateProjectionMatrix`) mora
  // em `assentarCamera`. Aqui fica só quem é o motor e quem é o olhar.
  assentarCamera(engine.camera, pose, yaw, pitch, aplicarNaCamera)

  // ── A TRILHA SEGUE O MOMENTO, NÃO O RELÓGIO ──────────────────────────────
  //
  // O diretor está em `trilha.js`: ele escolhe a faixa E o tamanho do silêncio
  // depois dela. Aqui só se responde "que momento é este". A ordem importa —
  // morrer manda em tudo, perigo manda no horário, e o horário é o resto.
  audio?.setMomento(momentoDaTrilha())
  audio?.stepMusica(dt)

  climaDoJogo.passoPorQuadro(now / 1000)
  engine.updateEnvironment(ticks, now / 1000, {
    underwater: underwater.value,
    // Quantos blocos de água há ACIMA DO OLHO. Não é a profundidade da coluna
    // nem a altura do jogador: é a espessura de água entre a superfície e a
    // câmera, que é exatamente o que absorve a luz que chega até ela. Medir
    // pela coluna faria o mergulhador raso dentro de um mar fundo enxergar como
    // se estivesse no fundo.
    profundidade: profundidadeDoOlho(),
    // Por que o engine precisa saber se o olho vê o céu está no parâmetro dele.
    // O que é DAQUI: vem do cache de 4×/s e não do quadro — `skyExposed` varre a
    // coluna até o topo do mundo, e a rampa de 0,8 s da cortina engole os 250 ms.
    ceuAberto: ceuSobreOOlho.value,
    dimensao: world.dimensao,
    renderDistance: settings.renderDistance,
  })
  entities.stepParticles(dt)
  paisagem.passo(dt)
  entities.syncMobs(entidades.mobs(), dt)
  entities.syncDrops(entidades.drops(), dt, now / 1000)
  entities.syncFlechas(entidades.flechas())
  // `qaJogadores` so e preenchido pelo hook de E2E (inerte em producao): permite
  // fotografar avatares remotos - skin, animacao de andar, animacao de golpe -
  // sem subir uma segunda sessao de verdade so pra tirar um print.
  if (mp.active || qaJogadores)
    entities.syncPlayers(qaJogadores || lobbyPlayers.value.filter((p) => p.uid !== myUid.value), dt)

  // MÃO: balanço enquanto minera, bob de caminhada, e some quando tem UI por
  // cima (menu, inventário, pausa) - senão ela fica flutuando atrás do modal.
  const vm = engine.viewmodel
  vm.setVisible(jogoAtivo())
  vm.digging(!!entrada.minerando())
  // A mão lê a MESMA caminhada que a câmera e o som. Antes ela tinha o próprio
  // critério (`veloc > 0.9`) e o próprio relógio: três efeitos do mesmo passo,
  // cada um no seu tempo.
  vm.update(dt, { moving: caminhada.intensidade > 0.35 })

  mira.atualizarDestaque()
  engine.render()

  // O painel (posicao, relogio, bioma, chunks, ouvinte) anda a 4 Hz dentro de
  // `useRoqueCraftPainel`, que e dono da cadencia e dos refs.
  painel.atualizarPainel(dt)
}

// ── LEITO DE AMBIENTE ───────────────────────────────────────────────────────
//
// O founder pediu vento, chuva e pássaros por nome. Eles não são um "som de
// ambiente" único: são sete leitos independentes, e o que dá lugar ao jogo é a
// MISTURA — quanto de cada, agora, aqui.
//
// Quem decide é o jogo, porque só ele sabe o bioma, a hora e se o jogador está
// debaixo da terra. O motor de áudio não adivinha nada: recebe 0..1 por leito e
// faz a rampa. Rodar a cada 250 ms (junto com o HUD) é de sobra — a rampa de
// 1,5 s dentro do motor é o que torna a troca inaudível.
// ── CLIMA ───────────────────────────────────────────────────────────────────
//
// A regra do tempo é pura e mora em `services/roquecraft/clima.js`; a aplicação
// dela (bioma tem voto, rampa na fronteira, trovão agendado pela distância) tem
// dono próprio em `useRoqueCraftClima`, porque guarda uma fila de temporizadores
// que precisa morrer junto com o app. Reger o mundo é igual: o estado mora em
// `useRoqueCraftCriativo`. Aqui, nos dois casos, fica só a FIAÇÃO.
const biomaDebaixoDoJogador = () => world?.biomeAt(Math.floor(player.x), Math.floor(player.z)) ?? -1

const climaDoJogo = useRoqueCraftClima({
  semente: () => seed.value,
  ticks: () => ticks,
  nomeDoBioma: (id) => BIOME_NAMES[id] || '',
  ceuAberto: () =>
    !!world?.skyExposed(
      Math.floor(player.x),
      Math.floor(player.y + EYE_HEIGHT),
      Math.floor(player.z),
    ),
  aplicarNoMotor: (c) => engine?.setClima(c),
  tocarTrovao: (km) => audio?.trovao?.(km),
  temAudio: () => !!audio,
})
const criativo = useRoqueCraftCriativo({
  modo: () => mode.value,
  forcarChuva: (c) => climaDoJogo.forcar(c, biomaDebaixoDoJogador()),
  instante: () => instanteNaTela.value,
  irParaHora: (v) => (ticks = v),
  chuvaForcada: () => climaDoJogo.forcado.value,
  bioma: () => biomeLabel.value,
  nevando: () => climaAgora.neve > 0.05,
  soltarRaio: () => climaDoJogo.dispararRaio(),
  dimensao: () => world?.dimensao ?? 'overworld',
  irParaDimensao: (d) => travessia.irPara(d), // a porta é a da TRAVESSIA

  emSala: () => mp.active,
  avisar: (c) => notificar({ type: 'info', message: t(c) }),
})
criativo.vigiarModo(mode)

const climaAgora = climaDoJogo.clima
const ceuSobreOOlho = climaDoJogo.ceuSobreOOlho

// A MISTURA mora em `services/roquecraft/ambiente`: qual leito toca e com que
// força é regra pura e testável sem montar o jogo. Aqui fica só o que o
// componente sabe e o serviço não: quem é o mundo, onde está o jogador e que
// horas são.
// A paisagem (cachoeira, borrifo e mistura de ambiente, com as três cadências)
// mora em `paisagemSonora.js`. Aqui fica só o que o componente sabe.
const paisagem = criarPaisagemSonora({
  mundo: () => world,
  motorDeEntidades: () => entities,
  audio: () => audio,
  jogador: player,
  pausado: () => paused.value,
  noite: () => nightNow.value,
  submerso: () => underwater.value,
  chuva: () => climaAgora.chuva,
})

function stepGame(dt, agora) {
  // O CORPO: fisica, passo, agua, camera e sobrevivencia moram em
  // `useRoqueCraftCorpo`, que e dono deles. Aqui fica o que sobra: as acoes que
  // o jogador segurou, o relogio do combate, a mobilia e as entidades.
  const res = corpoDoJogador.passo(dt, agora)
  if (!res) return
  // Atravessar TROCA O MUNDO no meio do quadro: o resto do passo falaria de um
  // mundo que não existe mais. Sai daqui e volta no quadro seguinte.
  if (travessia.passo(dt)) return

  // mineracao continua
  if (entrada.quebrando()) tickMining(dt)
  // colocacao continua: segurar o botao direito levanta parede
  if (construcao.colocando) tickColocar(dt)
  if (attackCooldown > 0) attackCooldown = Math.max(0, attackCooldown - dt)
  // O aviso de critico some sozinho. Ele existe pra dizer "esse golpe foi o
  // bom", e um aviso que fica na tela para de significar isso.
  if (ultimoGolpe) {
    ultimoGolpe.t += dt
    if (ultimoGolpe.t > 0.5) ultimoGolpe = null
  }
  // Os recibos da mira vão a cada QUADRO, nao nos 4 Hz do resto do painel: numa
  // recarga de 0,625 s, 4 Hz dao tres degraus e a barra pula em vez de encher.
  passoDaMira()

  // As fornalhas queimam mesmo com a tela fechada - quem acende e vai minerar
  // volta e encontra as barras prontas, que e o contrato do original.
  paineis.tique(dt)
  // O estoque do aldeão volta devagar: baú de uso único ensina o jogador a
  // matar a aldeia, e estoque infinito apaga a escassez. O meio é `comercio.js`.
  paineis.passoDoComercio(entidades.mobs(), dt)

  entidades.passoDasCriaturas(dt, EYE_HEIGHT)
  entidades.passoDasFlechas(dt)
  entidades.passoDosItens(dt)
  tickQuedas(dt)
  if (mp.active) stepMultiplayer(dt)
}

function onDeath(source) {
  deathReason.value = t(`roqueCraft.death.${source || 'generic'}`)
  entidades.largarEspolio(espolioDaMorte(inventory.value, player, survival.armadura))
  inventory.value = createInventory()
  exitPointerLock()
}

/**
 * DORMIR.
 *
 * Pula pro amanhecer e grava o ponto de renascimento. As duas coisas juntas,
 * porque é a segunda que transforma um buraco na montanha em base — sem ela a
 * cama é só um botão de pular a noite.
 *
 * O ponto guardado é o do PÉ da cama, sempre, mesmo quando se clica na
 * cabeceira: renascer com a cabeça dentro da parede seria uma forma criativa
 * de perder o jogador que acabou de achar o caminho de casa.
 */
function dormir(celula) {
  const id = world.getBlock(celula.x, celula.y, celula.z)
  const outra = outraMetade(id, celula.x, celula.y, celula.z, (x, y, z) => world.getBlock(x, y, z))
  // O ponto de renascimento é o PÉ da cama — a metade em que o jogador deita.
  // `ehCabeceira` em vez de comparar com um id: são oito agora, e comparar com
  // um só daria "não é cabeceira" nas outras três direções.
  const pe = ehCabeceira(id) ? outra || celula : celula
  const hostis = entidades.mobs().filter((m) => MOB_TYPES[m.type]?.hostile)
  const veredito = podeDormir({
    ticks,
    monstroPerto: monstroPerto(hostis, player.x, player.z),
  })
  if (!veredito.ok) {
    avisoDaCama.value = t(`roqueCraft.bed.${veredito.motivo}`)
    setTimeout(() => (avisoDaCama.value = ''), 2600)
    return true
  }
  ticks = amanhecerDepoisDe(ticks)
  pontoDeRenascimento.value = { x: pe.x + 0.5, y: pe.y + 1, z: pe.z + 0.5 }
  avisoDaCama.value = t('roqueCraft.bed.dormiu')
  setTimeout(() => (avisoDaCama.value = ''), 2600)
  scheduleSave()
  return true
}

/**
 * Renasce NA CAMA se houver uma; senao, no nascimento do mundo. E o contrato do
 * jogo de referencia, e e o que da sentido a construir base longe.
 *
 * Quem sabe POR o corpo num ponto e o composable do corpo; quem sabe ONDE e
 * este componente, porque a cama e o ruido do mundo moram aqui.
 */
function respawnPlayer() {
  deathReason.value = ''
  // Quem morre no Fim renasce no overworld: a dimensão troca ANTES do corpo.
  travessia.voltarDoFim()
  corpoDoJogador.renascerEm(pontoDeRenascimento.value || findSpawn(noiseCtx))
  scheduleSave()
}

// ── Mirar, quebrar, colocar ─────────────────────────────────────────────────
// A MIRA mora em `services/roquecraft/mira.js`: o raio, os dois alvos (o que se
// quebra e o que o balde pega), o contorno, a rachadura e o fantasma. O motor e
// o mundo entram por acessador porque os dois são recriados em tempo de jogo.
const mira = criarMira({
  engine: () => engine,
  mundo: () => world,
  jogador: player,
  olhar: () => ({ yaw, pitch }),
  modo: () => mode.value,
  bloqueado: () => paused.value || inventoryOpen.value,
  minerando: () => entrada.minerando(),
  naMao: heldItem,
})
const currentTarget = () => mira.alvo()

function tickMining(dt) {
  passoDaMineracao(dt, {
    alvo: currentTarget()?.hit ?? null,
    blocoEm: (x, y, z) => world.getBlock(x, y, z),
    quebravel: (id) => id !== AIR && !isUnbreakable(id),
    minerando: () => entrada.minerando(),
    definirMinerando: (m) => entrada.definirMinerando(m),
    tempoDeQuebra: (id) =>
      breakTime(id, heldTool()) * fatorDeEficiencia(heldItem()?.enc?.eficiencia),
    criativo: mode.value === 'creative',
    aoBater: (id) => audio?.dig(familyOf(blockDef(id)?.key)),
    aoQuebrar: (x, y, z, id) => breakBlock(x, y, z, id),
  })
}

function breakBlock(x, y, z, id) {
  const def = blockDef(id)
  for (const s of quebrarMobilia(x, y, z)) {
    soltarItem(s.item, s.count, x + 0.5, y + 0.4, z + 0.5, 0xbb9660, { dur: s.dur })
  }
  applyEdit(x, y, z, AIR)
  // CAMA E PORTA VÃO INTEIRAS (`duplos.js`): a metade órfã é um objeto meio
  // vivo, e não dropa nada — a peça já saiu com a primeira.
  const gemea = metadeGemea(id, x, y, z, (a, b, c) => world.getBlock(a, b, c))
  if (gemea) {
    applyEdit(gemea.x, gemea.y, gemea.z, AIR)
    entities.spawnBreak(gemea.x, gemea.y, gemea.z, blockTintColor(blockDef(gemea.id)))
  }
  entities.spawnBreak(x, y, z, blockTintColor(def))
  audio?.breakBlock(familyOf(def?.key))
  engine?.viewmodel.swing('hit')
  if (mode.value === 'survival') {
    // TODOS os drops: folha de carvalho dá muda E maçã; cascalho dá pederneira.
    for (const drop of blockDrops(id, heldTool())) {
      soltarItem(drop.item, drop.count, x + 0.5, y + 0.3, z + 0.5, blockTintColor(def))
    }
    if (def?.xp) addXp(survival, def.xp)
    addExhaustion(survival, 'mine')
    if (heldItem()?.dur != null) gastarFerramentaNaMao()
  }
  // A gravidade NÃO mora mais aqui. `applyEdit` acorda a vizinhança e a fila
  // decide quem cai, até onde e em cascata — inclusive quando o apoio some por
  // caminhos que não passam por quebrar um bloco.
}

// Gastar UM da pilha na mão, e DURABILIDADE da ferramenta. Estavam copiados em
// cinco lugares, e repor o array (2ª linha) é o que alguém esquece.
function gastarUmNaMao() {
  consumeOne(inventory.value, selectedSlot.value)
  inventory.value = inventory.value.slice()
}
const gastarFerramentaNaMao = (quanto = 1) => maoDaBancada.gastar(selectedSlot.value, quanto)

/**
 * A ponte que `usoDeFerramenta.js` usa pra agir no mundo: quem sabe onde estão
 * o mundo, o inventário, o som e o save é o componente, e só ele.
 */
function contextoDeUso() {
  return {
    mundo: world,
    modo: mode.value,
    alturaDoMundo: WORLD_HEIGHT,
    editar: applyEdit,
    tocar: (familia) => audio?.place(familia),
    balancar: () => engine?.viewmodel.swing('hit'),
    salvar: scheduleSave,
    dentroDoJogador: (x, y, z) => dentroDoJogador(x, y, z, player),
    trocar: (chave) => {
      inventory.value = trocarItem(inventory.value, selectedSlot.value, chave)
    },
    cansar: () => addExhaustion(survival, 'mine'),
    comer: (def) => eat(survival, def),
    consumir: gastarUmNaMao,
    gastarFerramenta: gastarFerramentaNaMao,
    tomarEfeito,
    armarArco: () => entidades.armarArco(),
    levantarGuarda: () => corpoDoJogador.levantarGuarda(),
    pocaoNaMao: () => heldItem()?.pocao ?? null,
    fortaleza: () => ondeFicaAFortaleza(fortalezaDaSemente(seed.value), player),
    rumo: (r) => t(`roqueCraft.rumo.${r}`),
    avisar: (chave, p) => notificar({ type: 'info', message: t(chave, p) }),
    arremessar: (item, pocao) => entidades.arremessar(item, pocao, mira.raio().dir),
  }
}

// Devolve `true` se colocou de fato. Sem retorno, o QA nao tinha COMO saber se
// a tocha entrou - contava 5 chamadas e 0 tochas, sendo que o problema era o
// proprio doPlace() nunca devolver nada (QA de 2026-08-19).
/**
 * A criatura sob a mira, se houver.
 *
 * ⚠️ UMA CÓPIA SÓ. Este laço nasceu dentro de `tryAttack` e a pecuária precisava
 * do mesmo. Duplicá-lo daria duas noções de "estou mirando no bicho" que
 * concordariam hoje e divergiriam no dia em que o cone ou o alcance mudassem —
 * e o sintoma seria "consigo bater mas não consigo alimentar", que ninguém liga
 * a um cone de mira.
 */
function mobMirado(alcance = 4) {
  const { origin, dir } = mira.raio()
  return entidades.mirado(origin, dir, alcance)
}

/**
 * Clique direito na CRIATURA: alimentar (pra procriar) e tosquiar.
 *
 * ⚠️ VEM ANTES DE COLOCAR BLOCO. Se `doPlace` resolvesse o bloco primeiro,
 * apontar pra ovelha com trigo na mão... não faria nada (trigo não é bloco) —
 * mas apontar com um bloco na mão colocaria um cubo DENTRO da vaca, que é o
 * defeito clássico e o motivo de o original também tratar a entidade primeiro.
 */
function tryInteractMob() {
  const alvo = mobMirado()
  if (!alvo) return false

  // ⚠️ O COMÉRCIO VEM ANTES DO `held`: tosquiar e alimentar exigem item na mão,
  // comerciar não. Com a checagem de `held` no topo, clicar num aldeão de mão
  // vazia não fazia nada — e é assim que o jogador chega na aldeia.
  if (paineis.comercio.abrirCom(alvo, mobDef(alvo)?.comercia)) {
    exitPointerLock()
    return true
  }

  const held = heldItem()
  if (!held) return false

  if (podeTosquiar(alvo, itemDef(held.item)?.tool?.kind)) {
    const n = tosquiar(alvo)
    if (n > 0) soltarItem('whiteWool', n, alvo.x, alvo.y + 0.5, alvo.z, MOB_TYPES.sheep.color)
    scheduleSave()
    return true
  }

  if (alimentar(alvo, held.item)) {
    // Modo criativo não consome, como em todo o resto do jogo.
    if (mode.value === 'survival') gastarUmNaMao()
    scheduleSave()
    return true
  }
  return false
}

// O RABO DE TODA COLOCAÇÃO: registrar pro construtor, tocar, balançar a mão,
// gastar o item e agendar o save. Estava copiado em cada caminho de `doPlace`,
// e cada cópia era uma chance de esquecer uma das cinco — foi assim que a cama
// já saiu de graça no survival numa versão anterior.
function fecharColocacao(celula, som) {
  registrarColocado(construcao, chaveDaCelula(celula.x, celula.y, celula.z))
  audio?.place(som)
  engine?.viewmodel.swing('hit')
  if (mode.value !== 'creative') gastarUmNaMao()
  scheduleSave()
  return true
}

function doPlace() {
  if (paused.value || inventoryOpen.value) return false
  if (tryInteractMob()) return true
  const held = heldItem()
  if (!held) {
    // MÃO VAZIA: o botão direito segurado levanta a guarda — o braço apara
    // metade do golpe de bicho (`escudo.js`). Não é colocação, devolve false.
    corpoDoJogador.levantarGuarda()
    return false
  }
  const def = itemDef(held.item)
  // A escada de "o que a mão faz quando não é bloco" mora em
  // `usoDeFerramenta.js`: `null` quer dizer "não é caso dela, siga e coloque".
  const alvos = { alvo: currentTarget(), liquido: mira.alvoDeLiquido() }
  const usou = usarItemNaMao(def, held.item, alvos, contextoDeUso())
  if (usou !== null) return usou

  const hit = currentTarget()
  if (!hit) return false

  // ONDE CAI E SE CABE é UMA conta só, em `colocacao.js` — a MESMA que o
  // fantasma da mira usa. Enquanto eram duas, elas divergiam na fusão de laje:
  // a peça entrava na célula do alvo e o fantasma aparecia na vizinha.
  const plano = resolverColocacao({
    item: held.item,
    hit,
    olhar: direcaoDoOlhar(yaw, pitch),
    mundo: world,
    jogador: player,
  })
  if (!plano) return false

  for (const c of plano.celulas) applyEdit(c.x, c.y, c.z, c.id)
  const som = plano.cama ? 'wood' : familyOf(blockDef(plano.celulas[0].id)?.key)
  return fecharColocacao(plano.principal, som)
}

/**
 * Um passo da colocação contínua. Chamado todo quadro com o botão direito
 * segurado: a regra de cadência mora em `construcao.js`, aqui fica só o
 * acesso ao mundo.
 */
function tickColocar(dt) {
  if (paused.value || inventoryOpen.value) {
    soltarColocar(construcao)
    return
  }
  const hit = currentTarget()
  const celula = hit ? chaveDaCelula(hit.place.x, hit.place.y, hit.place.z) : null
  if (avancarColocar(construcao, dt, celula)) doPlace()
}

/**
 * Pick block: mirar num bloco e ficar com ele na mão.
 *
 * No criativo dá o item; na sobrevivência só seleciona o que já se tem — que é
 * o contrato do jogo de referência. Segundo maior ganho de ergonomia de
 * construção depois de colocar segurando: sem isto, trocar de material no meio
 * de uma parede é uma viagem ao inventário.
 */
function pickBlock() {
  const hit = currentTarget()
  if (!hit) return false
  const id = world.getBlock(hit.hit.x, hit.hit.y, hit.hit.z)
  const item = blockDef(id)?.key
  if (!item || !itemDef(item)) return false
  const plano = escolherPickBlock(
    inventory.value,
    item,
    selectedSlot.value,
    HOTBAR_SIZE,
    mode.value === 'creative',
  )
  if (!plano) return false
  inventory.value = aplicarPickBlock(inventory.value, plano, item, maxStack(item))
  selectSlot(plano.slot)
  scheduleSave()
  return true
}

// A escada de "o que o bloco faz quando alguém clica nele" mora em
// `interacao.js`, irmã de `usarItemNaMao`. Aqui fica só quem é quem.
function tryInteract() {
  return interagirComBloco(currentTarget(), {
    ...contextoDeUso(),
    blocoEm: (x, y, z) => world.getBlock(x, y, z),
    dormir,
    blocoDoPortao: BLOCO_DO_PORTAO,
    varianteDePortao: VARIANTE_DE_PORTAO,
    naMao: heldItem,
    nivelDoJogador: () => survival.level,
    gastarNiveis: (n) => {
      survival.level -= n
    },
    encantar: (enc) => {
      const s = inventory.value[selectedSlot.value]
      if (s) s.enc = enc
      inventory.value = inventory.value.slice()
    },
    abrirBancada: () => {
      craftGridSize.value = 3
      openInventory()
    },
    abrirMobilia: (tipo, em) => {
      abrirMobilia(mobilia, em.x, em.y, em.z, tipo)
      aberto.value = { tipo, x: em.x, y: em.y, z: em.z }
      exitPointerLock()
    },
  })
}

// ── O mundo que se mexe ─────────────────────────────────────────────────────
//
// A fila diz QUEM reavaliar; `gravidade.js` diz se cai e até onde; `quedas.js`
// segura quem está no ar. Nada disso mora aqui — aqui mora só a ligação.

// Os dois fluidos, na ordem em que são consultados. A água primeiro porque é a
// mais rápida: numa célula que os dois querem, quem chega primeiro é ela, e o
// encontro resolve no tique seguinte.

/** Fonte é o líquido de sempre — água id 21, lava id 22. O resto tem nível. */

// Só pro QA: congelar a queda no ar. Um bloco caindo anda onze blocos por
// segundo, e entre projetar a posição e o obturador abrir ele já saiu do
// recorte — a sonda mediu céu três vezes achando que media areia. Com a cena
// parada, mira e medida falam do mesmo instante.

// ── Ataque corpo a corpo ────────────────────────────────────────────────────
//
// O golpe inteiro (recarga, dano, morte, tranco, cansaço e durabilidade) mora
// em `golpear`, dentro de `combate.js`. Aqui fica só quem é quem — e é por isso
// que a rede, o rebanho e a mira entram por injeção: cada um deles é um `let`
// deste módulo, recriado em mundo novo (rule 44).
function tryAttack() {
  return golpear({
    jogador: player,
    mirado: mobMirado,
    naMao: heldItem,
    definicaoDe: itemDef,
    correndo: () => !!(keys.ControlLeft || keys.ControlRight),
    // ⚠️ AS DUAS SOMAM: um `if` escolhendo entre poção e encanto faria a força
    // parecer quebrada justamente pra quem já tem espada afiada.
    baseDoDano: (def, naMao) =>
      (def?.attack || 1) + bonusDeAfiacao(naMao?.enc?.afiacao) + bonusDeForca(efeitos),
    recarga: {
      restante: () => attackCooldown,
      total: () => recargaAtual,
      reiniciar: (v) => {
        recargaAtual = v
        attackCooldown = v
      },
    },
    registrarGolpe: (g) => (ultimoGolpe = g),
    // No multijogador, o convidado só AVISA: quem resolve é o anfitrião.
    souQuemResolve: () => !(mp.active && !mp.isHost),
    avisarRede: (alvo, dano) =>
      salaDoJogo.sendHit(mp.code, { mobId: alvo.id, damage: dano, by: myUid.value }),
    ferir: (m, d) => hurtMob(m, d, true),
    morreu: (alvo) => {
      entidades.spawnDropsFrom(alvo)
      entidades.remover(alvo)
    },
    empurrar: (alvo, dx, dz, extra) => empurrar(alvo, dx, dz, FORCA_EMPURRAO + extra),
    cansar: () => {
      if (mode.value === 'survival') addExhaustion(survival, 'attack')
    },
    // O MESMO caminho da picareta: o inquebrável poupa a espada também.
    gastarFerramenta: () => gastarFerramentaNaMao(),
  })
}

// ── Inventário e crafting ───────────────────────────────────────────────────
function openInventory() {
  inventoryOpen.value = true
  exitPointerLock()
}
function toggleInventory() {
  if (inventoryOpen.value) closeInventory()
  else {
    craftGridSize.value = 2
    openInventory()
  }
}
function closeInventory() {
  // Fechar devolve TUDO: em lugar nenhum deste jogo fechar destrói alguma coisa.
  const r = devolverAoInventario({
    inventario: inventory.value,
    cursor: cursorStack.value,
    grade: craftSlots.value,
  })
  inventory.value = r.inventario
  cursorStack.value = r.cursor
  craftSlots.value = r.grade
  inventoryOpen.value = !r.coubeTudo // não coube tudo: a janela fica (RC-01)
  scheduleSave()
}

// A cola dos gestos da bancada e da mochila com os refs mora em
// `criarMaoDaBancada`. A regra ("pergunta antes de entregar") já custou item
// de graça uma vez: RC-01. A armadura vestida vive em `survival.armadura`.
const maoDaBancada = criarMaoDaBancada({
  inventario: { get: () => inventory.value, set: (v) => (inventory.value = v) },
  grade: { get: () => craftSlots.value, set: (v) => (craftSlots.value = v) },
  cursor: { get: () => cursorStack.value, set: (v) => (cursorStack.value = v) },
  armadura: { get: () => survival.armadura, set: (v) => (survival.armadura = v) },
  resultado: { get: () => craftResult.value },
  salvar: scheduleSave,
  aoQuebrar: () => notificar({ type: 'warning', message: t('roqueCraft.toolBroke') }),
})
const onSlotClick = (index, button) => maoDaBancada.cliqueNoSlot(index, button)
const onCraftClick = (index, button) => maoDaBancada.cliqueNaGrade(index, button)
const takeCraftResult = () => maoDaBancada.retirar()
const autoCraft = (receita) => maoDaBancada.montar(receita)
const giveCreative = (key) => maoDaBancada.dar(key)

// ── Entrada (teclado / mouse) ───────────────────────────────────────────────
// ── O NAVEGADOR ROUBANDO O TECLADO DO JOGO ──────────────────────────────────
//
// "ctrl + w para correr está fechando o navegador" — founder, 25/08/2026.
//
// Correr é Ctrl e andar pra frente é W: o gesto mais banal do gênero é, no
// navegador, o atalho de FECHAR A ABA. E não é só ele — correndo com Ctrl
// preso, os números do inventário viram troca de aba (Ctrl+1..9), o Q vira
// fechar janela, o S vira salvar página, o D vira favoritar. O jogo estava
// perdendo o teclado pro navegador em quase toda combinação com Ctrl.
//
// A defesa é em três camadas, porque nenhuma sozinha basta:
//
//  1. `preventDefault` na tecla do jogo. Resolve Ctrl+S, Ctrl+D, Ctrl+F,
//     Ctrl+P, Ctrl+E — que o navegador deixa a página cancelar.
//  2. Keyboard Lock, em tela cheia. Ctrl+W, Ctrl+T, Ctrl+N e Ctrl+1..9 são
//     RESERVADOS: `preventDefault` não os segura em navegador nenhum. A única
//     API que segura é `navigator.keyboard.lock()`, e ela só funciona em tela
//     cheia. É por isso que ela é pedida junto do pedido de tela cheia.
//  3. DUPLO-TOQUE NO W pra correr. É a saída que não depende de API nenhuma:
//     funciona no Safari, no Firefox e fora de tela cheia, que é onde as duas
//     camadas acima não alcançam. O Ctrl continua valendo pra quem prefere.

function dropHeld() {
  const s = heldItem()
  if (!s) return
  entidades.largarAFrente(s.item, mira.raio())
  gastarUmNaMao()
}

// Navegador nenhum toca áudio antes de um gesto. Este é o gesto.
//
// O banco de amostras só começa a baixar AQUI, e não no boot, por dois motivos:
// `decodeAudioData` precisa de um `AudioContext`, que não pode nascer antes do
// gesto; e 87 arquivos competindo com o primeiro frame roubariam exatamente o
// momento em que o jogador está olhando. Enquanto não chega, cada efeito cai na
// síntese sozinho — o jogo faz som desde o primeiro clique.
function ouvirPrimeiroGesto() {
  window.addEventListener('pointerdown', destravarAudio, { once: true, capture: true })
  window.addEventListener('keydown', destravarAudio, { once: true, capture: true })
  window.addEventListener('touchstart', destravarAudio, {
    once: true,
    capture: true,
    passive: true,
  })
}

function destravarAudio() {
  audio?.unlock()
  audio?.carregar?.()
  syncHeld()
}

// ── Pausa, ajustes, modo ────────────────────────────────────────────────────
function togglePause() {
  paused.value = !paused.value
  if (paused.value) exitPointerLock()
  else if (!isMobile.value) requestLock()
}
function resumeGame() {
  paused.value = false
  venceu.value = false
  if (!isMobile.value) requestLock()
}
function toggleFly() {
  if (mode.value !== 'creative') return
  flying.value = !flying.value
  player.vy = 0
}

function setMode(next) {
  if (mode.value === next) return
  mode.value = next
  if (next === 'creative') {
    inventory.value = creativeStarter()
    Object.assign(survival, createSurvivalState())
    entidades.removerHostis()
  } else {
    flying.value = false
  }
  scheduleSave()
}

// ── A troca de qualidade ────────────────────────────────────────────────────
//
// Mora em `composables/useRoqueCraftQualidade.js`: o motor morre e nasce de
// novo (sombra e pós são decididos na criação), o mundo volta com as edições, e
// a falha avisa em vez de deixar o jogador sem renderer. `engine` e `entities`
// entram por par [ler, pôr] porque é a NULIFICAÇÃO deles que segura o `frame`.
const qualidade = useRoqueCraftQualidade({
  ajustes: settings,
  motor: [() => engine, (v) => (engine = v)],
  criaturas: [() => entities, (v) => (entities = v)],
  som: () => audio,
  mundo: () => world,
  texturas: () => textures,
  semente: () => seed.value,
  mapaDeEdicoes: () => editsMap,
  tela: () => ({ canvas: canvasEl.value, container: rootEl.value }),
  raioDaRede: (r) => multijogador.definirRaio(r),
  agendarSave: () => scheduleSave(),
  avisarDaFalha: (err) => {
    console.error('[RoqueCraft] troca de qualidade falhou:', err)
    notificar({ type: 'negative', message: t('roqueCraft.error.quality') })
  },
  montarMotor,
  ehE2E: () => emModoE2E(),
})
const applySettings = (proximos) => qualidade.aplicarAjustes(proximos)

// ── Persistência ────────────────────────────────────────────────────────────
// O QUE vai pro disco mora aqui; QUANDO vai mora em `useRoqueCraftPersistencia`.
// Esta função é a ÚNICA fonte do payload: o autosave e o gancho de QA leem a
// mesma. Quando eram duas cópias, a sonda media uma reconstrução do save em vez
// do save — e teria dado verde num campo que o jogo nunca gravou.
function montarPayloadDeSave() {
  return buildSavePayload({
    ...identidadeDoMundo, // worldId, generatorVersion (onda 2)
    // ⚠️ A DIMENSÃO É A VIVA, não a que o save trouxe. `identidadeDoMundo` é a
    // identidade de ABERTURA; gravar o `dimensionId` dela mandaria o jogador
    // renascer no overworld com as edições do Nether na mão.
    dimensionId: world.dimensao,
    seed: seed.value,
    // os edits vivem no pipeline (worker); o cliente pede o dump
    edits: collectEdits(),
    outrasDimensoes: travessia.paraSave(world.dimensao),
    player: { x: player.x, y: player.y, z: player.z, yaw, pitch },
    inventory: inventory.value,
    survival,
    efeitos,
    ticks,
    mode: mode.value,
    hotbar: selectedSlot.value,
    settings: { ...settings },
    mobilia: serializarMobilia(mobilia),
    renascimento: pontoDeRenascimento.value,
    dragaoMorto: dragaoMorto.value,
    drops: entidades.drops(),
    mobs: entidades.mobs(),
  })
}

const persistencia = useRoqueCraftPersistencia({
  montarPayload: montarPayloadDeSave,
  gravar: (payload) => saveRoqueCraft(payload),
  // Gravar exige conta (`progresso.disponivel()`, que era o uid); agendar não (o
  // login pode terminar durante os 2,5 s de espera). A quarta porta é RC-02, e o
  // porquê dela está em `cargaDoSave.js`.
  // A quinta porta (recusar gravação fora do overworld) SAIU na v10 do save: ela
  // existia porque havia um mapa de edições só, e agora há um por dimensão.
  podeGravar: () =>
    saveDoJogo.disponivel() && !mp.active && !emModoE2E() && podeSalvar(estadoDaCarga.value),
  podeAgendar: () => !mp.active && !emModoE2E() && podeSalvar(estadoDaCarga.value),
})

function scheduleSave() {
  persistencia.agendar()
}

async function persist() {
  await persistencia.agora()
}

// O worker é dono do mundo, mas o SAVE e o `reset` (troca de qualidade, entrar
// e sair de sala) precisam dos edits do lado de cá. O cliente mantém o mesmo
// mapa: "cx,cz" → Map<índiceLocal, id>. Custa uma entrada por bloco editado.
// O REGISTRO DE EDIÇÕES mora em `services/roquecraft/edicoes.js`: é ele que
// sabe agrupar por chunk, colapsar sobrescrita e respeitar o teto do payload.

// ── Multiplayer ─────────────────────────────────────────────────────────────
// ── MULTIJOGADOR ────────────────────────────────────────────────────────────
//
// A sala inteira (assinaturas, chat, lobby, publicacao por quadro, volta pro
// solo) mora em `useRoqueCraftMultijogador`. E composable e nao servico porque
// guarda ASSINATURAS que precisam ser canceladas.
//
// O que fica aqui e a `sessao`: a interface pela qual a rede enxerga a partida.
// Ela existe pra o composable NAO receber vinte e tres variaveis soltas - um
// contexto assim nao e separacao, e mudanca de endereco (rule 44).

// A ponte com o multijogador mora em `sessaoDeRede.js`. Aqui, só o acesso ao
// mundo vivo: `let` por getter, os escritos por par, como manda a rule 44.
const sessaoDeRede = criarSessaoDeRede({
  player: () => player,
  yaw: () => yaw,
  survival: () => survival,
  itemNaMao: () => heldItem()?.item || '',
  skin: () => settings.skin,
  minerando: () => entrada.minerando(),
  entidades: () => entidades,
  ferirCriatura: (m, dano) => hurtMob(m, dano),
  world: () => world,
  audio: () => audio,
  seed: () => seed.value,
  modo: () => mode.value,
  editsMap: () => editsMap,
  mobiliaSerializada: () => serializarMobilia(mobilia),
  entradaDeMobilia: paineis.entradaDeMobilia,
  entradaParaEnvio: paineis.entradaParaEnvio,
  aplicarMobilia: paineis.aplicarMobilia,
  limparMobilia: () => (mobilia = criarMobilia()),
  ticks: () => ticks,
  definirInstante: (v) => (ticks = v),
  climaForcado: () => climaDoJogo.forcado.value,
  forcarClima: (c) => climaDoJogo.forcar(c, biomaDebaixoDoJogador()),
  raioDeSync: () => Math.min(8, settings.renderDistance),
  centroEmChunk: () => [toChunkCoord(Math.floor(player.x)), toChunkCoord(Math.floor(player.z))],
  definirSemente: (semente) => (seed.value = semente),
  criarRuido: (semente) => createNoiseContext(semente),
  definirRuido: (n) => (noiseCtx = n),
  procurarSpawn: () => findSpawn(noiseCtx),
  guardar: () => persist(),
  definirSkin: (id) => {
    settings.skin = normalizeSkinId(id) || SKIN_PADRAO
    return settings.skin
  },
  payloadDoSave: () => parseSave(montarPayloadDeSave()),
  aplicarEstado: aplicarEstadoDoSave,
  aplicarEdicoes: (edits) => {
    editsMap.clear()
    for (const [k, m] of edits) editsMap.set(k, new Map(m))
  },
  posicionarJogador: (p) => {
    const alvo = p || findSpawn(noiseCtx)
    player.x = alvo.x
    player.y = alvo.y
    player.z = alvo.z
    player.vy = 0
    if (Number.isFinite(p?.yaw)) yaw = p.yaw
    if (Number.isFinite(p?.pitch)) pitch = p.pitch
  },
})

const multijogador = useRoqueCraftMultijogador({
  rede: salaDoJogo,
  identidade: { nomePadrao: () => t('roqueCraft.mp.player') },
  sessao: sessaoDeRede,
  ui: {
    paused,
    // ⚠️ POR FUNCAO, NAO POR VALOR. `exitPointerLock` nasce da entrada, montada
    // DEPOIS desta. Passar o valor aqui e `ReferenceError` no setup: lint e os
    // 7.445 testes verdes com o jogo inteiro sem subir (26/08). Ver rule 44.
    sairDoPonteiro: () => entrada.exitPointerLock(),
    focarChat: () => nextTick(() => chatInputEl.value?.focus()),
    avisar: (chave) =>
      notificar({
        type: chave === 'copied' ? 'success' : 'info',
        message: t(`roqueCraft.mp.${chave}`),
      }),
  },
})

const {
  mp,
  semConta,
  lobbyOpen,
  lobbyPlayers,
  chatOpen,
  chatDraft,
  chatLog,
  openLobby,
  closeLobby,
  escolherSkin,
  hostRoom,
  joinByCode,
  leaveMultiplayer,
  stepMultiplayer,
  copyInvite,
  openChat,
  closeChat,
  submitChat,
} = multijogador

// ⚠️ AQUI, ENTRE OS DOIS. A entrada pergunta "tem tela aberta?" já no primeiro
// tique do `watch` dela, logo abaixo: no fim do setup isto matava o jogo em TDZ
// na montagem, e acima de `lobbyOpen` não existe. `soltarPonteiro` vai por
// função pelo mesmo motivo do `sairDoPonteiro` acima: a entrada ainda não nasceu.
const { telaAberta, paramOMundo, naPartida, fecharDoTopo } = useRoqueCraftTelas(
  { menuOpen, paused, inventoryOpen, lobbyOpen },
  { paineis, criativo, soltarPonteiro: () => entrada.exitPointerLock() },
  { inventario: closeInventory, lobby: closeLobby },
)

// ── ENTRADA ─────────────────────────────────────────────────────────────────
//
// Teclado, mouse, ponteiro travado e toque moram em `useRoqueCraftEntrada`: onze
// pedacos de estado e 197 linhas. O contrato dela e uma lista de VERBOS
// (`acoes`), porque e isso que uma camada de entrada e — ela traduz gesto em
// acao e nao sabe executar nenhuma.
const entrada = useRoqueCraftEntrada({
  alvo: { canvas: canvasEl, ehCelular: isMobile },
  ajustes: settings,
  olhar: {
    yaw: () => yaw,
    pitch: () => pitch,
    definir: (y, p) => {
      yaw = y
      pitch = p
    },
  },
  telas: { menuOpen, paused, inventoryOpen, lobbyOpen, chatOpen, loading },
  jogo: {
    modo: () => mode.value,
    construcao,
    emRede: () => mp.active,
    slotAtual: () => selectedSlot.value,
    slotsDaHotbar: () => HOTBAR_SIZE,
    // Só a janela ativa ouve o teclado e o reivindica (contrato do jogo-sdk).
    ativo: () => props.estado.ativo,
  },
  // O teclado do desktop do RoqueOS (antes, o `focoDoTeclado` importado direto).
  teclado: props.host.teclado,
  acoes: {
    fecharTelaDoTopo: () => fecharDoTopo(),
    temTelaAberta: () => telaAberta.value,
    atacar: () => tryAttack(),
    interagir: () => tryInteract(),
    colocar: () => doPlace(),
    soltarArco: (cancelar) => entidades.soltarArco(cancelar ? null : mira.raio().dir),
    baixarGuarda: () => corpoDoJogador.baixarGuarda(),
    pegarBloco: () => pickBlock(),
    largarDaMao: () => dropHeld(),
    alternarInventario: () => toggleInventory(),
    alternarPausa: () => togglePause(),
    alternarVoo: () => toggleFly(),
    selecionarSlot: (i) => selectSlot(i),
    abrirChat: () => openChat(),
    destravarAudio: () => destravarAudio(),
    alternarCriativo: () => criativo.alternar(),
    avisarSoCriativo: () => notificar({ type: 'info', message: t('roqueCraft.flyCreativeOnly') }),
  },
})
const {
  teclas: keys,
  ponteiroTravado: pointerLocked,
  posicaoDoMouse: mousePos,
  requestLock,
  exitPointerLock,
  onKeyDown,
  onKeyUp,
  onFullscreenChange,
  onMouseMove,
  onMouseDown,
  onMouseUp,
  onWheel,
  onPointerLockChange,
  onStickMove,
  onMobilePlaceStart,
  onMobilePlaceEnd,
  onMobileBreakStart,
  onMobileBreakEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
} = entrada

// ── Hook E2E (inerte em produção) ───────────────────────────────────────────
// ── Hook E2E (inerte em produção) ───────────────────────────────────────────
//
// As 330 linhas do gancho moram em `services/roquecraft/ganchoDeQA.js`. O corte
// foi por AUDIENCIA, não por contagem de dependência: aquilo não é jogo, é a
// superfície de TESTE, e a natureza dela é conhecer o jogo inteiro. O que se
// ganhou não foi desacoplamento; foi tirar o andaime de dentro do componente de
// produção. Ninguém mais aqui lê uma linha daquele arquivo.
//
// ⚠️ `vivo` é um objeto de ACESSORES, não de valores. `engine`, `world`,
// `ticks`, `yaw` e companhia são `let` deste módulo, recriados em troca de
// qualidade e em mundo novo; lidos por acessor, o gancho fala sempre com o
// motor VIVO, e a escrita (`vivo.ticks = x`) volta pro dono (rule 44).
let desmontarGancho = null
function installE2EHook() {
  desmontarGancho = montarGanchoDeQA({
    // Um acessador por `let` do componente: `vivo.engine` lê o motor de AGORA,
    // e não uma foto de quando o gancho foi instalado (o motor renasce na troca
    // de qualidade). Ver o cabeçalho de `espelho.js`.
    vivo: espelho({
      engine: () => engine,
      world: () => world,
      noiseCtx: () => noiseCtx,
      audio: () => audio,
      mobilia: () => mobilia,
      attackCooldown: () => attackCooldown,
      recargaAtual: () => recargaAtual,
      ultimoGolpe: () => ultimoGolpe,
      ticks: [() => ticks, (v) => (ticks = v)],
      yaw: [() => yaw, (v) => (yaw = v)],
      pitch: [() => pitch, (v) => (pitch = v)],
      qaJogadores: [() => qaJogadores, (v) => (qaJogadores = v)],
      gotasDoBorrifo: () => paisagem.gotas(),
    }),
    player,
    entidades,
    flying,
    survival,
    underwater,
    fatalError,
    mp,
    seed,
    // LAZY pela mesma razão do `corpoDoJogador`: `entrada` é montada depois.
    entrada: () => entrada,
    efeitos: () => efeitos,
    tomarEfeito,
    paineis: () => paineis,
    // GETTER, como os vizinhos: o gancho é montado antes destes refs existirem
    // em alguns caminhos, e passar por valor daria `undefined` em silêncio.
    criativo: () => criativo,
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
    receberRelogio: (r) => multijogador.receberRelogio(r),
    mobMirado,
    tryAttack,
    hurt,
    guardaLevantada: () => corpoDoJogador.guardaLevantada(),
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
  })
}

// ── Ciclo de vida ───────────────────────────────────────────────────────────
function teardownGame() {
  cancelled = true
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  persistencia.cancelar()
  clearTimeout(toastTimer)
  multijogador.encerrar()
  entities?.dispose()
  entities = null
  engine?.dispose()
  engine = null
  world?.dispose()
  world = null
  entidades.limpar()
}

onMounted(async () => {
  cancelled = false
  // Os textos do jogo já chegaram: o `index.js` só monta o app com o idioma
  // carregado (antes, esta era a primeira linha do mount, fundindo os textos no
  // vue-i18n do RoqueOS), e troca `estado.textos` quando o idioma muda.
  // ⚠️ ANTES DO BOOT, não depois: o boot leva segundos e o gesto do jogador
  // apressado caía num intervalo em que ninguém estava ouvindo. O conserto de
  // verdade está em `audio.js` (quem cria o contexto pede o banco); isto aqui é
  // a segunda linha de defesa.
  ouvirPrimeiroGesto()
  try {
    await boot()
    installE2EHook()
    // O convite (link ou QR) com que esta janela foi aberta. Antes vinha pela
    // prop `joinCode`; agora o host guarda, e ele é lido UMA vez, ao abrir: um
    // segundo convite com a janela já aberta não chega (limitação aceita, ver o
    // README).
    const convite = props.host.salaAoVivo.conviteRecebido()
    if (convite) {
      mp.codeInput = convite
      openLobby()
      joinByCode(convite)
    }
  } catch (err) {
    fail(err)
  }

  // Trocar de idioma com o jogo aberto é do `index.js` (ele troca
  // `estado.textos`). Trocar de CONTA também chega pelo host: quem entrou na
  // conta pode tentar a sala de novo.
  pararDeOuvirConta = props.host.identidade.aoMudar(() => {
    semConta.value = false
  })

  resizeObs = new ResizeObserver(() => engine?.resize())
  if (rootEl.value) resizeObs.observe(rootEl.value)

  // ÁUDIO destrava no PRIMEIRO gesto, qualquer que seja ele: quem entrasse por
  // uma rota que não passasse pelo botão "clique pra jogar" jogava MUDO pra
  // sempre (2026-08-22, com `AudioContext` criado ZERO vezes). Os ouvintes
  // sobem em `ouvirPrimeiroGesto`, ANTES do boot.

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  // O bloqueio de teclado só vale em tela cheia, e a tela cheia deste jogo vem
  // da janela do RoqueOS, não daqui — por isso a escuta é no evento, e não um
  // pedido nosso. Entrou em tela cheia, o jogo toma o teclado; saiu, devolve.
  document.addEventListener('fullscreenchange', onFullscreenChange)
  canvasEl.value?.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  canvasEl.value?.addEventListener('wheel', onWheel, { passive: false })
  canvasEl.value?.addEventListener('webglcontextlost', onContextLost, false)
  if (isMobile.value) {
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
  }
})

function onContextLost(e) {
  e.preventDefault()
  cancelled = true
  fatalError.value = t('roqueCraft.error.context')
  loading.value = false
}

onBeforeUnmount(() => {
  if (mp.active && mp.code && myUid.value) salaDoJogo.leaveRoom({ code: mp.code, uid: myUid.value })
  persist()
  teardownGame()
  // Trovão agendado é um setTimeout com até 18 s de vida. Fechar o jogo sem
  // cancelar deixa um estouro tocando depois da janela fechada, com o motor de
  // áudio já destruído, que é como um "cannot read property of null" chega ao
  // usuário como som fantasma. A fila mora no composable; aqui só se manda parar.
  climaDoJogo.encerrar()
  audio?.dispose()
  audio = null
  resizeObs?.disconnect()
  pararDeOuvirConta?.()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  entrada.encerrar()
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
  canvasEl.value?.removeEventListener('mousedown', onMouseDown)
  canvasEl.value?.removeEventListener('wheel', onWheel)
  canvasEl.value?.removeEventListener('webglcontextlost', onContextLost)
  exitPointerLock()
  desmontarGancho?.()
})
</script>

<style lang="scss" scoped>
@import './componentes/styles/ros-roque-craft.scss';
</style>

<!-- O material da interface (`.rc-*`) e os tokens do jogo. Sem `scoped` de
     propósito: era global no RoqueOS (vinha do `app.scss` do sistema) e as telas
     `RC*` usam as classes sem importar nada. Ver o cabeçalho do arquivo. -->
<style lang="scss">
@import './estilos/roquecraft.scss';
</style>
