#!/usr/bin/env python3
"""
O SOM DE CACHOEIRA DO ROQUECRAFT — sintetizado, pelo mesmo caminho das ondas.

"crie pra mim suporte a cachoeira" — founder, 26/08/2026.

⚠️ POR QUE SINTETIZAR, E NÃO BAIXAR UMA AMOSTRA

As três razões de `gen-roquecraft-ondas.py` valem inteiras aqui, e a segunda
vale ainda mais: cachoeira é o som mais CONTÍNUO do jogo. Ela não tem evento,
não tem transiente, não começa nem termina — é um regime permanente. Um loop
mal fechado numa fonte assim é ouvido na primeira volta, porque não há ataque
nenhum pra esconder a emenda.

Sintetizada, ela fecha por construção: todo período do envelope divide a
duração, e o ruído é cruzado com o trecho que VIRIA depois do fim, ligando duas
amostras vizinhas do mesmo ruído em vez de duas pontas sem relação.

E nasce CC0 por construção, sem precisar de rastro em CREDITOS.md, porque não
veio de lugar nenhum.

⚠️ COMO CACHOEIRA DIFERE DE CHUVA E DE ONDAS — é o que separa os três leitos

Os três são ruído filtrado, e é fácil fazer os três soarem igual. O que os
distingue:

  · ONDAS têm envelope FUNDO e lento: sobe, quebra, reflui, silencia. A
    dinâmica é quase toda a informação.
  · CHUVA é quase estacionária, mas granular: são milhares de impactos curtos.
  · CACHOEIRA é estacionária e CONTÍNUA — a variação é pequena (±15%) e lenta.
    Uma cachoeira que "respira" como onda soa como fita rodando.

Por isso o envelope daqui é raso de propósito. O que dá vida a ela não é a
dinâmica, é o ESPECTRO em três camadas:

  1. o RONCO, abaixo de 250 Hz — a massa de água batendo. É ele que faz a
     cachoeira ser sentida antes de ser ouvida;
  2. o CORPO, de 250 Hz a 1,5 kHz — o volume de água em queda;
  3. o BORRIFO, acima de 1,5 kHz — a névoa, e a única camada que varia bastante,
     porque é o que o vento leva.

Sem a camada 1, o resultado é chuveiro. Sem a 3, é ruído de máquina de lavar.

As bandas NÃO se sobrepõem, e isso não é detalhe de implementação: é o que faz
o peso de cada camada virar a fatia dela no espectro. Ver o aviso longo lá
embaixo — a primeira versão empilhou passa-baixas e produziu o leito de ondas.

Uso:
    python3 gen-cachoeira.py [saida.ogg]
Requer: numpy, ffmpeg com libvorbis.
"""
import os
import subprocess
import sys
import wave

import numpy as np

SR = 32000  # a taxa do resto do pacote
DUR = 20.0  # segundos — bem acima do piso de 4 s que `ambienteLoop.spec.js` cobra
SAIDA = sys.argv[1] if len(sys.argv) > 1 else '/tmp/scratch/amb-cachoeira.ogg'

n = int(SR * DUR)
t = np.arange(n) / SR
rng = np.random.default_rng(20260826)


def _um_polo(x, a):
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = a * acc + (1 - a) * x[i]
        y[i] = acc
    return y


def passa_baixa(x, corte, sr=SR, circular=False):
    """Um polo, ida e volta (fase zero). `circular` mantém a periodicidade."""
    a = np.exp(-2.0 * np.pi * corte / sr)
    if circular:
        m = len(x)
        tri = np.concatenate([x, x, x])
        z = _um_polo(tri, a)
        z = _um_polo(z[::-1], a)[::-1]
        return z[m : 2 * m]
    y = _um_polo(x, a)
    return _um_polo(y[::-1], a)[::-1]


def ruido_rosa(m):
    """Ruído branco moldado em 1/f — o espectro da água em movimento."""
    branco = rng.standard_normal(m)
    espectro = np.fft.rfft(branco)
    f = np.fft.rfftfreq(m, 1 / SR)
    f[0] = f[1]
    espectro /= np.sqrt(f)
    saida = np.fft.irfft(espectro, m)
    return saida / (np.abs(saida).max() + 1e-9)


# ── O ENVELOPE, RASO DE PROPÓSITO ───────────────────────────────────────────
#
# Todo período divide a duração: cada componente completa um número INTEIRO de
# ciclos em 20 s, então o valor no fim é idêntico ao do começo e o loop não tem
# degrau. Os números de ciclos são primos entre si, o que espalha os batimentos.
#
# ⚠️ A PROFUNDIDADE É 0,15 E NÃO 0,5 COMO NAS ONDAS. Cachoeira é regime
# permanente: ela não sobe nem quebra. Com envelope fundo ela vira onda; com
# envelope zero ela vira ruído de teste. Quinze por cento é o bastante pra o
# ouvido não trancar na constância sem inventar uma dinâmica que não existe.
CICLOS = [(3, 0.38), (7, 0.27), (13, 0.20), (19, 0.15)]
env = np.zeros(n)
for k, peso in CICLOS:
    fase = rng.random() * 2 * np.pi
    env += peso * np.sin(2 * np.pi * k * t / DUR + fase)
env = 1.0 + 0.15 * env / sum(p for _, p in CICLOS)

# O borrifo tem vida PRÓPRIA e mais solta: é a névoa que o vento leva, e ela
# varia bem mais que a massa de água. Períodos diferentes dos do envelope, pra
# que as duas variações não andem juntas (o que soaria como um só efeito).
neb = np.zeros(n)
for k, peso in [(5, 0.5), (11, 0.32), (23, 0.18)]:
    fase = rng.random() * 2 * np.pi
    neb += peso * np.sin(2 * np.pi * k * t / DUR + fase)
neb = 0.55 + 0.45 * neb  # 0,1 .. 1,0

# ── AS TRÊS CAMADAS ─────────────────────────────────────────────────────────
#
# ⚠️ O RUÍDO É GERADO MAIS LONGO QUE O LOOP. O envelope fecha por construção, o
# ruído não fecha por nada — o último quadro não tem relação com o primeiro. A
# sobra existe pra cruzar o começo com o trecho que VIRIA depois do fim: aí a
# junção liga duas amostras VIZINHAS do mesmo ruído, contínua por definição.
FADE = int(0.04 * SR)
base = ruido_rosa(n + FADE)

# ⚠️ BANDAS QUE NÃO SE SOBREPÕEM, e a primeira versão errou exatamente aqui.
#
# Eu tinha feito as três camadas como passa-baixas empilhados (180, 900, e uma
# passa-alta). Como ruído rosa já tem energia em 1/f, os três somados deram
# 90% da energia abaixo de 250 Hz — espectro IDÊNTICO ao do leito de ondas
# (92/8/0). Medido lado a lado, a minha "cachoeira" era o mar.
#
# É o defeito que o cabeçalho deste arquivo avisa em voz alta ("é fácil fazer os
# três soarem igual") e eu caí nele mesmo assim. O que salvou foi comparar com
# um leito conhecido em vez de confiar no desenho.
#
# Com banda separada, o peso de cada camada VIRA a fatia dela no espectro, e o
# alvo deixa de ser esperança.
grave = passa_baixa(base, 250)
medio = passa_baixa(base, 1500) - grave
agudo = base - passa_baixa(base, 1500)

w = np.linspace(0.0, 1.0, FADE)
for camada in (grave, medio, agudo):
    camada[:FADE] = camada[:FADE] * w + camada[n : n + FADE] * (1 - w)
grave, medio, agudo = grave[:n], medio[:n], agudo[:n]

# ── O ALVO ESPECTRAL, MEDIDO CONTRA OS LEITOS QUE JÁ EXISTEM ────────────────
#
#   amb-ondas  →  92 / 8 / 0     (grave puro: o mar visto de longe)
#   amb-chuva  →   3 / 50 / 45   (sem grave nenhum: são milhares de impactos)
#
# Cachoeira fica ENTRE os dois, e é isso que a torna reconhecível: ela tem o
# ronco que a chuva não tem e o borrifo que o mar não tem. Sem o grave vira
# chuveiro; sem o agudo vira máquina de lavar.
ALVO = (0.35, 0.40, 0.25)

# Cada camada entra com energia unitária, e o peso passa a ser a raiz da fatia
# desejada — energia é amplitude ao quadrado.
for camada in (grave, medio, agudo):
    camada /= np.sqrt(np.mean(camada**2)) + 1e-12

# O borrifo é o único que respira: é a névoa que o vento leva.
sinal = (
    grave * np.sqrt(ALVO[0])
    + medio * np.sqrt(ALVO[1])
    + agudo * np.sqrt(ALVO[2]) * neb
)
sinal *= env

# Normaliza por ENERGIA e deixa folga de pico: ambiente não pode encostar no
# teto, senão briga com passo, chuva e vento na mesma mistura. O mesmo −26 dBFS
# do leito de ondas, pra que os dois convivam sem um comer o outro.
rms = np.sqrt(np.mean(sinal**2))
sinal *= (10 ** (-26.0 / 20)) / (rms + 1e-9)
pico = np.abs(sinal).max()
if pico > 0.5:
    sinal *= 0.5 / pico

# ── A PROVA DE QUE O LOOP FECHA ─────────────────────────────────────────────
# Compara o salto na EMENDA (último quadro → primeiro) com o passo típico do
# sinal. Se a emenda for um outlier, há um clique a cada volta — e é exatamente
# o defeito que o founder ouviu no leito de ondas de 2 s.
# ── A PROVA DE QUE ELA NÃO É OUTRO LEITO ────────────────────────────────────
# Sem esta conta eu já entreguei uma cachoeira com o espectro do mar.
_X = np.abs(np.fft.rfft(sinal * np.hanning(n))) ** 2
_f = np.fft.rfftfreq(n, 1 / SR)
_tot = _X[(_f >= 20) & (_f < 16000)].sum()
_fatias = [_X[(_f >= a) & (_f < b)].sum() / _tot for a, b in [(20, 250), (250, 1500), (1500, 8000)]]
print('espectro  20-250Hz={:.0f}%  250-1.5k={:.0f}%  1.5-8k={:.0f}%'.format(*[100 * x for x in _fatias]))
if _fatias[0] > 0.6:
    print('GRAVE DEMAIS: isto vai soar como o leito de ondas', file=sys.stderr)
    sys.exit(3)
if _fatias[2] < 0.10:
    print('SEM BORRIFO: isto vai soar como maquina de lavar', file=sys.stderr)
    sys.exit(3)

passo_tipico = np.median(np.abs(np.diff(sinal)))
emenda = abs(sinal[0] - sinal[-1])
razao = emenda / (passo_tipico + 1e-12)
print(f'emenda={emenda:.6f}  passo tipico={passo_tipico:.6f}  razao={razao:.1f}x')
if razao > 8:
    print('EMENDA AUDIVEL: o loop tem degrau', file=sys.stderr)
    sys.exit(2)

pcm = (np.clip(sinal, -1, 1) * 32767).astype('<i2')
tmp = '/tmp/rc-cachoeira.wav'
with wave.open(tmp, 'wb') as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes(pcm.tobytes())

alvo = os.path.abspath(SAIDA)
os.makedirs(os.path.dirname(alvo), exist_ok=True)
r = subprocess.run(
    ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp,
     '-c:a', 'libvorbis', '-q:a', '3', '-ar', str(SR), '-ac', '1', alvo],
    capture_output=True, text=True,
)
if r.returncode:
    print(r.stderr[-400:], file=sys.stderr)
    sys.exit(1)
print(f'{alvo}  {DUR:.0f}s  {os.path.getsize(alvo)/1024:.0f} KB')
