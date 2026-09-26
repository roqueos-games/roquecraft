<template>
  <svg
    class="rc-icon"
    :width="size"
    :height="size"
    viewBox="0 0 8 8"
    shape-rendering="crispEdges"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <rect v-for="(r, i) in cells" :key="i" :x="r[0]" :y="r[1]" :width="r[2]" :height="r[3]" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { DESENHOS } from './icones.js'

const props = defineProps({
  nome: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
})

const cells = computed(() => DESENHOS[props.nome] || [])
</script>

<style scoped lang="scss">
.rc-icon {
  display: block;
  flex: none;
}
</style>
