// PARA ONDE O JOGADOR ESTÁ OLHANDO.
//
// Este arquivo existe por causa de um bug, e a forma dele é o conserto.
//
// A câmera e a mira derivavam a direção de `yaw` em DOIS lugares diferentes, e
// discordavam no sinal de X: a câmera usava `+sin(yaw)`, o raio da mira usava
// `-sin(yaw)`. Resultado: você mirava num bloco e o jogo mirava no bloco
// espelhado do outro lado do eixo Z. Olhando pro norte ou pro sul o erro some
// (sin = 0) e tudo parece certo; olhando pro leste ou pro oeste a mira aponta
// pro lado oposto. O founder relatou como "está difícil identificar qual bloco
// será quebrado" (2026-08-22) - o contorno estava certo, no bloco errado.
//
// Duas fórmulas independentes pro mesmo vetor sempre acabam assim. Agora existe
// UMA, e a câmera é configurada por aqui também, com um teste que compara o
// vetor devolvido com a direção real da câmera do three.
//
// Convenção: yaw = 0 olha pro -Z; yaw cresce girando pro +X. pitch positivo
// olha pra cima.

/**
 * Aplica yaw/pitch na câmera do three.
 *
 * A ordem YXZ importa: no XYZ padrão o pitch é aplicado ANTES do yaw e a câmera
 * "rola" quando você olha pra cima e vira ao mesmo tempo.
 */
export function aplicarNaCamera(camera, yaw, pitch) {
  camera.rotation.order = 'YXZ'
  camera.rotation.y = -yaw
  camera.rotation.x = pitch
  return camera
}

/**
 * O MESMO vetor que a câmera acima produz, sem alocar Vector3 nem precisar de
 * uma câmera à mão (o caminho quente chama isto todo quadro).
 */
export function direcaoDoOlhar(yaw, pitch) {
  const cp = Math.cos(pitch)
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp }
}
