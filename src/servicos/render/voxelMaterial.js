// RoqueCraft - o material do mundo.
//
// É um `MeshStandardMaterial` do three com quatro enxertos via `onBeforeCompile`
// - de propósito, em vez de um `ShaderMaterial` do zero: assim herdamos de graça
// o PBR correto, sombras com PCF, névoa, tone mapping e o pipeline de luzes, e
// só trocamos o que precisa ser diferente num mundo de voxel:
//
//  1. TEXTURE ARRAY - a textura da face vem de `sampler2DArray` indexado pelo
//     atributo `aLayer`, com `fract(uv)` desnecessário (RepeatWrapping nativo).
//  2. LUZ DE VOXEL - `aLight` traz (AO, skylight, blocklight) por vértice. O
//     resultado multiplica o albedo: `max(céu × horaDoDia, luzDeBloco) × AO`.
//     É isto que faz uma caverna ser escura ao meio-dia e uma tocha pintar a
//     parede de laranja - a luz direcional sozinha nunca faria isso.
//  3. TBN ANALÍTICO - toda face de voxel é alinhada aos eixos, então a tangente
//     é dedutível da normal, sem atributo de tangente e sem `derivatives`.
//  4. VENTO - o atributo `aWind` desloca o topo das plantas por uma senoide no
//     tempo. Custo zero de CPU e o campo de grama deixa de ser um cemitério de
//     cruzes paradas.

// ⚠️ NADA DE CRASE DENTRO DOS BLOCOS `/* glsl */` DESTE ARQUIVO.
//
// O GLSL vive em template literal, e a crase FECHA a string — inclusive dentro
// de comentário. Escrever `uWaterFx` num comentário do shader quebra o build
// com um "Expected a semicolon" apontando pra uma linha de comentário, que é o
// erro mais confuso possível de ler. Custou duas paradas de build em 25/08/2026,
// em dois arquivos diferentes. Em comentário de shader, o nome vai sem crase.

import * as THREE from 'three'
import { SEA_LEVEL, WATER_DROP } from '../constants.js'
import { PROF_MAX } from '../mesher.js'

/** Slots de ondulação simultânea. Tem que casar com RC_MAX_ONDAS no shader. */
export const MAX_ONDAS = 8
/** Segundos até a ondulação sumir por completo (exp(-1.7·t) < 1%). */
export const ONDA_DURACAO = 2.8

// Onda da água, usada IGUAL no vértice e no fragmento. É isso que faz a luz
// bater onde a geometria realmente subiu - com uma senoide no vértice e outra
// no normal, o brilho anda separado do relevo e o olho percebe na hora.
//
// Duas escalas em direções diferentes: marulho longo e lento (swell) + picadinho
// curto e rápido (chop). Uma só, seja qual for a frequência, lê como lençol
// ondulado de desenho animado.
// ── ONDA ────────────────────────────────────────────────────────────────────
//
// A versão anterior somava quatro senoides com direção e velocidade escolhidas
// a olho. Funcionava como decoração e falhava como água: velocidade de fase
// solta do comprimento de onda faz o mar "não parecer mar" mesmo quando cada
// onda isolada parece certa.
//
// Esta segue a formulação canônica do GPU Gems cap. 1 (Finch/NVIDIA,
// "Effective Water Simulation from Physical Models") no que importa aqui:
//
//   k = 2π/L                          número de onda
//   ω = sqrt(g·k),  g = 9,8           relação de dispersão de águas profundas
//                                     (Tessendorf 2001, citado no capítulo)
//
// A consequência prática é que cada onda tem só DOIS graus de liberdade (L e
// amplitude) — a velocidade sai da física. Onda longa anda rápido, marola anda
// devagar, e é essa razão entre as duas que o olho lê como escala.
//
// ⚠️ Atenção a uma divergência real de fonte: várias implementações que citam
// o capítulo escrevem `k = 2/L`. O texto do capítulo diz `2π/L`, que é o que é
// consistente com ω²=gk. Copiar o 2/L faz o comprimento de onda sair 3,14×
// maior do que o parâmetro diz.
//
// Não deslocamos Gerstner de verdade (o termo horizontal): num mundo de blocos
// a superfície é um quad por bloco e o deslocamento lateral descolaria a lâmina
// da parede do bloco. É a mesma escolha que Photon, Complementary e BSL fazem
// no Minecraft — todos usam altura + normal e nenhum desloca lateralmente.
// Em vez do seno puro usamos o seno AFIADO `(sin·0,5+0,5)²` do Photon, que dá
// crista estreita e cavado largo, que é o perfil de onda real.
//
// A normal é ANALÍTICA. Photon usa diferença finita e paga três avaliações do
// FBM por pixel; a derivada de `s²` com `s = sin(x)·0,5+0,5` é `-s·cos(x)·k·D`,
// fechada e de graça junto com a altura.
const GLSL_ONDA = /* glsl */ `
// Declarados AQUI, e não nos preâmbulos: este trecho é injetado no vértice E no
// fragmento, então declarar nos dois preâmbulos daria redeclaração num deles.
uniform float uOndaOctavas;
uniform float uOndaLacunaridade;
uniform float uOndaPersistencia;
uniform float uOndaL;
#define RC_OCTAVAS_MAX 8
// Ângulo áureo entre oitavas: quebra o alinhamento das direções, que é o que
// produz o xadrez visível quando as oitavas compartilham eixo (Photon).
#define RC_ANG_AUREO 2.39996323

// ⚠️ QUATRO ONDAS PLANAS SEMPRE FAZEM UMA TRELIÇA.
//
// O founder mandou um print do mar visto de cima com o padrão diagonal
// repetindo em bloco: "a nossa está clara a repetição quando olhado de cima".
// A causa é aritmética, não de gosto. A soma de N senoides direcionais é uma
// função quase-periódica cujo padrão de interferência fica MAIS visível quanto
// menor o N -- com quatro, o olho acha a célula da treliça em um segundo.
//
// Duas mudanças, e as duas mexem no ESPECTRO, não na aparência:
//
//  1. Mais oitavas. Oito termos em vez de quatro adensam o espectro e a célula
//     da treliça cresce além do que a tela mostra.
//  2. Lacunaridade IRRACIONAL. Era 1,5 -- razão racional, então a cada duas
//     oitavas os comprimentos voltam a ser múltiplos um do outro e as cristas
//     realinham. 1,37 não fecha em razão simples, e o realinhamento vai embora.
//
// A normal continua ANALÍTICA: mais termos é mais soma fechada, não é
// diferença finita. O custo é oito senos por pixel em vez de quatro, e o perfil
// perfil baixo não paga nada porque lá uWaterFx é zero e a onda nem roda.
//
// Devolve vec4(altura, dH/dx, dH/dz, crista 0..1)
vec4 rcOndaCompleta(vec2 p, float t) {
  const float G = 9.8;
  float L = uOndaL;
  float amp = 0.085;       // amplitude da onda longa
  float ang = 0.7;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  float norm = 0.0;
  for (int i = 0; i < RC_OCTAVAS_MAX; i++) {
    if (i >= int(uOndaOctavas)) break;
    vec2 dir = vec2(cos(ang), sin(ang));
    float k = 6.28318531 / L;
    float w = sqrt(G * k);
    float x = w * t - k * dot(dir, p);
    float s = sin(x) * 0.5 + 0.5;
    h += amp * s * s;
    // d/dp [s²] = 2·s·(cos(x)·0,5)·(-k·dir) = -s·cos(x)·k·dir
    grad += amp * (-s * cos(x) * k) * dir;
    norm += amp;
    amp *= uOndaPersistencia;
    L /= uOndaLacunaridade;
    ang += RC_ANG_AUREO;
  }
  // centra em zero: a soma de s² é sempre positiva e deslocaria a lâmina pra cima
  h -= norm * 0.5;
  // só o topo da onda quebra: com o limiar baixo a crista saturava em metade
  // da superfície e o mar aberto saía leitoso.
  float crista = smoothstep(0.62, 0.96, h / max(norm, 1e-4) + 0.5);
  return vec4(h, grad.x, grad.y, crista);
}

// ── ONDULAÇÃO DO JOGADOR ────────────────────────────────────────────────────
//
// Onda radial por EVENTO, somada analiticamente. É a variante circular já
// definida no GPU Gems cap. 1 (direção = normalize(P.xz − centro)):
//
//   h += A · exp(−k_d·idade) · exp(−k_r·r) · sin(ω_e·r − Ω·idade)
//
// Escolhida em vez de simular a equação de onda 2D em textura (Müller-Fischer,
// GDC 2008) por três motivos concretos: não precisa de estado nem de
// ping-pong de render target, não precisa de EXT_color_buffer_float (que
// falta em parte do parque de GPUs que roda o jogo no navegador), e um domínio
// simulado é uma janela FINITA que a onda bate e reflete. Para meia dúzia de
// respingos ao redor do jogador o custo é O(eventos) e o resultado é o mesmo.
//
// A alternativa fica registrada: se um dia houver piscina ou rio com correnteza
// de verdade, o heightfield ping-pong 128² centrado no jogador, com v*=0,99 e
// fronteira aberta, é o caminho — está tudo no slide 19 do Müller-Fischer.
#define RC_MAX_ONDAS 8

// Cada evento: xy = centro no mundo, z = instante de emissão, w = amplitude
uniform vec4 uOndas[RC_MAX_ONDAS];
uniform float uOndaDuracao;

vec3 rcOndulacao(vec2 p, float t) {
  float h = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < RC_MAX_ONDAS; i++) {
    float amp = uOndas[i].w;
    if (amp <= 0.0) continue;
    float idade = t - uOndas[i].z;
    if (idade < 0.0 || idade > uOndaDuracao) continue;
    vec2 d = p - uOndas[i].xy;
    float r = length(d);
    if (r > 14.0) continue;
    // A frente se AFASTA do centro: a fase anda com r e com o tempo em sinais
    // opostos. Sem isso o anel implode em vez de se abrir.
    const float KE = 2.2;   // número de onda do respingo (ondas curtas)
    const float OM = 7.0;   // frequência temporal
    float env = exp(-1.7 * idade) * exp(-0.28 * r);
    float fase = KE * r - OM * idade;
    h += amp * env * sin(fase);
    // derivada radial, projetada em xz
    float dh = amp * env * cos(fase) * KE - amp * 0.28 * env * sin(fase);
    grad += dh * (r > 1e-3 ? d / r : vec2(0.0));
  }
  return vec3(h, grad);
}

// Altura só, para o vértice.
float rcAltura(vec2 p, float t) {
  return rcOndaCompleta(p, t).x + rcOndulacao(p, t).x;
}
`

const VERT_DECL = /* glsl */ `
attribute float aLayer;
attribute vec3 aLight;
attribute vec3 aTint;
attribute float aWind;
varying float vLayer;
varying vec3 vLight;
varying vec3 vTint;
varying vec2 vTileUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vProf;
varying float vFaisca;
uniform float uTime;
uniform float uChamaLayer;
uniform float uWindStrength;
uniform vec2 uWindDir;
uniform float uWaterLayer;
uniform float uWaterFx;
uniform float uSeaLevel;
uniform float uWaterDrop;
uniform float uProfMax;

// ONDA TRIANGULAR SUAVIZADA - técnica do GPU Gems 3, cap. 16 (a vegetação do
// Crysis). Li o capítulo e reimplementei; o HLSL da NVIDIA tem termos próprios
// e não entra aqui.
//
// Por que não o seno: a triangular suavizada tem a DERIVADA que a folha real
// tem. Ela sai do repouso acelerando, PARA no extremo e volta. O seno cruza o
// extremo depressa demais e o mato parece líquido em vez de vegetal.
//
// Quatro delas somadas, nas frequências do Crysis (1.975 / 0.793 / 0.375 /
// 0.193): são incomensuráveis entre si, então a soma não fecha ciclo dentro de
// uma sessão de jogo e o olho nunca acha a repetição. Vetorizado em vec4 porque
// a GPU faz as quatro pelo preço de uma.
vec4 rcOndaTri(vec4 x) {
  vec4 t = abs(fract(x + 0.5) * 2.0 - 1.0);   // triângulo em 0..1
  return t * t * (3.0 - 2.0 * t) * 2.0 - 1.0; // suavizado e remapeado pra -1..1
}
`

const VERT_BODY = /* glsl */ `
vLayer = aLayer;
vLight = aLight;
vTint = aTint;
vTileUv = uv;
vWorldNormal = normal;
vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
// aWind carrega DOIS significados, separados pelo bucket: balanço da planta na
// folhagem, profundidade da lâmina na água. Ver a nota no emitQuad do mesher —
// é um byte por vértice em todas as malhas do mundo, e duplicá-lo só pra água
// custaria o dobro em cada pedra do subsolo.
// (⚠️ sem crase neste comentário: ele vive dentro de um template literal de JS
// e uma crase aqui encerra o shader inteiro. Já quebrou o build uma vez.)
vProf = aWind * uProfMax;
`

const VERT_WIND = /* glsl */ `
#include <begin_vertex>
// DESLOCAMENTO DE VÉRTICE na superfície da água. Antes só o normal ondulava, e
// água que não SOBE não é água - é um decalque azul (relato do founder,
// 2026-08-20).
//
// Ondula TODO vértice que está na altura da superfície: o topo E a borda de
// cima das laterais. O teste antigo era só a normal apontando pra cima, ou
// seja só a tampa - a tampa subia, a saia lateral ficava parada, e abria uma
// fresta horizontal em toda a beira d'água (relato do founder, 2026-08-22).
//
// Como reconhecer a superfície sem mais um atributo: o mesher baixa em
// WATER_DROP exatamente os vértices do topo do bloco, então eles são os únicos
// da água que caem em fract(y) == 1 - WATER_DROP. O fundo da lateral fica em
// fract(y) == 0 e não se mexe, que é o certo - ele encosta na água de baixo.
bool rcEhAgua = uWaterFx > 0.5 && abs(aLayer - uWaterLayer) < 0.5;
if (rcEhAgua) {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  if (abs(fract(wp.y) - (1.0 - uWaterDrop)) < 0.03) {
    transformed.y += rcAltura(wp.xz, uTime);
  }
}
// ── AS FAÍSCAS DA TOCHA ─────────────────────────────────────────────────────
//
// "Precisamos que a chama tenha particulas e movimento simulando fogo real" —
// founder, 25/08/2026.
//
// Partícula sem sistema de partículas: os cinco quadradinhos já vêm na malha do
// chunk (ver FAISCAS em formas.js) e é o VÉRTICE que os faz subir. Custo por
// quadro na CPU: zero. Estado a manter: nenhum. Eles nascem e morrem junto com
// o chunk, como qualquer outra face.
//
// Quem separa faísca de chama NÃO é a camada de textura — as duas moram no
// mesmo tile — e sim aWind > 0: o mesher põe ali a semente de fase da face.
// É o terceiro significado do mesmo byte (os outros dois são balanço de planta
// e profundidade de lâmina), e os três nunca se cruzam porque cada um só é lido
// atrás do teste de camada do seu dono.
//
// A fase leva a posição do bloco junto: sem ela, um corredor de tochas cospe
// faísca no mesmo instante e o corredor inteiro pisca — que é pior que não ter
// faísca.
bool rcEhChama = uChamaLayer >= 0.0 && abs(aLayer - uChamaLayer) < 0.5;
bool rcEhFaisca = rcEhChama && aWind > 0.0;
vFaisca = -1.0;
if (rcEhFaisca) {
  vec2 ancoraF = floor(vWorldPos.xz);
  float fase = fract(uTime * 0.40 + aWind + dot(ancoraF, vec2(0.317, 0.171)));
  // Sobe desacelerando: a brasa perde impulso enquanto esfria. Subida linear
  // lê como elevador.
  transformed.y += (1.0 - (1.0 - fase) * (1.0 - fase)) * 0.72;
  // E VAGUEIA MUITO de lado, cada vez mais conforme sobe. A primeira versão
  // usava um sexto disto e as oito faíscas subiam quase na mesma vertical: o
  // resultado lê como corrente de pontinhos, não como brasa solta no ar quente.
  // Quem quebra a fila é o desvio lateral crescer com a altura.
  float t = uTime * 1.6 + aWind * 41.0;
  transformed.x += sin(t) * 0.30 * fase * fase;
  transformed.z += cos(t * 0.83) * 0.30 * fase * fase;
  vFaisca = fase;
}
// ⚠️ a guarda !rcEhAgua é obrigatória: aWind guarda a profundidade da lâmina nas faces
// de água, e sem a guarda o mar inteiro balançaria como se fosse mato.
// ⚠️ e a guarda !rcEhFaisca também: aWind guarda a SEMENTE da partícula nas
// faces de faísca, e sem ela a brasa balançaria como um pé de mato além de
// subir.
if (aWind > 0.0 && !rcEhAgua && !rcEhFaisca) {
  // FASE ANCORADA NO BLOCO. O floor é função PURA da posição de mundo, então
  // dois vértices que se encostam - de quads diferentes, de chunks diferentes -
  // recebem sempre o mesmo deslocamento, e nada se descola. E como os quatro
  // cantos da cruz de uma moita caem na mesma célula (ver RECUO_CRUZ no
  // mesher), a moita se DOBRA inteira em vez de se rasgar no meio.
  vec2 ancora = floor(vWorldPos.xz) + 0.5;
  float fase = dot(ancora, vec2(0.73, 0.51));

  // RAJADA: envelope lento e enorme que atravessa o campo NA DIREÇÃO do vento.
  // É ele que faz o campo respirar. Sem rajada a amplitude é constante e o
  // olho lê o movimento como motor ligado, não como ar.
  float g = rcOndaTri(vec4(uTime * 0.085 - dot(ancora, uWindDir) * 0.011)).x;
  float rajada = 0.55 + 0.45 * (g * 0.5 + 0.5);

  vec4 t = uTime * 0.45 * vec4(1.975, 0.793, 0.375, 0.193) + fase + vec4(0.0, 0.37, 0.71, 0.19);
  vec4 o = rcOndaTri(t);
  float aoLongo = dot(o, vec4(0.42, 0.27, 0.19, 0.12));
  float lateral = dot(o.wzyx, vec4(0.38, 0.30, 0.20, 0.12));

  // O deslocamento tem uma INCLINAÇÃO CONSTANTE a favor do vento somada à
  // oscilação. Mato ao vento não oscila em torno da vertical: fica deitado pro
  // lado que o vento vai e treme em cima disso. Sem o termo constante o
  // movimento é simétrico e parece metrônomo.
  float amp = aWind * uWindStrength * rajada;
  vec2 perp = vec2(-uWindDir.y, uWindDir.x);
  vec2 d = (uWindDir * (0.62 + 0.55 * aoLongo) + perp * (0.42 * lateral)) * amp;
  transformed.xz += d;

  // ARCO, não escorregão: o topo do talo percorre um arco de raio fixo, então
  // andar d na horizontal OBRIGA a descer. É o passo que o GPU Gems 3 chama
  // de preservar o comprimento, e sem ele a planta estica e descola da base.
  // Honestidade sobre a escala: com amplitude de 11 cm a queda dá 6 mm - hoje
  // ninguém vê. Está aqui porque é 2 instruções e porque no dia em que a
  // amplitude subir é ele que decide se o mato dobra ou derrete.
  transformed.y -= 0.5 * dot(d, d);
}
`

const FRAG_DECL = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormalMap;
uniform sampler2DArray uMer;
uniform vec3 uSkyTint;
uniform vec3 uBlockTint;
uniform float uSkyFactor;
uniform float uMinLight;
uniform float uShadeFloor;
uniform float uAoStrength;
uniform float uBlockGain;
uniform float uNormalStrength;
// Intensidade da chuva agora, 0..1. Vem do relogio do mundo (clima.js), NAO
// de sorteio: o mesmo mundo no mesmo instante molha igual em toda maquina.
// (sem crase neste comentario -- ela fecha o template literal do GLSL)
uniform float uChuva;
// Clarao do relampago, 0..1. Entra MULTIPLICADO POR gSkyLevel de proposito --
// ver a nota no termo de ceu.
uniform float uClarao;
// Depuração da água: 1 pinta a profundidade da lâmina em escala de cinza,
// 2 pinta só a espuma. Inerte em produção (fica em 0) e é o único jeito
// honesto de responder "esse branco é profundidade, espuma ou luz?" — eu
// passei três rodadas de QA chutando a resposta em 2026-08-22.
uniform float uDebugAgua;
uniform float uProfMax;
varying float vLayer;
varying vec3 vLight;
varying vec3 vTint;
varying vec2 vTileUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vProf; // profundidade da lâmina em blocos (só faz sentido na água)
uniform float uTime;
uniform float uWaterLayer;
// Fase da faísca em 0..1; negativo quando o fragmento não é faísca.
varying float vFaisca;
uniform float uLavaLayer;
uniform float uLavaTempo;
uniform float uChamaLayer;
uniform float uWaterFx;
uniform float uSeaLevel;
uniform vec3 uSunDir;
uniform sampler2D uReflexo;
uniform mat4 uReflexoMat;
uniform float uReflexoForca;
uniform sampler2D uRefracao;
uniform float uRefracaoForca;
uniform vec2 uResolucao;
// A normal ondulada da agua e calculada no chunk de RUGOSIDADE (que o three
// injeta antes do de normal) e consumida depois - por isso vive num global.
bool gIsWater;
bool gIsLava;
// A chama da tocha. Diferente de gIsLava, esta é atribuída no chunk de MAP e
// não no de rugosidade: a chama precisa deformar o uv ANTES da amostragem, e
// quem amostra é o map_fragment. Ver a nota da lava sobre ordem de chunks --
// é o mesmo tropeço com o sinal trocado.
bool gEhChama;
float gChamaCalor;
float gVeioDaLava;
float gRefracaoPeso;
vec3 gWaterN;
float gSkyLevel;
float gBlockLevel;
float gFoam;
float gDebug;
`

// Substitui `map_fragment`: cor da camada × tint de bioma × luz de voxel.
const FRAG_MAP = /* glsl */ `
// ── A CHAMA DA TOCHA ───────────────────────────────────────────────────────
//
// "A tocha também está horrorosa" -- founder, 25/08/2026. A forma virou poste
// e chama em formas.js; aqui mora o que faz a chama parecer viva.
//
// Este é o ÚNICO lugar do mundo em que o uv é deformado no fragmento antes da
// amostragem. É o que faz a língua lamber: a chama muda de CONTORNO, não só de
// brilho. Como o material da tocha é cutout, deformar o uv move o próprio
// recorte -- o pixel que era chama vira ar e vice-versa.
//
// A deformação cresce com o QUADRADO da altura dentro do tile. A base está
// presa na brasa e não se move; fogo que balança inteiro, pé junto, lê como
// bandeira. O quadrado é o que deixa o pé quieto e a ponta solta.
//
// Três senos incomensuráveis entre si, e mais a posição do mundo na fase: sem
// o termo de posição, TODAS as tochas de um corredor lambem no mesmo instante
// e o corredor inteiro pisca junto, que é pior que não animar.
gEhChama = uChamaLayer >= 0.0 && abs(vLayer - uChamaLayer) < 0.5;
gChamaCalor = 1.0;
vec2 uvDoTexel = vTileUv;
if (gEhChama && vFaisca < 0.0) {
  float alturaNaChama = clamp((vTileUv.y - 0.25) / 0.6875, 0.0, 1.0);
  // ⚠️ O TERMO DOMINANTE VIAJA PRA CIMA — o sinal de menos em vTileUv.y é o
  // que faz a ondulação SUBIR pela língua em vez de a língua inteira balançar
  // junto. É a diferença entre fogo e bandeira, e foi o que faltava quando a
  // primeira versão saiu parecendo vela: os três senos eram função só do tempo,
  // então todo ponto da chama se movia em fase e a silhueta oscilava rígida.
  float lambe = sin(uTime * 7.4 - alturaNaChama * 9.0 + vWorldPos.x * 2.3 + vWorldPos.z * 1.7) * 0.6
              + sin(uTime * 4.3 - alturaNaChama * 5.0 + vWorldPos.z * 3.1) * 0.28
              + sin(uTime * 11.7 + vWorldPos.x * 4.7) * 0.12;
  uvDoTexel.x += lambe * 0.085 * alturaNaChama * alturaNaChama;
  uvDoTexel.y += sin(uTime * 7.3 + vWorldPos.x * 5.1) * 0.012 * alturaNaChama;
  // O brilho pulsa junto e FORA DE FASE com a forma. Chama que muda de
  // contorno com brilho constante parece papel recortado balançando.
  gChamaCalor = 0.80 + 0.20 * sin(uTime * 6.1 + vWorldPos.z * 2.9)
                     + 0.10 * sin(uTime * 11.4 + vWorldPos.x * 3.3);
}
vec4 texel = texture(uAlbedo, vec3(uvDoTexel, vLayer));
#ifdef ALPHATEST_CUTOUT
if (texel.a < 0.35) discard;
#endif
// A FAÍSCA vem do canto livre do MESMO tile da chama, e o vértice já a
// levantou. Aqui ela só ESFRIA.
//
// ⚠️ ENCOLHER, e não esmaecer. O material é cutout: não há mistura alfa, e
// esmaecer exigiria ordenar as partículas por profundidade — coisa que malha de
// chunk não faz. Como o pontinho tem alfa GRADUADO (degradê radial, ver o
// gerador), LEVANTAR o limiar do recorte encolhe o disco até ele sumir. A brasa
// esfria diminuindo, que é como brasa esfria.
if (gEhChama && vFaisca >= 0.0) {
  // A rampa começa alta e sobe rápido: a brasa encolhe desde cedo e some antes
  // do topo do percurso. Com a rampa antiga (0,18 + 0,80·fase) ela chegava
  // grande e acesa a dois blocos de altura, e duas tochas iluminavam um teto
  // inteiro de pontinhos.
  if (texel.a < 0.34 + vFaisca * 0.66) discard;
  // De branco-quente a laranja fundo enquanto sobe.
  texel.rgb *= mix(vec3(1.15), vec3(0.85, 0.34, 0.10), vFaisca);
  gChamaCalor = 1.6 * (1.0 - vFaisca * 0.72);
}
diffuseColor *= vec4(texel.rgb * vTint, texel.a);

// Luz do voxel: o céu é modulado pela hora do dia e tem cor fria; a luz de
// bloco é constante e quente. O max (e não soma) evita estourar branco onde
// tocha e sol se encontram, que é o que faz o entardecer parecer certo.
// A rampa NAO e linear. Com nivel/15 puro, uma face a sombra de uma copa
// (nivel 11) ja caia a 73% e o tronco de betula saia preto - o degrau entre
// ao sol e na sombra ficava violento demais. O expoente 0.7 levanta os
// tons médios, que é exatamente o que a tabela de luz do gênero faz.
// gExposure = quanto de CEU esta face enxerga (0 = fundo de caverna, 1 = aberto)
// Expoente 0.45 levanta MUITO os tons medios sem levantar o zero: uma face a
// sombra de uma copa (nivel 4/15) sai em 0.55 em vez de 0.27, mas o fundo de
// caverna (nivel 0) continua ZERO - e o que separa "sombra" de "sem luz".
gSkyLevel = pow(clamp(vLight.g, 0.0, 1.0), 0.45);
gBlockLevel = pow(clamp(vLight.b, 0.0, 1.0), 0.72);

// MULTIPLICATIVO so o ceu, e com PISO ALTO. O erro da versao anterior era
// deixar a face na sombra cair a ~0.11 e DEPOIS a cena multiplicar de novo
// pelo shadow map: tronco de carvalho (albedo 0.39) saia em rgb(29,28,24),
// preto. Aqui a face mais sombreada ainda recebe uShadeFloor do rebote do ceu.
// ⚠️ O CLARAO DO RAIO MULTIPLICA gSkyLevel, NAO O TERMO INTEIRO.
//
// A primeira versao multiplicava uSkyFactor la no engine, o que parecia certo:
// "o ceu ficou mais claro". So que uShadeFloor e 0,05, entao a face de caverna
// tambem recebe um resto de ceu -- e multiplicar o fator inteiro multiplicava
// esse resto junto. MEDIDO: o fundo da caverna ficou 55,7% mais claro a cada
// raio. Ninguem ve isso a olho; quem esta na caverna nao sabe que caiu raio.
//
// E a terceira vez que a mesma armadilha aparece nesta rodada (a chuva acendeu
// caverna pelo ambiente, a cortina desenhou dentro da pedra, e agora o clarao).
// A licao ja tem nome: multiplicador GLOBAL vaza pra dentro. O que nao vaza e o
// que ja esta modulado por quanto de ceu a face enxerga.
vec3 skyTerm = uSkyTint * mix(uShadeFloor, 1.0, gSkyLevel) * uSkyFactor * (1.0 + uClarao * gSkyLevel * 2.6);
vec3 voxelLight = max(skyTerm, vec3(uMinLight));
// AO com forca controlada: a 100% o canto interno some
diffuseColor.rgb *= voxelLight * mix(1.0, vLight.r, uAoStrength);
`

// TBN analítico a partir da normal da face (voxel = tudo alinhado aos eixos).
//
// ⚠️ O TANGENTE TEM QUE SER O EIXO `u` DA MESMA FACE NA TABELA `FACES` do
// mesher, e o bitangente o `v`. Não é convenção livre: `nm.x` guarda -∂h/∂u e
// `nm.y` guarda -∂h/∂v, então trocar os dois gira o RELEVO 90° enquanto a cor
// continua no lugar.
//
//   face   FACES.u  FACES.v      tangent   bitangent
//   ±X     Z        Y            Z         Y
//   ±Y     X        Z            X         Z
//   ±Z     X        Y            X         Y
//
// As faces ±X estavam com tangent=Y / bitangent=Z — sobra da correção de
// 2026-08-22, quando `u` e `v` foram trocados na tabela pra desentortar a cor e
// o TBN ficou pra trás. O sintoma era discreto e sistêmico: em metade das
// paredes do mundo o veio da pedra e a fibra do tronco recebiam luz atravessada,
// e o relevo lia como sujeira em vez de textura. É a outra metade do "está meio
// velho" que o founder relatou.
const FRAG_NORMAL = /* glsl */ `
vec3 faceN = normalize(vWorldNormal);
vec3 tangent;
vec3 bitangent;
if (abs(faceN.x) > 0.5) { tangent = vec3(0.0, 0.0, 1.0); bitangent = vec3(0.0, 1.0, 0.0); }
else if (abs(faceN.y) > 0.5) { tangent = vec3(1.0, 0.0, 0.0); bitangent = vec3(0.0, 0.0, 1.0); }
else { tangent = vec3(1.0, 0.0, 0.0); bitangent = vec3(0.0, 1.0, 0.0); }
vec3 worldN;
if (gIsWater && faceN.y > 0.5) {
  worldN = gWaterN;
} else {
  vec3 nm = texture(uNormalMap, vec3(vTileUv, vLayer)).xyz * 2.0 - 1.0;
  nm.xy *= uNormalStrength;
  worldN = normalize(tangent * nm.x + bitangent * nm.y + faceN * max(nm.z, 0.05));
}
normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
`

const FRAG_ROUGH = /* glsl */ `
// uvDoTexel vem do chunk de MAP -- os chunks são inlinados na mesma função,
// então ele continua em escopo aqui (é a mesma razão de o texel da lava
// sobreviver até o chunk de emissão). Amostrar o mer com o uv DEFORMADO importa:
// é o canal b do mer que carrega a emissão, e emissão amostrada no uv parado
// enquanto a cor anda deixaria o brilho fora do lugar onde a chama está.
vec3 mer = texture(uMer, vec3(uvDoTexel, vLayer)).rgb;
float roughnessFactor = roughness * mix(0.55, 1.35, mer.g);
// a oclusão embutida na textura (argamassa, junta de tábua) soma à do vértice
diffuseColor.rgb *= mix(1.0, mer.r, 0.65);

gIsWater = uWaterFx > 0.5 && abs(vLayer - uWaterLayer) < 0.5;
gIsLava = uLavaLayer >= 0.0 && abs(vLayer - uLavaLayer) < 0.5;
gDebug = -1.0;
gVeioDaLava = 0.0;
gRefracaoPeso = 0.0;
// ── LAVA VISCOSA ───────────────────────────────────────────────────────────
//
// "a lava está sem movimento" -- founder, 25/08/2026. Estava mesmo, e não por
// esquecimento: TODA a animação de líquido deste shader mora atrás do teste
// gIsWater, que compara a camada da textura com a da água. A lava é outra
// camada, então caía fora de tudo -- onda, normal, espuma, cáustica. Ela era
// uma textura parada com emissão.
//
// ⚠️ ESTE BLOCO MORA NO CHUNK DE ROUGHNESS, NÃO NO DE MAP. A primeira versão
// dele ficava no chunk map_fragment, e ali gIsLava AINDA NÃO EXISTE: quem
// atribui a variável é este chunk, e o three injeta map_fragment antes de
// roughnessmap_fragment. O resultado é o pior tipo de defeito -- o ramo nunca
// executava, a lava continuava parada, e nada no console reclamava. Foi o par
// de controle da sonda (lava 0,403 contra pedra 0,317, empate) que recusou.
// O texel continua em escopo aqui: os chunks são inlinados na mesma função, e
// é por isso que o FRAG_EMISSIVE lá embaixo também lê o texel.
//
// Lava não é água lenta. Água tem onda de gravidade (crista viaja, perfil
// afiado); lava é fluido viscoso: a superfície ROLA, a crosta fria se abre em
// veios e volta a fechar, e nada disso tem crista. Então a animação é outra
// família: duas amostras da mesma textura andando em direções e velocidades
// diferentes, com a segunda EMPURRANDO a primeira (deformação de domínio) --
// é o empurrão que faz a crosta parecer pastosa em vez de deslizar rígida como
// um cartaz.
if (gIsLava) {
  vec2 uvA = vTileUv + vec2(0.021, 0.013) * uLavaTempo;
  vec2 uvB = vTileUv * 0.77 - vec2(0.009, 0.016) * uLavaTempo;
  vec3 camadaB = texture(uAlbedo, vec3(uvB, vLayer)).rgb;
  // Empurrão pequeno: acima de ~0,08 a textura vira borracha esticando.
  vec2 empurrao = (camadaB.rg - 0.5) * 0.055;
  vec3 camadaA = texture(uAlbedo, vec3(uvA + empurrao, vLayer)).rgb;
  vec3 misturada = mix(camadaA, camadaB, 0.42);
  // ⚠️ O VEIO NÃO PODE SAIR DO BRILHO DA PRÓPRIA TEXTURA.
  //
  // A primeira versão fazia clamp((misturada.r - 0.34) * 2.1): um limiar
  // ABSOLUTO sobre o canal vermelho. A textura de lava é clara -- r fica na casa
  // de 0,8 -- então o veio dava ~1 em quase todo pixel, a poça inteira virava
  // "incandescente", e com a emissão multiplicada por 1,9 em cima ela estourava
  // em BRANCO. A foto mostrou um retângulo creme, que é o oposto de rocha
  // derretida. Rocha derretida é crosta ESCURA com racha acesa.
  //
  // Quem decide onde a crosta abre tem que ser um campo de baixa frequência e
  // independente do brilho fino da textura -- senão o limiar vira refém do
  // quão clara a arte é. A mesma textura amostrada MUITO maior e andando devagar
  // dá manchas do tamanho da poça, que é a escala em que crosta se abre.
  vec3 grande = texture(uAlbedo, vec3(vTileUv * 0.19 + vec2(0.0042, -0.0031) * uLavaTempo, vLayer)).rgb;
  gVeioDaLava = smoothstep(0.46, 0.70, grande.r);
  // Crosta bem escura e veio puxado pro vermelho-laranja, longe do branco: o
  // canal verde em 0,42 e o azul em 0,12 impedem a saturação que lavou a poça.
  vec3 crosta = misturada * 0.24;
  vec3 quente = misturada * vec3(1.05, 0.42, 0.12);
  texel.rgb = mix(crosta, quente, gVeioDaLava);
  // ⚠️ E O diffuseColor TAMBÉM, senão nada disto aparece.
  //
  // diffuseColor foi montado a partir do texel lá no map_fragment, que já
  // rodou. Reescrever só o texel aqui muda a EMISSÃO (que o FRAG_EMISSIVE lê
  // depois) e deixa o albedo com a lava velha e parada -- metade do efeito, e
  // a metade que menos aparece. As duas escritas precisam andar juntas, e é
  // por isso que elas estão coladas.
  diffuseColor.rgb = texel.rgb * vTint;
}
gWaterN = normalize(vWorldNormal);
gFoam = 0.0;
if (gIsWater) {
  float t = uTime;
  vec2 p = vWorldPos.xz;

  // NORMAL ANALÍTICA. A onda devolve altura e gradiente na mesma passada, então
  // o relevo e o brilho vêm por construção do MESMO campo — não tem como o
  // reflexo andar num lugar e a geometria em outro. Photon paga três avaliações
  // do FBM por pixel pra obter isto por diferença finita; aqui é uma.
  vec4 onda = rcOndaCompleta(p, t);
  vec3 ripple = rcOndulacao(p, t);
  vec2 grad = onda.yz + ripple.yz;
  // ── CHUVA NA AGUA ─────────────────────────────────────────────────────────
  //
  // Chuva que ignora a agua e o que denuncia chuva de mentira: o mar continua
  // liso enquanto o chao da praia molha ao lado. O jeito caro seria emitir um
  // anel por gota -- e a piscina de ondulacoes do jogador tem OITO slots com
  // 2,8 s de duracao, entao a chuva comeria todos e o jogador perderia a onda
  // que ele mesmo faz ao nadar. Roubar um efeito pra fazer outro nao e troca.
  //
  // O barato e o certo aqui e agitar a NORMAL: chuva na agua, vista de longe,
  // nao e uma colecao de aneis, e a superficie perdendo o espelho. Duas ondas
  // cruzadas de alta frequencia e fase rapida quebram o reflexo exatamente como
  // a chuva quebra -- e custa duas linhas de ALU por pixel de agua, so quando
  // esta chovendo.
  if (uChuva > 0.001) {
    float bat = uTime * 9.0;
    vec2 agita = vec2(
      sin(p.x * 5.7 + bat) * cos(p.y * 4.9 - bat * 1.3),
      sin(p.y * 6.1 - bat * 1.1) * cos(p.x * 5.3 + bat * 0.7)
    );
    grad += agita * uChuva * 0.055;
  }
  // O exagero é deliberado: a onda tem ~8 cm de altura real, e na escala de um
  // bloco de 1 m a inclinação verdadeira não aparece nem na luz nem no fresnel.
  gWaterN = normalize(vec3(-grad.x * 7.0, 1.0, -grad.y * 7.0));

  // ── ABSORÇÃO DE BEER-LAMBERT ────────────────────────────────────────────
  //
  // T(d) = exp2(−σ·d), por canal. A PROPORÇÃO entre os canais é física: os
  // coeficientes de absorção da água pura (Pope & Fry 1997) valem
  // ~0,34 / 0,057 / 0,0092 por metro em 650/550/450 nm — o vermelho some ~37×
  // mais rápido que o azul, e é literalmente por isso que a água é azul.
  //
  // A ESCALA aqui é maior que a da água pura, e de propósito: com o
  // coeficiente real dá pra enxergar 100 m no azul, o que num lago de jogo
  // significa lâmina invisível. Todas as implementações de referência exageram
  // (Catlike usa densidade 0,15; Complementary satura em 8 blocos). Estes
  // valores mantêm a razão física e dão fundo visível a ~3 blocos e escuridão a
  // ~15, que é a faixa jogável.
  //
  // vProf é a profundidade REAL da coluna, medida pelo mesher bloco a bloco —
  // não uma estimativa em espaço de tela. É o que faz a beira ficar rasa de
  // verdade em vez de "rasa onde o AO do vértice caiu".
  const vec3 SIGMA = vec3(0.62, 0.16, 0.085);
  vec3 trans = exp2(-SIGMA * vProf);
  // ⚠️ A OPACIDADE NÃO PODE SAIR DA MÉDIA DE trans.
  //
  // A mistura alfa do WebGL é um escalar, e a média ponderada dos três canais
  // nunca cai rápido — o azul sobrevive por dezenas de blocos, por construção,
  // e puxa a média para cima. Na piscina de teste de 2026-08-22 o resultado foi
  // uma lâmina 45% opaca sobre areia branca a SEIS blocos de profundidade: a
  // água sumia e sobrava o fundo.
  //
  // A saída é a mesma de Complementary e Catlike: um comprimento de extinção
  // ESCALAR governa quanto a lâmina esconde, e a razão por canal governa a COR.
  //
  // ⚠️ 2,4 blocos de meia-vida era rápido DEMAIS na beira. Com o piso de 0,34,
  // uma lâmina de UM bloco saía 50% opaca — meio metro de água escondendo
  // metade da areia. Somado à espuma que cobria todo o raso (ver abaixo), o
  // resultado era a placa branca leitosa do print do founder. Um bloco de água
  // limpa é praticamente transparente; é a profundidade que fecha.
  // 4,0 de meia-vida com piso 0,18: nítido a 1 bloco, velado a 4, fechado a 12.
  float ocultacao = 1.0 - exp2(-vProf / 4.0);

  // ── ESPUMA ──────────────────────────────────────────────────────────────
  // Duas fontes, ambas com fonte técnica:
  //  · MARGEM, pela profundidade (Roystan / Sea of Thieves): a espuma nasce
  //    onde a lâmina encosta na geometria. Um bloco de água é margem cheia;
  //    além de ~2,5 blocos não há mais espuma.
  //  · CRISTA, pela altura da onda (Tardif): a parte que "quebra".
  //
  // A profundidade é INTEIRA (o mesher conta blocos). A crista tem que pegar
  // só o topo da onda: com o limiar em 0,15 ela saturava em metade da
  // superfície e leitava o mar aberto.
  //
  // ⚠️ ESPUMA POR PROFUNDIDADE PINTA A PRAIA INTEIRA.
  //
  // A forma antiga — 1 menos smoothstep(1,2,prof) — dava margem CHEIA em toda
  // coluna de 1 bloco. Eu raciocinei sobre isso como "o anel de um bloco na
  // beira do lago" e escrevi o comentário acima com essa confiança — mas o
  // anel só é anel quando a margem é ÍNGREME. Numa praia, a lâmina de 1 bloco
  // se estende por dezenas de blocos na horizontal, e a "arrebentação" vira
  // um lençol branco chapado cobrindo todo o raso.
  //
  // Foi isso que o founder fotografou duas vezes e descreveu como "coisas
  // flutuando no mapa, blocos de gelo sem a parte das laterais e inferior".
  // A leitura dele estava certa e a minha, errada: eu procurei geometria por
  // um dia — auditei 633 mil blocos e não achei uma face faltando — porque a
  // placa branca NÃO É geometria. É espuma. Uma superfície plana, opaca e sem
  // volume não tem lateral nem fundo, e é assim que ela se parece.
  // Reproduzido em (94, 98), bioma Praia, com o modo 2 de debugAgua.
  //
  // A profundidade sozinha não distingue "beira da lagoa" de "meio da lagoa
  // rasa" — nas duas a coluna tem 1 bloco. Quem distingue é a ONDA: espuma de
  // verdade é onde a crista quebra, e ela ANDA. Amarrar a espuma à crista
  // devolve faixas de arrebentação em movimento no lugar do lençol parado, e
  // ainda é o que a fonte (Tardif) descreve como a parte que quebra.
  float margem = 1.0 - smoothstep(0.0, 1.6, vProf);
  float arrebentacao = margem * smoothstep(0.30, 0.85, onda.w);
  gFoam = clamp(arrebentacao * 0.85 + onda.w * 0.10, 0.0, 1.0);

  // Rugosidade acompanha a espuma: crista espuma, calha espelha. 0.05 (quase
  // espelho) fazia o reflexo do sol estourar em duas bolhas brancas depois do
  // bloom (QA de 2026-08-19).
  roughnessFactor = mix(0.06, 0.62, gFoam);

  // FRESNEL DE SCHLICK com F0 = 0.02, que é o valor físico da água
  // (n = 1,33 → f0 = (n−1)²/(n+1)² = 0,02; tabela do Filament).
  // Produção costuma subir pra 0,04–0,05 quando não há reflexo de céu decente
  // — aqui há, então fica no físico.
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float cosT = clamp(dot(viewDir, gWaterN), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  // COR ESPALHADA: o que a lâmina devolve por conta própria. Turquesa onde a
  // luz atravessa pouca água, azul profundo onde ela já perdeu o vermelho. O
  // peso vem da própria transmitância, não de uma rampa inventada.
  vec3 raso = vec3(0.13, 0.46, 0.52);
  // ⚠️ O FUNDO ESCURECEU. "precisa deixar mais escuro as partes fundas" —
  // founder, 25/08/2026. O azul de antes (0.015, 0.09, 0.24) ainda tinha muito
  // brilho: uma fossa de vinte blocos lia como piscina de hotel vista de cima.
  // Água funda é quase preta com um resto de azul, e é esse resto que informa
  // profundidade — zerar de vez viraria buraco, não água.
  vec3 fundo = vec3(0.004, 0.028, 0.10);
  // O expoente puxa a curva pro escuro: com o fator linear de antes, metade da
  // lâmina já estava na cor rasa. Agora só a borda rasa fica clara.
  float mistura = clamp(trans.g * 1.35, 0.0, 1.0);
  vec3 corAgua = mix(fundo, raso, mistura * mistura);
  diffuseColor.rgb = mix(diffuseColor.rgb, corAgua, 0.93);
  // O reflexo do céu é o que faz um lago virar espelho ao longe. Forte de
  // raspão, quase nulo de cima - quem decide é o fresnel, não uma constante.
  diffuseColor.rgb = mix(diffuseColor.rgb, uSkyTint * 0.5, fres * 0.62);

  // ── REFRAÇÃO: O FUNDO BORRADO ATRAVÉS DA LÂMINA ───────────────────────────
  //
  // "precisamos do blur de fora da agua olhando para o fundo dela, para dar
  // nocao de profundidade" -- founder, 25/08/2026.
  //
  // Água não é vidro. Olhando de fora, o fundo perde nitidez com a
  // profundidade porque a superfície ondulada desvia cada raio um pouco
  // diferente -- e é a PERDA DE NITIDEZ, mais que a cor, que o olho lê como
  // "isso é fundo". A cor por profundidade já entrou na rodada da água; faltava
  // o borrão.
  //
  // O leito é desenhado ANTES da lâmina, então o shader não pode simplesmente
  // ler o que está atrás: precisa da cópia que a engine desenha sem água. Aqui
  // ela é amostrada pela posição do PIXEL na tela, deslocada pela normal da
  // onda (que é a refração de verdade: a onda entorta o raio) e borrada por
  // tomadas em anel cujo raio cresce com a fundura.
  if (uRefracaoForca > 0.5 && vWorldNormal.y > 0.5) {
    vec2 uvTela = gl_FragCoord.xy / uResolucao;
    // O desvio pela onda é o que faz o fundo ONDULAR junto com a superfície --
    // sem ele o borrão seria um filtro morto por cima de uma imagem parada.
    // ⚠️ RAIO E PESO ESTAVAM SE ANULANDO. Na primeira versão o raio crescia com
    // a profundidade e o PESO da mistura caía com ela -- então onde havia borrão
    // não havia mistura, e onde havia mistura não havia borrão. A nitidez do
    // leito caiu 3% e a sonda, corretamente, reprovou.
    //
    // A curva certa não é monotônica: o borrão que se VÊ mora no meio. Em lâmina
    // de um palmo o fundo é nítido mesmo (e tem que ser); em lâmina funda o
    // fundo já não aparece por absorção. Então o peso é um sino em torno da
    // meia-profundidade, e o raio tem base que já vale no raso -- porque parte
    // do desvio vem da ONDA, que existe em qualquer profundidade.
    vec2 desvio = gWaterN.xz * 0.085;
    float raio = (0.004 + 0.010 * ocultacao) / max(0.35, uResolucao.y / uResolucao.x);
    vec2 e1 = vec2(raio, 0.0);
    vec2 e2 = vec2(0.0, raio * uResolucao.x / uResolucao.y);
    vec2 c = clamp(uvTela + desvio, vec2(0.002), vec2(0.998));
    vec3 fundo = texture2D(uRefracao, c).rgb * 0.36;
    fundo += texture2D(uRefracao, clamp(c + e1, vec2(0.002), vec2(0.998))).rgb * 0.16;
    fundo += texture2D(uRefracao, clamp(c - e1, vec2(0.002), vec2(0.998))).rgb * 0.16;
    fundo += texture2D(uRefracao, clamp(c + e2, vec2(0.002), vec2(0.998))).rgb * 0.16;
    fundo += texture2D(uRefracao, clamp(c - e2, vec2(0.002), vec2(0.998))).rgb * 0.16;
    // A lâmina fica com a COR dela e o DESENHO do fundo borrado por baixo. O
    // peso cai com a fundura porque água funda já esconde o leito por absorção
    // -- misturar o borrão lá embaixo só devolveria luz que a água comeu.
    // Sino: zero na lâmina de vidro, máximo por volta de metade da absorção,
    // caindo de novo quando a água já esconde o leito sozinha.
    float peso = 0.85 * sin(clamp(ocultacao, 0.0, 1.0) * 3.14159);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(fundo, diffuseColor.rgb, 0.35), peso);
    // ⚠️ E A LÂMINA PRECISA FICAR OPACA NA MESMA MEDIDA.
    //
    // Pintar o fundo borrado não basta: a água continua transparente, e a
    // mistura alfa traz de volta o leito NÍTIDO desenhado por baixo. Os dois se
    // somam e o resultado é quase o mesmo de antes -- a sonda mediu 2,6% de
    // queda de nitidez, que é nada. Se o pixel já carrega a imagem do fundo,
    // ele tem que TAPAR o fundo verdadeiro; senão o borrão é uma camada de
    // verniz sobre a foto original.
    gRefracaoPeso = peso;
  }

  // ── REFLEXO DO CENÁRIO ────────────────────────────────────────────────────
  //
  // O céu sozinho resolve o lago visto de longe e não resolve a margem: era o
  // que o founder estava vendo faltar. Aqui entra o alvo planar desenhado pela
  // engine, amostrado pela posição do PIXEL no espelho (uReflexoMat -- sem
  // crase: este comentário vive DENTRO de um template literal e a crase FECHA a
  // string; foi o que quebrou o build na primeira tentativa), não pela
  // posição de tela — assim o reflexo fica preso ao mundo e não escorrega
  // quando a cabeça vira.
  if (uReflexoForca > 0.5) {
    vec4 proj = uReflexoMat * vec4(vWorldPos, 1.0);
    if (proj.w > 0.0) {
      vec2 uvRef = proj.xy / proj.w;
      // A onda distorce o reflexo. É ela que separa "espelho de banheiro" de
      // "água": sem distorção, a margem refletida sai com recorte de vidro.
      // Escala pequena de propósito - onda de voxel é lenta e larga.
      uvRef += gWaterN.xz * 0.045;
      // Fora do alvo não há informação. Desbota em vez de grampear: grampear
      // repetiria a borda ao longo de toda a linha d'água, que é o mesmo
      // defeito da barra de luz do god rays.
      vec2 dentro = smoothstep(vec2(0.0), vec2(0.035), uvRef) *
                    smoothstep(vec2(0.0), vec2(0.035), 1.0 - uvRef);
      float peso = dentro.x * dentro.y * fres * 0.85;
      vec3 cena = texture2D(uReflexo, clamp(uvRef, 0.0, 1.0)).rgb;
      // Só reflete o que tem substância. Céu no alvo já está coberto pelo
      // reflexo de céu acima, e somar os dois estoura a lâmina em branco.
      diffuseColor.rgb = mix(diffuseColor.rgb, cena, peso);
    }
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), gFoam * 0.62);

  // OPACIDADE pela ocultação escalar: água de um bloco deixa ver a areia
  // porque a luz atravessa, lâmina de oito fecha porque não atravessa. O piso
  // de 0,34 existe pra poça de um bloco não virar vidro invisível, e o teto de
  // 0,965 pra lâmina funda nunca ficar 100% chapada (o fundo escuro ainda
  // precisa aparecer de leve, senão o oceano vira uma tampa azul).
  if (uDebugAgua > 0.5) {
    // O valor sai por EMISSÃO (ver FRAG_EMISSIVE), não por albedo: albedo passa
    // pela luz do céu, pela sombra e pelo tonemap, e aí a "medição" já não mede
    // o que eu quis medir.
    gDebug = uDebugAgua < 1.5 ? vProf / uProfMax : gFoam;
    diffuseColor.rgb = vec3(0.0);
    diffuseColor.a = 1.0;
    roughnessFactor = 1.0;
  }
  // ── ÁGUA ESCORRENDO: A FACE VERTICAL ───────────────────────────────────────
  //
  // "a agua escorrendo esta horrivel e mal feita" -- founder, 25/08/2026. Estava,
  // e o motivo é que ela não tinha animação NENHUMA -- não é que a animação
  // estivesse feia.
  //
  // Toda a onda deste shader é função de vWorldPos.xz. Numa face VERTICAL -- a
  // parede de uma cachoeira, a lateral de uma lâmina caindo -- o xz é
  // praticamente constante ao longo da face inteira: a onda devolve o mesmo valor
  // em cima e embaixo, a normal fica chapada, e a queda vira um retângulo azul
  // parado. A água de superfície ganhou onda, espuma, cáustica e reflexo em cinco
  // rodadas; a face vertical não ganhou nada em nenhuma delas.
  //
  // Água caindo não tem onda de gravidade -- tem ESTRIA: filetes verticais que
  // descem, se estreitam e se separam, e ficam esbranquiçados porque a queda
  // mistura ar. Então a animação certa aqui é outra família: rolagem para BAIXO em
  // y, listras finas no eixo horizontal, e aeração crescendo com a velocidade.
  // ⚠️ ESTE BLOCO TEM QUE VIR DEPOIS DA ONDA, não antes. Na primeira versão ele
  // ficava acima do ramo principal -- que atribui gWaterN a partir do gradiente da
  // onda sem perguntar a orientação da face, e portanto APAGAVA tudo que este aqui
  // tinha acabado de calcular. A ordem é o efeito inteiro.
  if (abs(vWorldNormal.y) < 0.5) {
    // Coordenada da queda: horizontal ao longo da face, vertical descendo com o
    // tempo. O eixo horizontal usa x+z pra funcionar nas quatro orientações de
    // face sem precisar saber qual delas é.
    float ao = vWorldPos.x + vWorldPos.z;
    float desce = vWorldPos.y * 2.6 + uTime * 2.2;

    // Estrias: três frequências não-harmônicas, senão elas viram um pente
    // regular -- a mesma lição da malha da água vista de cima.
    float estria =
      sin(ao * 7.3 + sin(desce * 0.6) * 0.7) * 0.5 +
      sin(ao * 13.1 - desce * 0.15) * 0.3 +
      sin(ao * 23.7 + desce * 0.08) * 0.2;
    float filete = smoothstep(0.15, 0.95, estria * 0.5 + 0.5);

    // Aeração: a queda embranquece onde o filete é forte. É o que separa "parede
    // azul" de "água caindo" -- e é sutil de propósito, porque cachoeira toda
    // branca lê como neve.
    gFoam = max(gFoam, filete * 0.42);

    // A normal inclina ao longo da estria, então a luz corre pelos filetes em vez
    // de bater chapada na parede.
    vec3 lado = normalize(cross(vWorldNormal, vec3(0.0, 1.0, 0.0)));
    float inclina = (filete - 0.5) * 0.55;
    gWaterN = normalize(vWorldNormal + lado * inclina + vec3(0.0, filete * 0.18, 0.0));
  }

  // Teto de opacidade mais alto: a lâmina funda tem que ESCONDER o leito, que é
  // o que dá a noção de profundidade olhando de fora. O piso continua baixo pra
  // poça de um bloco não virar vidro fosco.
  float op = mix(0.18, 0.992, ocultacao);
  op = mix(op, 1.0, fres * 0.6);
  // Onde a refração pintou o fundo, a lâmina fecha na mesma proporção.
  op = max(op, gRefracaoPeso);
  diffuseColor.a = clamp(op + gFoam * 0.2, 0.0, 1.0);
}

// CÁUSTICA no fundo: a malha de luz que a onda projeta no chão submerso. É o
// que vende "tem água em cima disto" quando a câmera olha de fora.
// O piso uSeaLevel - 6.0 não é margem de segurança: prof já zera a cáustica a 6
// blocos de profundidade, então abaixo disso o ramo era trabalho jogado fora.
// De quebra, exclui o cubo na MÃO - que vive em y≈0.5 na cena do viewmodel e
// por isso passava no teste "está abaixo do nível do mar" e ganhava uma
// cáustica animada em cima (QA de 2026-08-20).
if (uWaterFx > 0.5 && !gIsWater && vWorldNormal.y > 0.5 && vWorldPos.y < uSeaLevel && vWorldPos.y > uSeaLevel - 6.0) {
  // ⚠️ ESCALA E FORÇA. Com o fator 0.7 o padrão tinha ~9 blocos de período:
  // manchas do tamanho de um bloco e meio, que sobre areia clara estouravam em
  // branco e faziam a piscina inteira parecer um lençol leitoso (QA de
  // 2026-08-22). Cáustica é uma MALHA FINA de linhas de luz — o período certo é
  // da ordem de um bloco. E ela é MULTIPLICATIVA: luz focada realça o que já
  // está lá, não pinta por cima. Somando, o fundo branco satura e some.
  // ⚠️ A CÁUSTICA AGORA SAI DA ONDA DE VERDADE, e não de um padrão paralelo.
  //
  // "precisamos de efeito de reflexo do sol nas ondas da agua para dentro da
  // agua" -- founder. Metade disso já existia: havia cáustica no leito desde
  // agosto. O que não existia era a LIGAÇÃO: ela vinha de três senos próprios,
  // com escala e velocidade próprias, sem nenhuma relação com a onda que a
  // superfície desenha. Duas animações independentes, e o olho percebe -- a
  // crista passa em cima e a linha de luz embaixo não acompanha.
  //
  // Cáustica é a luz do sol FOCADA pela curvatura da superfície: onde a onda é
  // côncava, os raios convergem e o fundo acende. Então quem tem que decidir
  // onde ela acende é a própria funcao da onda -- a mesma, o mesmo
  // instante -- e não um gerador paralelo.
  //
  // O foco é aproximado pela DIVERGÊNCIA do gradiente da onda, por diferença
  // central: onde o gradiente converge, a luz converge. Três avaliações extras
  // por pixel só no leito raso (o ramo já estava limitado a 6 blocos de
  // profundidade), o que mantém o custo onde ele sempre esteve.
  //
  // A amostragem é DESLOCADA pela direção do sol: o ponto do leito que acende
  // não é o que está debaixo da crista, é o que está debaixo do ponto por onde
  // o raio entrou. Sem isso a malha de luz fica presa na vertical e a cáustica
  // não anda quando o sol anda.
  float profRaio = max(0.4, uSeaLevel - vWorldPos.y);
  vec2 entrada = vWorldPos.xz + uSunDir.xz * (profRaio / max(0.25, uSunDir.y));
  float e = 0.35;
  float hC = rcOndaCompleta(entrada, uTime).x;
  float hX = rcOndaCompleta(entrada + vec2(e, 0.0), uTime).x;
  float hZ = rcOndaCompleta(entrada + vec2(0.0, e), uTime).x;
  // Curvatura por diferença: negativa onde a superfície é côncava, que é
  // exatamente onde o feixe fecha.
  float foco = (hC - hX) + (hC - hZ);
  float caustica = pow(clamp(foco * 26.0 + 0.5, 0.0, 1.0), 4.0);
  // some com a profundidade: 6 blocos abaixo do nível do mar já não chega luz
  float prof = clamp((uSeaLevel - vWorldPos.y) / 6.0, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 + caustica * 0.55 * (1.0 - prof) * uSkyFactor;
}

// ── SUPERFÍCIE MOLHADA ──────────────────────────────────────────────────────
//
// A parte da chuva que muda a cara do jogo não são os pingos: é o chão. Chuva
// caindo sobre um mundo seco lê como um filtro de partícula por cima da foto.
//
// A regra é FÍSICA, não gosto — vem do modelo de superfície molhada de
// Sébastien Lagarde (Water drop 3b, 2013), lido e reimplementado aqui:
//
//   · o albedo ESCURECE, porque a água preenche os poros e a luz que entrava e
//     voltava agora passa a ser absorvida. O fator vai a ~0,2–0,3 no material
//     bem poroso e a 1,0 (nada) no material liso.
//   · a rugosidade CAI, porque a lâmina cobre a micro-aspereza. O brilho
//     especular sobe sozinho por causa disso — não se mexe no F0.
//   · a POROSIDADE sai da própria rugosidade, que este material já tem no
//     canal g do mer: poroso = (rugosidade - 0,5) / 0,4.
//
// Escurecer sem alisar deixa o mundo sujo em vez de molhado, e alisar sem
// escurecer deixa plástico. São os dois juntos que leem como chuva.
//
// ⚠️ E SÓ MOLHA QUEM O CÉU ALCANÇA. gSkyLevel é o quanto esta face enxerga
// de céu (0 = fundo de caverna), então caverna, porão e o lado de baixo do
// beiral ficam secos de graça, sem uma linha de lógica de "está coberto?".
// vWorldNormal.y dá o resto: o chão molha inteiro, a parede molha pela metade
// e o teto por baixo quase não molha.
if (uChuva > 0.001 && !gIsWater && !gIsLava) {
  float aoCeu = smoothstep(0.45, 0.95, gSkyLevel);
  float deCima = 0.35 + 0.65 * clamp(vWorldNormal.y, 0.0, 1.0);
  float molhado = clamp(uChuva * aoCeu * deCima, 0.0, 1.0);
  float poroso = clamp((roughnessFactor - 0.5) / 0.4, 0.0, 1.0);
  // 0,55, e não os 0,2-0,3 do modelo puro: o valor físico é para a superfície
  // SOZINHA, e aqui ele se multiplica com a perda de sol do céu encoberto. Os
  // dois no talo levavam o descampado a -60% de brilho, medido — chuva que
  // parece anoitecer. Ver luzSobChuva, que baixou junto.
  float fator = mix(1.0, 0.55, poroso);
  diffuseColor.rgb *= mix(1.0, fator, molhado);
  roughnessFactor *= mix(1.0, fator, 0.5 * molhado);
}
`

const FRAG_EMISSIVE = /* glsl */ `
if (gDebug >= 0.0) { totalEmissiveRadiance = vec3(gDebug); }
// Bloco emissivo (glowstone, lava, minerio de redstone aceso)
totalEmissiveRadiance += texel.rgb * vTint * mer.b * 2.6;
// A chama pulsa. O fator vem do FRAG_MAP, calculado junto com a deformação do
// uv e FORA DE FASE com ela de propósito -- ver a nota lá. Multiplicar aqui, e
// não somar, mantém a chama presa à cor da própria textura: uma soma acenderia
// também o pixel transparente da borda e a chama ganharia halo quadrado.
if (gEhChama) totalEmissiveRadiance *= gChamaCalor;
// ⚠️ A EMISSÃO DA LAVA SEGUE O VEIO, não a poça inteira.
//
// A emissão acima é um multiplicador chapado sobre a textura: com ela sozinha,
// a crosta fria brilha tanto quanto a racha incandescente e a poça vira uma
// chapa laranja uniforme -- que é como ela estava. Modulando pelo veio (o mesmo
// campo que anima o albedo, lá no FRAG_MAP), a crosta apaga e a racha acende, e
// é o CONTRASTE entre as duas que faz o olho ler movimento.
if (gIsLava) {
  // 1,15 e não 1,9: com 1,9 sobre uma textura clara a racha saturava em branco.
  // A crosta cai pra 0,15 -- ela é rocha esfriando, não deve brilhar quase nada,
  // e é o contraste com a racha que faz o olho ler calor.
  totalEmissiveRadiance *= mix(0.15, 1.15, gVeioDaLava);
}
// LUZ DE TOCHA: aditiva, nao multiplicativa. Multiplicando, uma tocha no fundo
// da caverna so conseguia REVELAR o albedo ate o teto da luz do ceu (zero) -
// a caverna ficava preta com tocha e tudo. Somando, ela ilumina de verdade e o
// shadow map do sol nao tem como apaga-la.
totalEmissiveRadiance += texel.rgb * vTint * uBlockTint * gBlockLevel * uBlockGain;

// BRILHO DO SOL NA ONDA. É o cacoete visual que mais diz "isto é água": o
// caminho de cintilância que corre da linha do horizonte até o observador.
// Vem daqui, e não do specular do MeshStandardMaterial, por dois motivos: o
// expoente que ele permite é largo demais pra virar cintilância, e o brilho
// tem que sobreviver ao shadow map (mar não é sombreado por árvore).
if (gIsWater) {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 H = normalize(V + uSunDir);
  float glint = pow(max(dot(gWaterN, H), 0.0), 190.0);
  totalEmissiveRadiance += uSkyTint * glint * 1.8 * uSkyFactor * (1.0 - gFoam * 0.7);
}
`

/**
 * Cria os três materiais do mundo (opaco, recortado, transparente) apontando
 * pro mesmo texture array. Devolve também `uniforms` compartilhados, que o
 * motor atualiza uma vez por frame (hora do dia, vento).
 */
export function createVoxelMaterials(tex, { quality = 'high' } = {}) {
  const shared = {
    uAlbedo: { value: tex.albedo },
    uNormalMap: { value: tex.normal },
    uMer: { value: tex.mer },
    uSkyTint: { value: new THREE.Color(1, 1, 1) },
    uBlockTint: { value: new THREE.Color(1.0, 0.72, 0.42) },
    uSkyFactor: { value: 1 },
    uMinLight: { value: 0.045 },
    // piso do termo de ceu. Baixo de proposito: quem levanta a sombra e a
    // rampa (expoente 0.45), nao o piso - com piso alto a caverna acendia.
    uShadeFloor: { value: 0.05 },
    uAoStrength: { value: 0.72 },
    uBlockGain: { value: 1.15 },
    uNormalStrength: { value: quality === 'low' ? 0.0 : 1.0 },
    uChuva: { value: 0 },
    uClarao: { value: 0 },
    uTime: { value: 0 },
    // O perfil baixo NÃO desliga mais o vento, e a onda da água continua
    // desligada. Não é incoerência: são custos de natureza diferente. A onda
    // da água é por PIXEL, em tela cheia; o vento é ALU por VÉRTICE de planta,
    // e planta é uma fração ínfima dos vértices do mundo.
    //
    // O que foi medido, e o que NÃO foi (qa-roquecraft-vento, 24/08/2026):
    //   • no perfil ultra, onde dá pra medir, o custo ficou entre 0 e 1 fps
    //     sobre 85-100 — dentro do ruído entre execuções;
    //   • no perfil baixo a medida NÃO conclui: a cena bate no teto de 120 fps
    //     com e sem vento, e o perfil limita o pixelRatio, então nem subir a
    //     escala quebra o teto. Zero de teto não é zero de custo.
    // Fica registrado assim de propósito. O que sustenta a decisão no perfil
    // baixo é o argumento de natureza acima, não uma medida que não existe.
    uWindStrength: { value: quality === 'low' ? 0.05 : 0.07 },
    // Direção do vento no plano, girando devagar (uma volta a cada ~8 min).
    // Atualizada em `updateVoxelUniforms` a partir do relógio: sem estado.
    uWindDir: { value: new THREE.Vector2(1, 0) },
    // camada da textura de agua (o shader compara com o atributo aLayer)
    uWaterLayer: { value: tex.layerOf?.water ?? -1 },
    // A camada da LAVA. Ela precisa do próprio identificador porque toda a
    // animação de líquido está atrás do teste da camada da água -- e a lava,
    // sendo outra camada, caía fora de TODOS os ramos animados. Ver o bloco da
    // lava no fragmento.
    uLavaLayer: { value: tex.layerOf?.lava ?? -1 },
    // −1 quando o pack do jogador não traz o tile da chama: o shader então
    // nunca entra no ramo e a tocha desenha parada, em vez de amostrar uma
    // camada que não existe.
    uChamaLayer: { value: tex.layerOf?.torch_flame ?? -1 },
    // Relógio PRÓPRIO da lava, e não o uTime global. Existe pelo mesmo motivo
    // de `congelarAgua`: a única forma honesta de provar que a lava se move é
    // fotografar a MESMA janela com a animação andando e com ela parada. Um
    // teste do tipo "a lava muda e a pedra não" não se sustenta aqui, porque a
    // pedra fica encostada numa fonte de luz emissiva e numa caverna que ainda
    // está sendo malhada -- ela nunca fica quieta.
    uLavaTempo: { value: 0 },
    // no perfil baixo a onda sai: e seno por pixel em tela cheia
    uWaterFx: { value: quality === 'low' ? 0 : 1 },
    // ── O espectro da onda, como uniforme e não como constante ─────────────
    // Uniforme porque o QA precisa comparar o espectro de ANTES (4 oitavas,
    // lacunaridade 1,5) com o de agora NA MESMA sessão: reconstruir o bundle
    // entre duas fotos troca chunk, hora e enquadramento junto, e a comparação
    // de repetição -- que é autocorrelação de pixel -- não sobrevive a isso.
    uOndaOctavas: { value: quality === 'medium' ? 6 : 8 },
    uOndaLacunaridade: { value: 1.37 },
    uOndaPersistencia: { value: 0.62 },
    uOndaL: { value: 13.0 },
    // o mesmo degrau que o mesher aplica - ver WATER_DROP em constants.js
    uWaterDrop: { value: WATER_DROP },
    uSeaLevel: { value: SEA_LEVEL },
    // ── Reflexo planar do cenário (ver `desenharReflexo` na engine) ─────────
    // `uReflexoMat` leva mundo → UV do alvo espelhado; `uReflexoForca` é 0
    // sempre que o alvo não foi desenhado neste quadro (perfil sem reflexo,
    // câmera submersa, efeito desligado no QA). Zero aqui é o shader ignorando
    // a textura, não amostrando lixo do quadro passado.
    // Cópia da cena SEM água, para a lâmina borrar o leito. Ver desenharRefracao.
    uRefracao: { value: null },
    uRefracaoForca: { value: 0 },
    uResolucao: { value: new THREE.Vector2(1280, 720) },
    uReflexo: { value: null },
    uReflexoMat: { value: new THREE.Matrix4() },
    uReflexoForca: { value: 0 },
    uProfMax: { value: PROF_MAX },
    uDebugAgua: { value: 0 },
    // Pool de ondulações do jogador. Cada uma: (x, z, instante, amplitude).
    // Amplitude 0 = slot vago; o shader pula sem custo. Ver `emitirOndulacao`.
    uOndas: { value: Array.from({ length: MAX_ONDAS }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uOndaDuracao: { value: ONDA_DURACAO },
    // direção DA superfície PRO sol, em mundo. Alimenta o brilho na onda.
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
  }

  const patch = (mat, { cutout = false } = {}) => {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_DECL}\n${GLSL_ONDA}`)
        .replace('#include <begin_vertex>', `${VERT_BODY}\n${VERT_WIND}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_DECL}\n${GLSL_ONDA}`)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
        .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
        .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE)
      if (cutout) shader.fragmentShader = `#define ALPHATEST_CUTOUT\n${shader.fragmentShader}`
      mat.userData.shader = shader
    }
    // força recompilação quando a qualidade muda
    mat.customProgramCacheKey = () => `roquecraft-${cutout ? 'cut' : 'solid'}-${quality}`
    return mat
  }

  const base = {
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    // O material precisa dessas flags pra o three DECLARAR os includes que
    // enxertamos. Sem `normalMap` setado, `normal_fragment_maps` some do shader
    // e o normal map do voxel nunca entra.
    normalMap: tex.normal,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: tex.mer,
    emissive: new THREE.Color(0x000000),
    emissiveMap: tex.mer,
    emissiveIntensity: 1,
  }

  const opaque = patch(new THREE.MeshStandardMaterial({ ...base, side: THREE.FrontSide }))
  // ⚠️ ESCRITO DE PROPÓSITO, E HOJE NÃO MUDA NADA — está aqui como CONTRATO.
  //
  // O three 0.171 já mapeia `FrontSide → BackSide` sozinho na hora de projetar
  // (`WebGLShadowMap`, tabela `shadowSide`), então o sólido do chunk JÁ
  // projetava pela face de trás e a linha abaixo é um no-op medido, não uma
  // correção. Ela existe porque o zeramento do `bias` em `engine.js` DEPENDE
  // desse comportamento: projetar pela face de trás é o que evita o acne que o
  // bias vinha mascarando. Deixar isso por conta de um padrão de biblioteca é
  // deixar um conserto pendurado numa versão do three.
  //
  // A VEGETAÇÃO NÃO ENTRA: `cutout` é `DoubleSide` porque a cruz da planta e a
  // folha recortada só existem dos dois lados, e forçar uma face nelas apagaria
  // metade do rendilhado da copa.
  opaque.shadowSide = THREE.BackSide
  const cutout = patch(
    new THREE.MeshStandardMaterial({
      ...base,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: 0.001, // o discard real acontece no shader
    }),
    { cutout: true },
  )
  const transparent = patch(
    new THREE.MeshStandardMaterial({
      ...base,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      metalness: 0.02,
    }),
  )

  // ── Profundidade do bucket RECORTADO ────────────────────────────────────
  //
  // Sem isto a copa das árvores projeta sombra de CAIXA. O three monta sozinho
  // um material de profundidade a partir do material visível, e o que ele sabe
  // sobre recorte vem de `map`/`alphaMap`/`alphaTest`. O nosso recorte não mora
  // em nenhum dos três: mora num `sampler2DArray` lido por um shader
  // enxertado. Da janela do three, folha e pedra são igualmente opacas — então
  // a árvore inteira virava um bloco maciço na hora de projetar sombra, e o
  // chão de uma floresta era uma mancha escura contínua em vez de rendilhado.
  //
  // O mesmo material carrega o deslocamento de VENTO. Se a folha anda no passe
  // de cor e não anda no de sombra, a sombra descola da folha — e o erro seria
  // maior justamente onde a amplitude é maior.
  const depthCutout = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  })
  depthCutout.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared)
    const vAntes = shader.vertexShader
    const fAntes = shader.fragmentShader
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}\n${GLSL_ONDA}`)
      .replace('#include <begin_vertex>', `${VERT_BODY}\n${VERT_WIND}`)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uAlbedo;
varying float vLayer;
varying vec2 vTileUv;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
// O MESMO limiar do passe de cor. Dois limiares diferentes deixam uma orla de
// sombra em volta de cada folha, e ninguém acha a causa depois.
if (texture(uAlbedo, vec3(vTileUv, vLayer)).a < 0.35) discard;`,
      )
    // ENXERTO SEM RECIBO É ENXERTO QUE NÃO ACONTECEU. `String.replace` com um
    // alvo ausente devolve a string intacta e não avisa: o material compila, a
    // sombra continua quadrada, e a sonda registra "sem diferença" — o que soa
    // como "o efeito não vale a pena" em vez de "o código não rodou". Os
    // nomes dos chunks são contrato com o three e mudam entre versões.
    depthCutout.userData.enxertado = {
      vertice: shader.vertexShader !== vAntes,
      fragmento: shader.fragmentShader !== fAntes,
      recorte: shader.fragmentShader.includes('uAlbedo'),
      vento: shader.vertexShader.includes('uWindDir'),
    }
    const faltou = Object.entries(depthCutout.userData.enxertado)
      .filter(([, ok]) => !ok)
      .map(([k]) => k)
    if (faltou.length) {
      console.error(
        `[roquecraft] enxerto do material de profundidade falhou: ${faltou.join(', ')}. ` +
          'A sombra da folhagem volta a ser quadrada.',
      )
    }
  }
  depthCutout.customProgramCacheKey = () => `roquecraft-depth-cut-${quality}`

  return { opaque, cutout, transparent, depthCutout, shared }
}

/**
 * Registra uma ondulação radial na superfície da água.
 *
 * É a resposta da lâmina ao jogador: entrar, nadar, pular, quebrar um bloco
 * dentro d'água. O pool é circular e sobrescreve sempre o slot MAIS VELHO —
 * com oito eventos e 2,8 s de vida, um jogador nadando nunca perde o próprio
 * rastro, e um evento novo nunca é descartado em silêncio por falta de vaga.
 *
 * `amplitude` em blocos: 0,05 é uma braçada, 0,22 é um mergulho.
 */
export function emitirOndulacao(shared, x, z, amplitude, agora) {
  const pool = shared?.uOndas?.value
  if (!pool) return false
  let alvo = 0
  let maisVelho = Infinity
  for (let i = 0; i < pool.length; i++) {
    // slot vago ou já vencido entra na frente de qualquer um
    const vencido = pool[i].w <= 0 || agora - pool[i].z > shared.uOndaDuracao.value
    if (vencido) {
      alvo = i
      break
    }
    if (pool[i].z < maisVelho) {
      maisVelho = pool[i].z
      alvo = i
    }
  }
  pool[alvo].set(x, z, agora, amplitude)
  return true
}

// Atualiza os uniformes compartilhados a partir do ciclo dia/noite.
export function updateVoxelUniforms(
  shared,
  { skyFactor, skyColor, timeSeconds, sunDir, timeSecondsOverride = null, lavaTempo = null },
) {
  shared.uSkyFactor.value = skyFactor
  if (skyColor) shared.uSkyTint.value.setRGB(skyColor[0], skyColor[1], skyColor[2])
  // O override do QA vence o relógio: congelar a onda é o que torna duas fotos
  // do mesmo lugar comparáveis pixel a pixel.
  shared.uTime.value = timeSecondsOverride ?? timeSeconds
  shared.uLavaTempo.value = lavaTempo ?? timeSeconds
  // O vento gira devagar: uma volta completa a cada ~8 min. Derivado do
  // relógio, não acumulado — recarregar o mundo não teleporta a direção, e não
  // há um estado a mais pra sair de sincronia entre os três materiais.
  const a = timeSeconds * 0.013
  shared.uWindDir.value.set(Math.cos(a), Math.sin(a))
  if (sunDir) shared.uSunDir.value.copy(sunDir).normalize()
}

// Constrói a BufferGeometry a partir dos buffers que o worker mandou.
/**
 * Um CUBO que o shader do mundo sabe desenhar.
 *
 * ⚠️ A LISTA DE ATRIBUTOS PERTENCE AO SHADER, e por isso ela mora aqui e nao em
 * quem cria o cubo. `aLayer`, `aLight`, `aTint` e `aWind` sao lidos la em cima
 * neste mesmo arquivo; um cubo que esqueca qualquer um deles desenha errado --
 * e o erro nao e uma excecao, e uma cor.
 *
 * Isto estava escrito DUAS vezes, identico salvo o tamanho da caixa: no bloco
 * que cai (`blocosCaindo.js`) e no cubo da mao (`viewmodel.js`). Duas copias e o
 * dia em que o shader ganha um atributo e um dos dois fica pra tras em silencio.
 *
 * Os valores iniciais nao sao neutros por acaso: AO cheio e ceu cheio fazem o
 * cubo acompanhar a luz do dia como o mundo faz, e luz de bloco zero evita que
 * ele brilhe sozinho no escuro. Tint branco deixa a textura falar.
 *
 * ⚠️ `THREE` ENTRA POR PARAMETRO, e nao pelo import deste arquivo. `blocosCaindo`
 * recebe a biblioteca de quem o chama de proposito, e o teste dele passa um
 * THREE de mentira com so o que o modulo toca -- exatamente pra que um uso novo
 * estoure na hora em vez de passar batido. Fechar essa porta aqui teria
 * silenciado o teste dele sem ninguem notar; eu quase fiz isso.
 */
export function cuboParaVoxel(THREE, tamanho) {
  const geo = new THREE.BoxGeometry(tamanho, tamanho, tamanho)
  const n = geo.attributes.position.count // 24
  const luz = new Uint8Array(n * 3)
  const tint = new Uint8Array(n * 3)
  for (let i = 0; i < n; i++) {
    luz[i * 3] = 255 // AO cheio
    luz[i * 3 + 1] = 255 // ceu cheio: acompanha o dia, como no mundo
    luz[i * 3 + 2] = 0 // sem luz de bloco: nao brilha sozinho no escuro
    tint[i * 3] = tint[i * 3 + 1] = tint[i * 3 + 2] = 255
  }
  geo.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(n), 1))
  geo.setAttribute('aLight', new THREE.BufferAttribute(luz, 3, true))
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3, true))
  geo.setAttribute('aWind', new THREE.BufferAttribute(new Float32Array(n), 1))
  return geo
}

export function geometryFromBuffers(g) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3, true))
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2))
  geo.setAttribute('aLayer', new THREE.BufferAttribute(g.layer, 1))
  geo.setAttribute('aLight', new THREE.BufferAttribute(g.light, 3, true))
  geo.setAttribute('aTint', new THREE.BufferAttribute(g.tint, 3, true))
  geo.setAttribute('aWind', new THREE.BufferAttribute(g.wind, 1, true))
  geo.setIndex(new THREE.BufferAttribute(g.index, 1))
  geo.computeBoundingSphere()
  return geo
}
