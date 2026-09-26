// RoqueCraft - BORRIFO: a nevoa que sobe do pe da cachoeira.
//
// ⚠️ BORRIFO NAO E ESTILHACO, e reusar `estilhaco.js` teria sido o caminho
// obvio e errado.
//
// O caco de bloco quebrado QUICA, perde energia no atrito e PARA no chao -- e
// isso e o certo pra ele: um pedaco de pedra que sai voando tem que ir parar em
// algum lugar. Gota de agua nao. Ela sobe, abre, e some no ar: nao encosta, nao
// repousa, nao vira pilha. Com a fisica do caco, o pe da cachoeira acumularia
// cubinhos brancos parados no chao pra sempre -- que e a cara de um defeito, e
// nao de uma nevoa.
//
// Puro de proposito: entra estado, sai estado. Sem THREE, sem cena, sem Vue.

/** Quanto a gota vive, em segundos. Curta: nevoa nao tem memoria. */
export const VIDA = { min: 0.45, max: 1.1 }

/**
 * ⚠️ TETO DE GOTAS, E ELE NAO E OPCIONAL.
 *
 * A cachoeira nao acaba: ela emite enquanto o jogador estiver perto. Sem teto,
 * um minuto parado na frente de uma queda grande vira dezenas de milhares de
 * particulas e o quadro morre. O teto e o que transforma "emissor eterno" em
 * "custo constante".
 */
export const TETO = 220

/** Gotas por segundo, na cachoeira mais forte. Escala com a forca. */
export const TAXA_MAXIMA = 90

/** Gravidade da gota. Mais leve que a do caco: agua fina flutua mais. */
export const GRAVIDADE = 11

/**
 * Quantas gotas nascem neste quadro.
 *
 * Devolve inteiro e guarda a sobra fora daqui: com `Math.round` por quadro,
 * uma taxa de 0,4 gota por quadro arredonda pra zero pra sempre e a cachoeira
 * fraca nunca borrifa.
 */
export function quantasNascem(forca, dt, sobra = 0) {
  const querem = sobra + Math.max(0, Math.min(1, forca)) * TAXA_MAXIMA * dt
  const inteiras = Math.floor(querem)
  return { quantas: inteiras, sobra: querem - inteiras }
}

/**
 * Uma leva de gotas no pe da queda.
 *
 * ⚠️ ELAS NASCEM EM ANEL, e nao num ponto. A coluna bate no chao e a agua sai
 * PRA FORA -- borrifo que sobe reto de um pixel so parece fumaca de chamine.
 * O raio e pequeno (a celula tem 1 bloco), mas e o que da a silhueta.
 */
export function nascerBorrifo(base, quantas, forca, rnd = Math.random) {
  const gotas = []
  for (let i = 0; i < quantas; i++) {
    const ang = rnd() * Math.PI * 2
    const r = 0.15 + rnd() * 0.55
    // A forca da queda empurra a gota mais longe e mais alto: cachoeira grande
    // levanta nevoa, cachoeira pequena so molha o chao em volta.
    const impulso = 0.6 + forca * 1.6
    gotas.push({
      x: base.x + 0.5 + Math.cos(ang) * r,
      y: base.y + 0.25 + rnd() * 0.4,
      z: base.z + 0.5 + Math.sin(ang) * r,
      vx: Math.cos(ang) * (0.5 + rnd() * 1.5) * impulso,
      vy: (1.4 + rnd() * 2.6) * impulso,
      vz: Math.sin(ang) * (0.5 + rnd() * 1.5) * impulso,
      t: 0,
      vida: VIDA.min + rnd() * (VIDA.max - VIDA.min),
      s: 0.05 + rnd() * 0.09,
    })
  }
  return gotas
}

/**
 * Um passo. Devolve a lista SEM as gotas que morreram.
 *
 * Nao ha colisao, e e de proposito: gota que testa o chao a cada quadro custa
 * uma leitura de mundo por particula, e o que ela ganharia com isso -- parar em
 * cima da pedra -- e justamente o que nao se quer.
 */
export function passoDoBorrifo(gotas, dt) {
  const vivas = []
  for (const g of gotas) {
    g.t += dt
    if (g.t >= g.vida) continue
    g.vy -= GRAVIDADE * dt
    g.x += g.vx * dt
    g.y += g.vy * dt
    g.z += g.vz * dt
    // Arrasto: a gota fina perde velocidade horizontal rapido, e e isso que faz
    // a nevoa ABRIR e parar, em vez de sair reta como cuspe.
    g.vx *= 1 - Math.min(1, 2.6 * dt)
    g.vz *= 1 - Math.min(1, 2.6 * dt)
    vivas.push(g)
  }
  return vivas
}

/** Opacidade da gota agora: nasce cheia e apaga no fim. */
export const opacidadeDa = (gota) => Math.max(0, 1 - gota.t / gota.vida)

/**
 * Junta a leva nova as que ja existem, respeitando o teto.
 *
 * ⚠️ QUANDO ESTOURA, AS MAIS VELHAS SAEM. Cortar as novas congelaria a nevoa
 * num instante do passado: as gotas presas iriam morrendo e nenhuma nova
 * entraria ate a lista esvaziar, e o efeito piscaria.
 */
export function juntar(gotas, novas, teto = TETO) {
  const todas = gotas.concat(novas)
  // Quantas sobram alem do teto -- zero quando cabe tudo, e ai a lista sai
  // inteira, sem copia.
  //
  // ⚠️ Era um `todas.length <= teto ? todas : slice(...)`, e aquele comparador
  // nao tinha como ter dono: no tamanho EXATO do teto, `slice(teto - teto)` e'
  // `slice(0)`, que devolve o mesmo conteudo. Os dois lados do `<=` davam a
  // mesma lista, entao nenhum teste podia distingui-los.
  const excesso = Math.max(0, todas.length - teto)
  return excesso ? todas.slice(excesso) : todas
}
