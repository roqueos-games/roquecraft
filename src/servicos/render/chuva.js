//
// A CORTINA DE CHUVA — os riscos que caem em volta do jogador.
//
// ⚠️ NÃO É UM SISTEMA DE PARTÍCULAS, e essa é a decisão que faz caber no
// celular. Um sistema de partículas de verdade guarda posição por gota na CPU,
// integra a queda a cada quadro e reenvia o buffer inteiro pra GPU: com 2.000
// gotas isso é 2.000 iterações e um upload de 24 KB por quadro, todo quadro,
// pra desenhar risquinho.
//
// Aqui não existe estado de gota. Cada instância tem uma posição FIXA numa
// caixa e uma fase própria; a queda é `mod(tempo * velocidade + fase)` dentro
// do vertex shader. A CPU por quadro escreve DOIS uniformes — o relógio e a
// âncora — e mais nada. O custo some no ruído.
//
// A caixa acompanha o jogador em passos inteiros (`floor`), não continuamente:
// ancorar em coordenada fracionária faz a chuva "deslizar" junto com a câmera e
// o cérebro lê como se as gotas estivessem grudadas na tela.

const RAIO = 22 // meia-largura da caixa de chuva, em blocos
const ALTO = 26 // altura da caixa
const QUEDA = 34 // blocos por segundo

/**
 * @param {object} THREE
 * @param {number} gotas quantas instâncias — 0 desliga
 */
export function criarChuva(THREE, gotas = 2200) {
  if (!gotas) {
    const vazio = new THREE.Group()
    vazio.visible = false
    return {
      grupo: vazio,
      update: () => {},
      dispose: () => {},
      get gotas() {
        return 0
      },
    }
  }

  // Um risco: quad fino, origem no topo, caindo pra baixo.
  const base = new THREE.PlaneGeometry(1, 1)
  base.translate(0, -0.5, 0)
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = base.index
  geo.attributes.position = base.attributes.position
  geo.attributes.uv = base.attributes.uv
  geo.instanceCount = gotas

  const off = new Float32Array(gotas * 3)
  const dados = new Float32Array(gotas * 3) // fase, velocidade, comprimento
  for (let i = 0; i < gotas; i++) {
    // Distribuição em disco por raiz da uniforme: sem a raiz a chuva fica densa
    // no centro e rala na borda, e o jogador anda dentro de um funil.
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * RAIO
    off[i * 3] = Math.cos(a) * r
    off[i * 3 + 1] = Math.random() * ALTO
    off[i * 3 + 2] = Math.sin(a) * r
    dados[i * 3] = Math.random()
    dados[i * 3 + 1] = 0.75 + Math.random() * 0.5
    dados[i * 3 + 2] = 0.55 + Math.random() * 0.85
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3))
  geo.setAttribute('aGota', new THREE.InstancedBufferAttribute(dados, 3))

  const uniforms = {
    uTempo: { value: 0 },
    uAncora: { value: new THREE.Vector3() },
    uForca: { value: 0 },
    uCor: { value: new THREE.Color(0.62, 0.7, 0.8) },
    uVento: { value: new THREE.Vector2(0.18, 0.07) },
    // 0 = chuva, 1 = neve. A MESMA cortina serve os dois, e isso nao e economia
    // de codigo: floco e gota sao a mesma coisa caindo com numero diferente --
    // velocidade, forma e deriva. Duplicar a cortina seria manter dois shaders
    // que precisam continuar concordando em todo o resto.
    uNeve: { value: 0 },
  }

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // Sem culling: o risco é um plano sem volume e vira invisível de trás.
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aOff;
      attribute vec3 aGota;
      uniform float uTempo;
      uniform vec3 uAncora;
      uniform float uForca;
      uniform vec2 uVento;
      uniform float uNeve;
      varying float vAlpha;
      varying float vNeve;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNeve = uNeve;
        float fase = aGota.x;
        float vel = aGota.y;
        float comp = aGota.z;
        // Queda em ciclo: o risco reaparece no topo assim que passa do chao da
        // caixa. mod() e o que dispensa guardar posicao por gota.
        // Neve cai ~7x mais devagar e VAGUEIA: a deriva senoidal em x e z e o
        // que separa floco de gota branca. Sem ela, neve e chuva sem cor.
        float lento = mix(1.0, 0.14, uNeve);
        float y = mod(aOff.y - uTempo * vel * ${QUEDA.toFixed(1)} * lento + fase * ${ALTO.toFixed(1)}, ${ALTO.toFixed(1)});
        vec3 vagar = vec3(
          sin(uTempo * 0.7 + fase * 31.0) * 0.9,
          0.0,
          cos(uTempo * 0.55 + fase * 17.0) * 0.9
        ) * uNeve;
        vec3 centro = uAncora + vec3(aOff.x, y - ${(ALTO * 0.35).toFixed(1)}, aOff.z) + vagar;
        // O risco e inclinado pelo vento e SEMPRE de frente pra camera: sem
        // isso ele some quando o jogador olha de lado.
        vec3 paraCamera = normalize(cameraPosition - centro);
        vec3 eixoY = normalize(vec3(uVento.x, 1.0, uVento.y));
        vec3 eixoX = normalize(cross(eixoY, paraCamera));
        // O floco e quadrado; a gota e um risco fino e comprido. E a razao
        // entre largura e comprimento que o olho le como velocidade.
        float larg = mix(0.035, 0.11, uNeve);
        float alt = mix(comp, 0.11, uNeve);
        vec3 p = centro + eixoX * position.x * larg + eixoY * position.y * alt;
        // Some no fim da caixa, pra gota nao brotar do nada no topo.
        float bordaY = smoothstep(0.0, 3.0, y) * (1.0 - smoothstep(${(ALTO - 4).toFixed(1)}, ${ALTO.toFixed(1)}, y));
        float d = length(vec2(aOff.x, aOff.z));
        float bordaR = 1.0 - smoothstep(${(RAIO * 0.6).toFixed(1)}, ${RAIO.toFixed(1)}, d);
        vAlpha = uForca * bordaY * bordaR;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCor;
      varying float vAlpha;
      varying float vNeve;
      varying vec2 vUv;
      void main() {
        if (vAlpha <= 0.001) discard;
        // Mais opaco no meio do risco e transparente nas pontas: risco de alfa
        // constante lê como palito de plástico.
        float aoLongo = sin(vUv.y * 3.14159);
        float aoLargo = 1.0 - abs(vUv.x - 0.5) * 2.0;
        // Floco e um disco macio, nao um risco: a mascara vira radial.
        float raio = 1.0 - smoothstep(0.18, 0.5, length(vUv - 0.5));
        float mascara = mix(aoLongo * aoLargo, raio, vNeve);
        vec3 cor = mix(uCor, vec3(0.95, 0.97, 1.0), vNeve);
        gl_FragColor = vec4(cor, vAlpha * mix(0.42, 0.85, vNeve) * mascara);
      }
    `,
  })

  const malha = new THREE.Mesh(geo, mat)
  malha.frustumCulled = false // a caixa segue a câmera; culling só custaria
  malha.renderOrder = 3
  const grupo = new THREE.Group()
  grupo.add(malha)
  grupo.visible = false

  /**
   * @param {number} tempo   relógio contínuo em segundos
   * @param {number} forca   0..1 — intensidade da chuva AQUI (já com bioma e teto)
   * @param {{x:number,y:number,z:number}} camera posição do olho
   */
  // A força EFETIVA persegue o alvo em vez de saltar. Entrar numa caverna com
  // a chuva sumindo num quadro lê como bug de render; a rampa de ~0,8 s lê como
  // o som ficando abafado quando se entra. Sem dt de propósito: um passo fixo
  // por quadro é suficiente aqui e não introduz mais um parâmetro pra errar.
  let forcaSuave = 0
  function update(tempo, forca, camera, neve = 0) {
    uniforms.uNeve.value = neve ? 1 : 0
    const alvo = Math.max(0, Math.min(1, forca || 0))
    forcaSuave += (alvo - forcaSuave) * 0.08
    const f = forcaSuave
    grupo.visible = f > 0.02
    if (!grupo.visible) return
    uniforms.uTempo.value = tempo
    uniforms.uForca.value = f
    // Passo inteiro: ancorar em coordenada fracionária faz a cortina deslizar
    // com a câmera e as gotas parecerem coladas na tela.
    uniforms.uAncora.value.set(Math.floor(camera.x), Math.floor(camera.y), Math.floor(camera.z))
  }

  function dispose() {
    geo.dispose()
    base.dispose()
    mat.dispose()
  }

  return {
    grupo,
    update,
    dispose,
    uniforms,
    get gotas() {
      return gotas
    },
  }
}
