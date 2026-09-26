<template>
  <div class="rc-mira" aria-hidden="true">
    <i /><i />

    <!-- CARGA DO ARCO, ACIMA da mira — a do golpe fica abaixo, e as duas
         podem estar vivas no mesmo quadro (espada na mão esquerda do tempo,
         arco puxado). Cor própria: a do golpe diz "ainda não", esta diz
         "quanto mais, melhor", e são recados opostos com a mesma forma. -->
    <b v-if="arcoArmado" class="rc-mira__arco" :class="{ 'is-cheio': cargaDoArco >= 1 }">
      <span :style="{ width: `${Math.round(cargaDoArco * 100)}%` }" />
    </b>

    <!-- CARGA DO GOLPE.
         Só aparece enquanto recarrega — uma barra permanente vira sujeira na
         mira, e o que ela precisa dizer é "ainda não". Fica embaixo pra não
         cobrir o ponto de mira. -->
    <b v-if="cargaDoGolpe < 1" class="rc-mira__carga">
      <span :style="{ width: `${Math.round(cargaDoGolpe * 100)}%` }" />
    </b>

    <!-- O crítico pisca uma vez e some: é um recibo, não um estado. -->
    <em v-if="critico" class="rc-mira__critico">✧</em>

    <!-- A GUARDA é estado, não recibo: fica enquanto o botão estiver
         segurado. Um arco embaixo, longe do ponto de mira, porque ele
         convive com a barra de carga do golpe. -->
    <u v-if="guarda" class="rc-mira__guarda" />
  </div>
</template>

<script setup>
// A MIRA E OS SEUS RECIBOS.
//
// ⚠️ SAIU DO COMPONENTE porque parou de ser "dois traços": são quatro estados
// de combate compartilhando 18 px, e a regra de qual pode aparecer junto com
// qual é decisão de interface, não de jogo. Dentro do `ROSRoqueCraft.vue` isso
// só podia ser conferido subindo o jogo inteiro.
//
// Tudo aqui é `aria-hidden`, como a mira sempre foi: é reforço visual de
// estado que o HUD e o rótulo do item já dizem em texto. Um leitor de tela
// anunciando "carga 40%" sessenta vezes por segundo seria ruído, não acesso.
defineProps({
  /** 0..1 — cheia quer dizer "pode bater". */
  cargaDoGolpe: { type: Number, default: 1 },
  critico: { type: Boolean, default: false },
  /** 0..1 — quanto da corda já foi puxada. */
  cargaDoArco: { type: Number, default: 0 },
  /** Pergunta SEPARADA da carga: carga 0 é arco no chão E corda recém-puxada. */
  arcoArmado: { type: Boolean, default: false },
  guarda: { type: Boolean, default: false },
})
</script>

<style lang="scss" scoped>
@import './styles/rc-mira.scss';
</style>
