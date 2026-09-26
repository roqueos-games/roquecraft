#!/usr/bin/env python3
"""
Monta o pacote de áudio CC0 do RoqueCraft.

Baixa as fontes, seleciona as amostras, normaliza e escreve
`public/games/roquecraft/audio/` com um `manifest.json`. A procedência e a
licença de cada grupo ficam em `CREDITOS.md`, ao lado dos arquivos.

Por que Python e não `.mjs` como o resto de `scripts/`: o trabalho é
inteiramente orquestração de `ffmpeg` — medir, decidir ganho, recodificar,
conferir — e isso aqui é uma casca fina em volta de `subprocess`. Reescrever em
Node não deixaria nada mais claro e ainda dependeria do mesmo `ffmpeg`.

Uso:
    python3 scripts/build-roquecraft-audio.py            # usa /tmp/rc/audio/dl
    RC_AUDIO_DL=<dir> python3 scripts/build-roquecraft-audio.py

Requer: ffmpeg, ffprobe, p7zip (para os .7z do OpenGameArt).

⚠️ Este script NÃO é rodado no build do app. O pacote é versionado; isto existe
pra poder refazê-lo com a decisão de ganho documentada em vez de um binário que
ninguém sabe de onde veio.
"""
import json, os, re, subprocess, sys, glob

DL = os.environ.get('RC_AUDIO_DL', '/tmp/rc/audio/dl') + '/x'
RAW = os.environ.get('RC_AUDIO_DL', '/tmp/rc/audio/dl')
OUT = os.environ.get('RC_AUDIO_OUT', '/tmp/rc/audio/out')
os.makedirs(OUT, exist_ok=True)

def sh(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode: print('FALHOU:', ' '.join(a[:6]), r.stderr[-300:], file=sys.stderr)
    return r.returncode == 0

def medir(src, extra=''):
    """Pico e RMS em dB de `src`, depois de `extra` (cadeia de filtros)."""
    af = extra + ',' if extra else ''
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', af + 'volumedetect',
                        '-f', 'null', '/dev/null'], capture_output=True, text=True)
    p = re.search(r'max_volume:\s*(-?[\d.]+) dB', r.stderr)
    m = re.search(r'mean_volume:\s*(-?[\d.]+) dB', r.stderr)
    if not p or not m:
        return None
    return {'pico': float(p.group(1)), 'rms': float(m.group(1))}


def um(src, dst, *, q=2, corte=None, inicio=None, rms_alvo=-20.0, pico_teto=-4.0):
    """
    UM-SHOT: corta o silêncio das pontas, normaliza por ENERGIA e limita o pico.

    ⚠️ Duas medidas, não uma. Esta é a terceira versão desta função e cada
    correção veio de uma medição que desmentiu a anterior:

    1ª — `loudnorm` de passada única. LUFS é sonoridade integrada, medida certa
    pra material sustentado e errada pra transiente de 80 ms: passo e picareta
    saíram ceifando em 0,0 dBFS.

    2ª — normalização por PICO a −6 dBFS. Resolveu o ceifamento e criou outro
    problema, medido no jogo rodando: passo na areia saiu a −10,5 dBFS e passo
    na grama a −21, uma inversão de 10 dB. Pico igual não é volume igual — um
    passo na areia é ruído denso de banda larga e um passo na grama é um tique
    esparso; com o mesmo pico, o primeiro tem muito mais energia.

    3ª (esta) — normaliza a ENERGIA (RMS do arquivo já sem silêncio, que é
    praticamente o RMS do evento) e depois impõe um TETO de pico. A energia
    iguala o volume percebido entre famílias; o teto garante a folga.

    E a conferência continua sendo DEPOIS do codec: Vorbis é transformada com
    perda e o pico reconstruído ultrapassa o da entrada em transiente rápido.
    """
    limpa = ('silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:'
             'detection=peak,areverse,'
             'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-50dB:'
             'detection=peak,areverse')
    med = medir(src, limpa)
    if not med:
        return False
    ganho = rms_alvo - med['rms']
    # não deixa o teto de pico ser estourado pela normalização de energia
    if med['pico'] + ganho > pico_teto:
        ganho = pico_teto - med['pico']
    alvo_arq = os.path.join(OUT, dst)

    def render(g):
        fil = [limpa, f'volume={g:.2f}dB', 'aformat=channel_layouts=mono']
        cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
        if inicio: cmd += ['-ss', str(inicio)]
        if corte: cmd += ['-t', str(corte)]
        cmd += ['-i', src, '-ac', '1', '-ar', '32000', '-af', ','.join(fil),
                '-c:a', 'libvorbis', '-q:a', str(q), alvo_arq]
        return sh(*cmd)

    if not render(ganho):
        return False
    for _ in range(2):
        saiu = medir(alvo_arq)
        if not saiu or saiu['pico'] <= pico_teto + 0.6:
            break
        ganho -= (saiu['pico'] - pico_teto)
        if not render(ganho):
            return False
    return True


def leito(src, dst, *, q=0, corte=None, inicio=None, alvo=-24.0):
    """
    LEITO DE AMBIENTE: sustentado, então LUFS é a medida certa — e em DUAS
    passadas, que é a única forma de o loudnorm acertar o alvo (a passada única
    estima do começo do arquivo e erra em material que varia).

    Sem corte de silêncio: o leito precisa emendar consigo mesmo.
    """
    corte_args = []
    if inicio: corte_args += ['-ss', str(inicio)]
    if corte: corte_args += ['-t', str(corte)]
    medir = ['ffmpeg', '-hide_banner'] + corte_args + [
        '-i', src, '-af', f'loudnorm=I={alvo}:TP=-2:LRA=11:print_format=json',
        '-f', 'null', '/dev/null']
    r = subprocess.run(medir, capture_output=True, text=True)
    m = re.search(r'\{[^{]*"input_i"[\s\S]*?\}', r.stderr)
    if m:
        d = json.loads(m.group(0))
        ln = (f'loudnorm=I={alvo}:TP=-2:LRA=11:measured_I={d["input_i"]}:'
              f'measured_TP={d["input_tp"]}:measured_LRA={d["input_lra"]}:'
              f'measured_thresh={d["input_thresh"]}:offset={d["target_offset"]}:linear=true')
    else:
        ln = f'loudnorm=I={alvo}:TP=-2:LRA=11'
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error'] + corte_args + [
        '-i', src, '-ac', '1', '-ar', '32000',
        '-af', f'{ln},aformat=channel_layouts=mono',
        '-c:a', 'libvorbis', '-q:a', str(q), os.path.join(OUT, dst)]
    return sh(*cmd)


def achar(padrao):
    r = sorted(glob.glob(padrao, recursive=True))
    return r

K = f'{DL}/kimpact/**'
FANT = f'{DL}/fantozzi/**'
STEPS = f'{DL}/steps/**'
WATER = f'{DL}/water/**'
RPG = f'{DL}/krpg/**'

manifest = {'versao': 1, 'grupos': {}}

LIMPA = ('silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:'
         'detection=peak,areverse,'
         'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-50dB:'
         'detection=peak,areverse')

RMS_ALVO = -24.0
PICO_TETO = -3.0


def grupo(nome, arquivos, prefixo, rms_alvo=RMS_ALVO):
    """
    Normaliza o GRUPO, não cada arquivo.

    ⚠️ Quarta versão desta lógica, e a diferença importa. Normalizar arquivo por
    arquivo — por pico ou por energia — achata justamente a variação que faz
    cinco amostras soarem como muitas: se todo passo na grama sai no mesmo
    volume, o ouvido percebe o loop. A variação DENTRO do grupo é o produto.
    O que precisa casar é a variação ENTRE grupos.

    Então: mede todos os arquivos do grupo, calcula UM ganho que leva a MÉDIA do
    grupo ao alvo, e aplica esse mesmo ganho a todos. A distância relativa entre
    as amostras do grupo fica intacta; o grupo inteiro sobe ou desce junto.

    Medição que motivou: com normalização por arquivo, os grupos de passo iam de
    −29 dBFS (areia) a −19 (neve) de RMS. No jogo isso apareceu como passo na
    areia 10 dB MAIS ALTO que na grama — inversão audível, e o oposto do que a
    tabela de ganhos pedia.
    """
    medidos = []
    for src in arquivos:
        m = medir(src, LIMPA)
        if m:
            medidos.append((src, m))
    if not medidos:
        print(f'  {nome:22s} SEM FONTE')
        return []
    media = sum(m['rms'] for _, m in medidos) / len(medidos)
    ganho = rms_alvo - media
    # nenhum arquivo do grupo pode furar o teto de pico: o ganho do grupo cede
    folga = min(PICO_TETO - m['pico'] for _, m in medidos)
    if ganho > folga:
        ganho = folga
    saida = []
    for i, (src, _) in enumerate(medidos):
        dst = f'{prefixo}{i}.ogg'
        if render_um(src, dst, ganho):
            saida.append(dst)
    if saida:
        manifest['grupos'][nome] = saida
    print(f'  {nome:22s} {len(saida):2d} amostras  ganho {ganho:+5.1f} dB  (média {media:.1f})')
    return saida


def render_um(src, dst, ganho, q=2):
    """Renderiza com o ganho do grupo e confere o pico DEPOIS do codec."""
    alvo_arq = os.path.join(OUT, dst)

    def render(g):
        fil = [LIMPA, f'volume={g:.2f}dB', 'aformat=channel_layouts=mono']
        return sh('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
                  '-ac', '1', '-ar', '32000', '-af', ','.join(fil),
                  '-c:a', 'libvorbis', '-q:a', str(q), alvo_arq)

    if not render(ganho):
        return False
    # Vorbis é transformada com perda: o pico reconstruído ultrapassa o da
    # entrada em transiente rápido. Mede-se o arquivo FINAL.
    for _ in range(2):
        saiu = medir(alvo_arq)
        if not saiu or saiu['pico'] <= PICO_TETO + 0.8:
            break
        ganho -= (saiu['pico'] - PICO_TETO)
        if not render(ganho):
            return False
    return True


print('PASSOS')
grupo('passo.grama',   achar(f'{K}/footstep_grass_*.ogg'),    'p-grama-')
grupo('passo.neve',    achar(f'{K}/footstep_snow_*.ogg'),     'p-neve-')
grupo('passo.madeira', achar(f'{K}/footstep_wood_*.ogg'),     'p-madeira-')
grupo('passo.pedra',   achar(f'{K}/footstep_concrete_*.ogg'), 'p-pedra-')
grupo('passo.areia',   achar(f'{FANT}/Fantozzi-Sand*.ogg'),   'p-areia-')
grupo('passo.cascalho',achar(f'{STEPS}/gravel.ogg') + achar(f'{FANT}/Fantozzi-Stone*.ogg')[:3], 'p-cascalho-')
grupo('passo.folhas',  achar(f'{STEPS}/leaves0*.ogg'),        'p-folhas-')
grupo('passo.terra',   achar(f'{STEPS}/mud02.ogg') + achar(f'{K}/footstep_carpet_00[012].ogg'), 'p-terra-')

print('FERRAMENTA')
grupo('bate.picareta', achar(f'{K}/impactMining_*.ogg'),        'f-picareta-')
grupo('bate.machado',  achar(f'{RPG}/chop.ogg') + achar(f'{K}/impactWood_light_00[012].ogg'), 'f-machado-')
grupo('bate.pa',       achar(f'{RAW}/tool_pa.ogg') + achar(f'{K}/impactSoft_medium_00[012].ogg'), 'f-pa-')
# "som de batendo a mão na areia" — pedido explícito do founder
grupo('bate.mao',      achar(f'{K}/impactSoft_medium_00[0123].ogg'), 'f-mao-')

print('QUEBRAR')
grupo('quebra.pedra',  achar(f'{RAW}/break_pedra.ogg') + achar(f'{K}/impactPlate_heavy_00[012].ogg'), 'q-pedra-')
grupo('quebra.madeira',achar(f'{K}/impactWood_heavy_00[012].ogg'),  'q-madeira-')
grupo('quebra.vidro',  achar(f'{K}/impactGlass_heavy_00[012].ogg'), 'q-vidro-')
grupo('quebra.metal',  achar(f'{K}/impactMetal_heavy_00[012].ogg'), 'q-metal-')
grupo('quebra.macio',  achar(f'{K}/impactSoft_heavy_00[012].ogg'),  'q-macio-')

print('AGUA')
grupo('agua.mergulho', achar(f'{WATER}/splash_0[5678].ogg'), 'a-mergulho-')
grupo('agua.bracada',  achar(f'{WATER}/splash_0[1234].ogg'), 'a-bracada-')
grupo('agua.bolha',    achar(f'{WATER}/bubble_0*.ogg'),      'a-bolha-')

print('AMBIENTE (loops)')
LOOPS = [
    ('amb.vento',    f'{RAW}/amb_wind.ogg',      10, 0),
    ('amb.chuva',    f'{RAW}/amb_rain.ogg',      12, 2),
    ('amb.passaros', f'{RAW}/amb_birds.ogg',     14, 1),
    ('amb.grilos',   f'{RAW}/amb_grilos.mp3',    12, 1),
    ('amb.ondas',    f'{RAW}/amb_ondas.flac',    12, 2),
    ('amb.caverna',  f'{RAW}/amb_caverna.ogg',   14, 1),
    ('amb.submerso', f'{WATER}/loop_bubbles_1.ogg', 8, 0),
]
for nome, src, dur, ini in LOOPS:
    cand = glob.glob(src, recursive=True)
    if not cand: print(f'  {nome:22s} FONTE AUSENTE'); continue
    dst = nome.replace('.', '-') + '.ogg'
    if leito(cand[0], dst, corte=dur, inicio=ini):
        manifest['grupos'][nome] = [dst]
        print(f'  {nome:22s} {dur}s')

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2, ensure_ascii=False)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
n = len([f for f in os.listdir(OUT) if f.endswith('.ogg')])
print(f'\nTOTAL: {n} arquivos, {total/1024:.0f} KB')
