import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'

export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      // O jogo roda num app Vue próprio, sem o Quasar do RoqueOS: componente usado sem
      // import é tela quebrada fora do RoqueOS.
      'vue/no-undef-components': 'error',
    },
  },
  // O Worker do terreno (`src/servicos/chunkWorker.js`) roda no escopo de worker.
  {
    files: ['src/servicos/chunkWorker.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
  // ⚠️ VARIÁVEL MORTA QUE VEIO DO ROQUEOS, arquivo por arquivo. No front
  // `no-unused-vars` é aviso, e estes treze arquivos chegaram com 24 delas. Aqui
  // continuam aviso SÓ neles: o código viajou sem mudança (dois são de GPU, e
  // `src/servicos/render/` não muda sem evidência num iPhone), e limpar é
  // decisão à parte. Arquivo novo, ou fora desta lista, reprova como sempre.
  {
    files: [
      'src/servicos/physics.js',
      'src/servicos/render/entities.js',
      'test/composables/useRoqueCraftMundoVivo.spec.js',
      'test/servicos/cama.spec.js',
      'test/servicos/core.spec.js',
      'test/servicos/mesherProfundidade.spec.js',
      'test/servicos/nado.spec.js',
      'test/servicos/perf.spec.js',
      'test/servicos/pipeline.spec.js',
      'test/servicos/redstone.spec.js',
      'test/servicos/viagemEntreDimensoes.spec.js',
      'test/servicos/worldgen-censo.spec.js',
      'test/threeStub.js',
    ],
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
  },
  // Os roteiros de QA vieram do `scripts/` do RoqueOS sem mudança, e valem aqui as
  // regras que valiam lá: nome começado em `_` é variável morta de propósito, e
  // `no-unexpected-multiline` fica desligada como no front (o
  // `@vue/eslint-config-prettier` desliga, porque o Prettier é quem quebra a linha
  // antes do `[` em `qa/qa-roquecraft-contorno.mjs`).
  {
    files: ['qa/**/*.mjs'],
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-unexpected-multiline': 'off',
    },
  },
]
