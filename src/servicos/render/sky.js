// RoqueCraft - céu, sol, lua, estrelas e nuvens.
//
// TUDO num shader só, numa esfera invertida que acompanha a câmera: gradiente
// (zênite → horizonte), faixa quente do horizonte, disco solar com aureola,
// lua com FASE, campo de estrelas, Via Láctea e DUAS camadas de nuvem. Zero
// draw call extra, zero textura de céu, zero geometria transparente.
//
// As cores NÃO são inventadas aqui: vêm de `daycycle.js`, a mesma fonte que
// alimenta a luz direcional, a névoa e o multiplicador de skylight do mundo.
// É o que impede o defeito clássico de céu noturno com chão de meio-dia.
//
// ── POR QUE AS NUVENS SAÍRAM DO PLANO (medido em 23/08/2026) ────────────────
//
// A versão anterior desenhava as nuvens num PlaneGeometry de 3000×3000 a
// y=190, com o shader lendo "vP = position.xz". Num PlaneGeometry os vértices
// vivem no plano XY — position.z é ZERO em todos eles. Então vP era (x, 0): o
// ruído variava numa direção só, e na escala usada (0,0035) o céu visível
// inteiro cabia em MENOS DE UM PERÍODO do ruído. Na prática a cobertura era um
// número quase constante sobre a abóbada toda: ou tudo descartado (nenhuma
// nuvem, que é o que as fotos de QA mostraram), ou um lençol chapado
// deslizando. O plano ainda trazia três defeitos de brinde: o corte reto onde
// o far plane o cruzava, a ordenação de transparência por centroide e o teto
// achatado olhando pra cima.
//
// A correção não é ajustar a escala: é tirar a geometria. As nuvens agora são
// uma interseção de raio com CASCA ESFÉRICA avaliada dentro da cúpula. Não tem
// borda, não tem far plane, não tem sort, e o horizonte comprime sozinho.
//
// ── DEFINIÇÃO ANGULAR ───────────────────────────────────────────────────────
//
// O sol media 3,6° de diâmetro e a lua 2,7° (o sol REAL mede 0,533° e a lua
// 0,518° — praticamente iguais entre si, que é por isso que eclipse total
// existe). Um sol 33% maior que a lua e sete vezes maior que o real é a marca
// registrada de céu procedural amador. Aqui eles ficam do MESMO tamanho e na
// proporção certa, ampliados 1,4× sobre o real — o suficiente pra fase da lua
// continuar legível a 1080p sem virar desenho.
//
// O que dá a impressão de "sol grande" passa a ser a AUREOLA, não o disco.
//
// Referências consultadas (só licença compatível): three.js r183 Sky.js (MIT)
// pro ruído de gradiente com deriva por oitava e pro par Beer-powder;
// Hosek-Wilkie (BSD-3) e Zotti & Wilkie (WSCG 2007) pro formato da faixa do
// horizonte; Schneider & Vos (SIGGRAPH 2015) e clayjohn/realtime_clouds (MIT)
// pro gradiente de altura e a fase Henyey-Greenstein; Jarzynski & Olano (JCGT)
// e Dave Hoskins pro hash sem seno; Jimenez (SIGGRAPH 2014) pro dithering por
// ruído de gradiente entrelaçado.

import * as THREE from 'three'

// Meio-ângulo em radianos. DOBRO do real, igual pros dois corpos — que é o
// mesmo exagero que o `Sky.js` do three usa (a constante dele,
// sunAngularDiameterCos = 0.99995667, é o cosseno de 0,533° tratado como
// MEIO-ângulo, então o disco sai com 1,067° em vez de 0,533°).
//
// No real puro a lua daria 10 px a 1080p e a fase sumiria. Aqui dá 15 px, a
// fase continua legível, e o sol para de ser sete vezes maior que o dela.
export const RAIO_SOL = 0.00931 // 1,067° de diâmetro (real: 0,533°)
export const RAIO_LUA = 0.00904 // 1,036° de diâmetro (real: 0,518°)
// Raio do "planeta" e altitudes das camadas, em blocos. O raio decide a que
// distância o horizonte de nuvem fecha: sqrt(2*R*h). Com R=5200 e h=210 dá
// ~1478 blocos, bem além de qualquer distância de renderização.
export const RAIO_PLANETA = 5200
export const ALTURA_CUMULO = 210
export const ALTURA_CIRRO = 620

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // sempre no fundo do depth buffer
}
`

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uStars;
uniform float uMoonPhase;
uniform float uTime;
uniform float uPixelAng;
uniform float uCloudQ;
uniform float uCover;
uniform float uCloudOpacity;
uniform vec3 uCloudLit;
// Clarao do relampago. Acende a NUVEM, que e onde o raio de verdade acende --
// e a cupula so e visivel de fora, entao aqui nao ha caverna pra vazar.
uniform float uClarao;
uniform vec3 uCloudShadow;
uniform vec2 uWind;

const float PI2 = 6.28318530718;
const float RAIO_SOL = ${RAIO_SOL.toFixed(6)};
const float RAIO_LUA = ${RAIO_LUA.toFixed(6)};
const float R_PLANETA = ${RAIO_PLANETA.toFixed(1)};
const float H_CUMULO = ${ALTURA_CUMULO.toFixed(1)};
const float H_CIRRO = ${ALTURA_CIRRO.toFixed(1)};

// ── hash sem seno ───────────────────────────────────────────────────────────
// Hash de seno (o que o three usa em rand()) devolve valores diferentes entre
// GPUs e produz ladrilhos quebrados em grade. Estas constantes de Dave Hoskins
// chegaram aqui via three r183 Sky.js (MIT).
float hash21(vec2 p) {
  vec3 q = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 hash22(vec2 p) {
  vec3 q = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

// Ruído de GRADIENTE, não de valor. Ruído de valor tem lóbulos alinhados aos
// eixos e com poucas oitavas a nuvem lê como xadrez borrado.
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float e = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, e, u.x), u.y) * 0.5 + 0.5;
}

// A DERIVA por oitava (p = p * 2.02 + deriva) é o que impede o campo inteiro
// de deslizar como um carimbo só quando o vento anda.
float fbm4(vec2 p, float deriva) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += gnoise(p) * a;
    a *= 0.5;
    p = p * 2.02 + deriva;
  }
  return v * 1.0667;
}
float fbm3(vec2 p, float deriva) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += gnoise(p) * a;
    a *= 0.5;
    p = p * 2.03 + deriva;
  }
  return v * 1.1429;
}

// Interseção do raio com uma casca esférica concêntrica, vista de dentro.
// Devolve a distância até a casca; sempre existe pra r > R_PLANETA.
float casca(vec3 d, float r) {
  float b = d.y * R_PLANETA;
  float c = R_PLANETA * R_PLANETA - r * r;
  return -b + sqrt(max(0.0, b * b - c));
}

// Ruído de gradiente entrelaçado (Jimenez) pro dithering final. Sem isto um
// gradiente grande e suave em 8 bits mostra as faixas - é o "isto é uma demo
// de WebGL" mais óbvio que existe.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -1.0, 1.0);
  float aa = max(uPixelAng, 0.00002);

  // ── gradiente ─────────────────────────────────────────────────────────────
  // Expoente: o azul do zênite só domina bem acima. A faixa clara junto ao
  // horizonte fica FINA — horizonte grosso é o que faz céu procedural parecer
  // papel de parede, e é o defeito que Zotti & Wilkie mediram no Preetham.
  float t = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.62);
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.42, 0.96, t));
  float faixa = pow(1.0 - clamp(abs(h) * 9.0, 0.0, 1.0), 3.0);
  col = mix(col, uHorizon * 1.1, faixa * 0.55);

  // ── sol: aureola larga + coroa apertada + disco pequeno ───────────────────
  vec3 sd = normalize(uSunDir);
  float angSol = length(d - sd); // corda ~ ângulo, sem acos
  float acimaDoHorizonte = smoothstep(-0.12, 0.06, sd.y);
  // A aureola larga é o que pinta o céu INTEIRO de laranja no poente.
  vec3 halo = uSunColor * exp(-angSol / 0.17) * 0.30;
  halo += uSunColor * exp(-angSol * angSol / 0.0011) * 1.25;
  halo *= acimaDoHorizonte;
  col += halo;
  // Disco com o limbo de UM PIXEL: estreitar a rampa é o que dá borda nítida.
  // O valor é limitado antes do tonemap - disco sem teto vira uma chapa
  // estourada e o bloom espalha a chapa pela tela inteira.
  float discoSol = smoothstep(RAIO_SOL + aa, max(0.0, RAIO_SOL - aa), angSol);
  col = mix(col, min(uSunColor * 7.0, vec3(5.0)), discoSol * acimaDoHorizonte);

  // ── lua com fase ──────────────────────────────────────────────────────────
  vec3 md = normalize(uMoonDir);
  float angLua = length(d - md);
  float lua = smoothstep(RAIO_LUA + aa, max(0.0, RAIO_LUA - aa), angLua);
  float luaAcima = smoothstep(-0.12, 0.06, md.y);
  // Auréola suave: sem ela a lua vira um adesivo colado no céu.
  col += vec3(0.62, 0.68, 0.86) * exp(-angLua / 0.055) * 0.16 * luaAcima * uStars;
  if (lua > 0.0) {
    vec3 direita = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
    float lado = dot(d - md, direita) / RAIO_LUA;
    float fase = uMoonPhase * 2.0 - 1.0;
    float aceso = smoothstep(fase - 0.22, fase + 0.22, lado);
    if (uMoonPhase > 0.5) aceso = 1.0 - aceso;
    float mar = hash21(floor((d.xz + d.y) * 5200.0)) * 0.18;
    col = mix(
      col,
      vec3(0.94, 0.94, 0.87) * (1.0 - mar),
      lua * clamp(aceso + 0.05, 0.0, 1.0) * luaAcima
    );
  }

  // ── estrelas ──────────────────────────────────────────────────────────────
  // Parametrização ESFÉRICA DE ÁREA IGUAL (azimute, sen(elevação)) em vez de
  // floor(direção * N). A grade cartesiana é um reticulado que a esfera não
  // corta por igual: a célula encolhe 5,2x na direção dos cantos do cubo (o
  // jacobiano é 1/(1+a2+b2)^1.5, JCGT 7(2) 2018), e cada estrela era a célula
  // INTEIRA — daí os quadradinhos e triângulos alinhados ao eixo. Aqui a
  // célula só sorteia a POSIÇÃO; o desenho é um disco medido em radianos.
  if (uStars > 0.004 && h > -0.05) {
    vec2 su = vec2(atan(d.z, d.x) / PI2 + 0.5, d.y * 0.5 + 0.5);
    vec2 celula = floor(su * vec2(640.0, 204.0));
    float s = hash21(celula);
    // Extinção atmosférica: estrela junto ao horizonte atravessa muito mais ar.
    float ext = smoothstep(-0.03, 0.26, h);
    // Via Láctea: banda inclinada que ADENSA as estrelas e acende nebulosidade.
    float banda = smoothstep(0.58, 0.0, abs(dot(d, normalize(vec3(0.4, 0.28, -0.87)))));
    float limiar = mix(0.972, 0.938, banda);
    if (s > limiar) {
      vec2 jit = vec2(hash21(celula + 17.31), hash21(celula + 41.77)) * 0.68 + 0.16;
      vec2 sc = (celula + jit) / vec2(640.0, 204.0);
      float az = (sc.x - 0.5) * PI2;
      float sy = clamp(sc.y * 2.0 - 1.0, -1.0, 1.0);
      float cy = sqrt(max(0.0, 1.0 - sy * sy));
      vec3 ed = vec3(cy * cos(az), sy, cy * sin(az));
      float ang = length(d - ed);
      // Magnitude: a contagem real de estrelas quintuplica a cada magnitude.
      // pow(hash, 3) dá muitas fracas e poucas fortes; brilho uniforme é o que
      // faz campo de estrela parecer sal derramado.
      float mag = pow(fract(s * 91.7), 3.0);
      float raio = mix(0.00042, 0.00135, mag);
      float disco = smoothstep(raio + aa, max(0.0, raio - aa), ang);
      // Preservação de energia: estrela menor que um pixel tem que ESCURECER,
      // não encolher. Sem isto ela cintila entre presente e ausente conforme a
      // câmera anda, e o bloom transforma isso em vaga-lume.
      float sub = clamp(raio / aa, 0.12, 1.0);
      float pisca = 0.74 + 0.26 * sin(uTime * 1.6 + s * 63.0);
      vec3 corE = mix(vec3(0.78, 0.85, 1.0), vec3(1.0, 0.9, 0.76), fract(s * 311.7));
      col += corE * disco * sub * pisca * (0.3 + mag * 2.6) * uStars * ext;
      col += corE * exp(-ang / 0.0021) * mag * 0.15 * uStars * ext;
    }
    // Nebulosidade: projeção estereográfica (sem costura no azimute) em vez de
    // equirretangular, senão aparece uma emenda reta em 180°.
    vec2 ne = d.xz / (1.0 + max(d.y, -0.9) + 0.001);
    float neb = fbm3(ne * 5.5, 0.7);
    col += vec3(0.26, 0.28, 0.44) * banda * (0.3 + neb * 1.1) * uStars * 0.062 * ext;
  }

  // ── nuvens, dentro da cúpula ──────────────────────────────────────────────
  if (uCloudQ > 0.5 && h > -0.02) {
    float dist = casca(d, R_PLANETA + H_CUMULO);
    vec2 cuv = (d.xz * dist) * 0.0095 + uWind * uTime;
    // Cobertura variando em baixa frequência: sem isto o campo é sopa de ruído
    // uniforme, com nuvem do mesmo tamanho em todo lugar.
    float regiao = gnoise(cuv * 0.028) * 0.62 + 0.38;
    float cobertura = clamp(uCover + (regiao - 0.5) * 0.6, 0.0, 1.0);
    float limiar = 1.0 - cobertura;
    float n = fbm4(cuv, 0.63);
    float prof = max(0.0, n - limiar);
    if (prof > 0.0) {
      float mascara = smoothstep(0.0, 0.085, prof);
      // Beer-powder: a borda fina fica clara e o miolo grosso escurece. É o par
      // que dá volume a uma nuvem que não tem volume nenhum.
      float beer = exp(prof * -5.0);
      float powder = 1.0 - beer * beer;
      float sombra = mix(0.4, 1.0, clamp(beer * powder * 2.6, 0.0, 1.0));
      // Lobo dianteiro de Henyey-Greenstein (g~0.7): a borda virada pro sol
      // acende. É o silver lining, e é ele que vende o poente.
      float cosSol = dot(d, sd);
      float prata = clamp(0.5 / pow(1.5 - cosSol * 1.4, 1.5), 0.0, 3.0);
      float borda = mascara * (1.0 - mascara) * 4.0;
      vec3 corN = mix(uCloudShadow, uCloudLit, sombra);
      corN += uSunColor * prata * borda * 0.4 * acimaDoHorizonte;
      // O RAIO ACENDE A NUVEM POR DENTRO. E onde ele acontece: o relampago mora
      // dentro do cumulo, e o que se ve na maior parte das vezes nao e o risco,
      // e a nuvem inteira virando lampada por um quarto de segundo. Multiplica
      // a PROFUNDIDADE da nuvem, entao o miolo espesso acende mais que a borda
      // rala -- que e o que da o volume.
      corN *= 1.0 + uClarao * (0.6 + prof * 5.0) * 1.1;
      // Perspectiva aérea: nuvem longe dissolve na cor do céu daquela direção.
      float longe = smoothstep(0.22, 0.0, h);
      corN = mix(corN, col, longe * 0.85);
      float alfa = (1.0 - exp(prof * -17.0)) * uCloudOpacity;
      alfa *= smoothstep(0.0, 0.05, h); // dissolve rente ao horizonte
      alfa = clamp(alfa, 0.0, 1.0);
      col = mix(col, corN, alfa);
      // Nuvem opaca TAPA a aureola do sol; sem isto o halo atravessa a nuvem e
      // ela parece uma decalcomania.
      col -= halo * 0.55 * alfa;
    }
    // Segunda camada: cirro fino e alto. Custa 3 oitavas e é o que separa
    // "tem nuvem" de "tem CÉU".
    if (uCloudQ > 1.5) {
      float d2 = casca(d, R_PLANETA + H_CIRRO);
      vec2 c2 = (d.xz * d2) * 0.0042 + uWind * uTime * 1.7;
      float n2 = fbm3(c2, 1.31);
      float a2 = smoothstep(0.6, 0.85, n2) * 0.24 * smoothstep(0.0, 0.14, h);
      vec3 corC = mix(uCloudShadow, uCloudLit, 0.85);
      col = mix(col, corC, a2 * uCloudOpacity);
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Dithering DEPOIS do tonemap e do espaço de cor: ele tem que operar na
  // profundidade de bits da SAÍDA, não no linear.
  gl_FragColor.rgb += (1.0 / 255.0) * ign(gl_FragCoord.xy) - (0.5 / 255.0);
}
`

export function createSky({ clouds = true, cloudQuality = 2 } = {}) {
  const group = new THREE.Group()

  const skyUniforms = {
    uZenith: { value: new THREE.Color(0.2, 0.45, 0.92) },
    uHorizon: { value: new THREE.Color(0.66, 0.83, 1.0) },
    uSunColor: { value: new THREE.Color(1, 0.97, 0.9) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uStars: { value: 0 },
    uMoonPhase: { value: 0 },
    uTime: { value: 0 },
    // Tamanho angular de UM PIXEL, em radianos. Vem do motor (fov/altura) em
    // vez de fwidth: derivada exige extensão em GLSL ES 1.00, e num shader de
    // cúpula o valor é exato e uniforme, então a uniform é melhor em todo
    // sentido - inclusive porque um harness consegue fixá-la e medir.
    uPixelAng: { value: 0.0015 },
    uCloudQ: { value: clouds ? cloudQuality : 0 },
    uCover: { value: 0.36 },
    uCloudOpacity: { value: 0.9 },
    uClarao: { value: 0 },
    uCloudLit: { value: new THREE.Color(1, 1, 1) },
    uCloudShadow: { value: new THREE.Color(0.5, 0.56, 0.7) },
    uWind: { value: new THREE.Vector2(0.00042, 0.00017) },
  }

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      // A CÚPULA DESENHA POR ÚLTIMO, NÃO POR PRIMEIRO.
      //
      // Era `depthTest: false` com renderOrder -1000: a cúpula sombreava TODO
      // pixel da tela e o terreno pintava por cima. Com o shader antigo (um
      // gradiente e um hash) isso não custava nada. Este aqui faz até 10
      // oitavas de ruído de gradiente por pixel — pagar isso em pixel que vai
      // ser tapado por um bloco é jogar fora metade do quadro.
      //
      // Com o vértice fixando z = w a cúpula fica exatamente no far plane, e
      // LessEqualDepth só passa onde nada escreveu profundidade. É o arranjo
      // padrão de skybox, e agora o custo do céu é proporcional ao céu VISÍVEL.
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      fog: false,
    }),
  )
  // Depois do opaco (0 e 1) e antes da lista de transparentes, onde a água mora.
  dome.renderOrder = 900
  dome.frustumCulled = false
  group.add(dome)

  /**
   * Cor do céu numa direção qualquer, calculada na CPU com a MESMA forma do
   * shader (gradiente + faixa do horizonte + aureola do sol).
   *
   * Existe pra névoa: com `fog.color` vindo de uma tabela e o céu vindo de um
   * shader, a silhueta do terreno sempre encosta numa faixa de cor diferente
   * da do céu atrás dela. Uma função só, usada nos dois lados, elimina isso.
   */
  function skyColorAt(dir, { palette, sunDir }, alvo = new THREE.Color()) {
    const y = Math.max(-1, Math.min(1, dir.y))
    const t = Math.pow(Math.max(0, y * 0.5 + 0.5), 0.62)
    const s = Math.max(0, Math.min(1, (t - 0.42) / 0.54))
    const grad = s * s * (3 - 2 * s)
    const faixa = Math.pow(1 - Math.min(1, Math.abs(y) * 9), 3) * 0.55
    const dx = dir.x - sunDir.x
    const dy = dir.y - sunDir.y
    const dz = dir.z - sunDir.z
    const ang = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const a = Math.max(0, Math.min(1, (sunDir.y + 0.12) / 0.18))
    const halo = Math.exp(-ang / 0.17) * 0.3 * (a * a * (3 - 2 * a))
    const canal = (i) => {
      const base = palette.horizon[i] + (palette.zenith[i] - palette.horizon[i]) * grad
      const comFaixa = base + (palette.horizon[i] * 1.1 - base) * faixa
      return comFaixa + palette.sun[i] * halo
    }
    return alvo.setRGB(canal(0), canal(1), canal(2))
  }

  /**
   * Atualiza o céu a partir do estado do ciclo dia/noite e da câmera.
   * `rig` vem de `lightRig(ticks)`, `palette` de `skyPalette(ticks)`.
   */
  function update({
    palette,
    rig,
    sunDir,
    moonDir,
    moonPhase,
    camera,
    timeSeconds,
    pixelAngle,
    clarao = 0,
  }) {
    skyUniforms.uClarao.value = clarao
    skyUniforms.uZenith.value.setRGB(...palette.zenith)
    skyUniforms.uHorizon.value.setRGB(...palette.horizon)
    skyUniforms.uSunColor.value.setRGB(...palette.sun)
    skyUniforms.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z)
    skyUniforms.uMoonDir.value.set(moonDir.x, moonDir.y, moonDir.z)
    skyUniforms.uStars.value = rig.stars
    skyUniforms.uMoonPhase.value = moonPhase / 8
    skyUniforms.uTime.value = timeSeconds
    if (pixelAngle) skyUniforms.uPixelAng.value = pixelAngle

    // A cúpula acompanha a câmera (fica sempre "no infinito").
    dome.position.copy(camera.position)
    dome.scale.setScalar(Math.max(2, camera.far * 0.9))

    if (skyUniforms.uCloudQ.value > 0) {
      // Nuvem de noite é CINZA ESCURA, não branca. `rig.ambient` não serve de
      // referência aqui: ele SOBE à noite (é a luz que segura o mundo jogável
      // no escuro). Quem diz se é dia é `rig.stars`, que vale 0 em pleno dia e
      // 1 na noite fechada.
      const dia = 1 - rig.stars
      const brilho = 0.2 + dia * 0.8
      // A nuvem iluminada puxa a cor do SOL (dourada no poente, azulada à
      // noite) e a sombra puxa a do zênite. As duas vêm da paleta, nunca de
      // constante: nuvem branca num céu vermelho é o erro clássico.
      skyUniforms.uCloudLit.value.setRGB(
        (palette.sun[0] * 0.82 + 0.2) * brilho,
        (palette.sun[1] * 0.82 + 0.2) * brilho,
        (palette.sun[2] * 0.82 + 0.22) * brilho,
      )
      skyUniforms.uCloudShadow.value.setRGB(
        (palette.zenith[0] * 0.7 + 0.1) * brilho,
        (palette.zenith[1] * 0.7 + 0.11) * brilho,
        (palette.zenith[2] * 0.7 + 0.15) * brilho,
      )
      skyUniforms.uCloudOpacity.value = 0.72 + dia * 0.18
    }
  }

  function dispose() {
    dome.geometry.dispose()
    dome.material.dispose()
  }

  return { group, update, dispose, skyColorAt, uniforms: skyUniforms }
}
