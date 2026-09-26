// O Vite do repo serve dois usos: `yarn dev`, que roda o jogo sozinho no navegador com o
// host de desenvolvimento do SDK (dev/), e `yarn test`, com o Vitest. No RoqueOS quem
// compila o jogo é o Vite do próprio RoqueOS: este arquivo não vai junto.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    setupFiles: ['test/preparar.js'],
    include: ['test/**/*.spec.js'],
    // 15 s, o mesmo teto do front: os testes que geram mundo têm o deles
    // (`test/tetos.js`), e este pega o resto que trava. Com o padrão de 5 s do
    // Vitest, o teste que monta o jogo inteiro estoura numa máquina ocupada
    // com a suíte verde ao lado.
    testTimeout: 15000,
  },
})
