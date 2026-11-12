# Black Box Hub

Painel para usar a pedaleira **M-VAVE ANNBLACK BOX** pelo navegador: trocar presets, tocar com bateria, montar músicas que trocam o som sozinhas e organizar setlists para ensaio e culto.

**Abrir o app:** https://joaocarlosteco.github.io/blackbox-hub/

> Projeto independente, sem vínculo com a M-VAVE. Não substitui nem altera o firmware do pedal.

---

## Recursos

| Tela | O que faz |
|---|---|
| **Palco** | O pedal na tela: footswitches para trocar de preset, preset atual com nome e cor, módulos, bateria, favoritos e músicas do setlist. |
| **Presets** | Os 80 presets (P01–P80): toque para trocar no pedal; dê nome, cor e anotações; marque favoritos. Inclui o pacote **Violão do Teco** (P60–P68, com P64 mudo) e um guia do que é cada parte do som. |
| **Bateria** | 16 ritmos prontos (rock, pop, funk, blues, 6/8, valsa, bossa nova, samba, baião, metrônomo...), tap tempo, swing, viradas e editor para criar ritmos. |
| **Músicas** | Cada música tem andamento, ritmo e partes (intro, verso, refrão...). Ao tocar, a bateria acompanha e o preset do pedal muda sozinho no começo de cada parte. Organize em setlists. |
| **Controles** | Liga/desliga dos módulos (FX, AMP, MOD, DLY, REV, CAB) e uma varredura guiada para descobrir outros comandos. |
| **Ajustes** | Conexão, saída de som da bateria, tela sempre ligada, footswitch MIDI externo e backup. |

Atalhos no computador: **espaço** toca/para, **← →** trocam de preset, **T** marca o andamento, **V** pede uma virada.

## Como usar

### No celular Android

1. Ligue o pedal na entrada USB-C do celular (cabo USB-C nos dois lados ou adaptador OTG).
2. Abra o link do app no **Chrome** e toque em **Instalar app** (ou **Adicionar à tela inicial**).
3. Toque em **Conectar pedal** e permita o acesso a dispositivos MIDI.

Depois de aberto uma vez com internet, o app funciona **sem internet**. Para receber uma versão nova, abra uma vez conectado.

### No computador

Abra o link no **Chrome** ou no **Edge**, ligue o pedal pelo USB-C e clique em **Conectar pedal**. No Windows, só um programa por vez consegue usar a porta MIDI do pedal.

### Bateria saindo pelo pedal

O pedal também funciona como placa de som USB. No computador, em **Ajustes > Som da bateria**, escolha **Alto-falantes (USB-Audio)** ou toque em **Usar o pedal**. No Android o som normalmente vai para o pedal sozinho. A bateria sai no mesmo fone ou amplificador da guitarra.

Se a bateria for só metrônomo para você, use a saída de fone do aparelho: pela saída do pedal o clique também vai para o som do ambiente.

### Levar seus dados para outro aparelho

Tudo fica salvo no navegador de cada aparelho. Use **Ajustes > Exportar backup** e depois **Restaurar backup** no outro aparelho.

## Compatibilidade

| Onde | Funciona? |
|---|---|
| Chrome ou Edge no Windows, Mac ou Linux | Sim |
| Chrome no Android | Sim (com cabo USB-C ou OTG) |
| iPhone e iPad | Não: o navegador do iOS não tem Web MIDI |
| Firefox e Safari | Não |

## Privacidade e segurança

- Nomes, músicas, setlists e ritmos ficam **só no aparelho**; nada é enviado para servidor.
- O app usa apenas mensagens MIDI padrão: **Program Change** (trocar preset) e **Control Change** (ligar/desligar módulos). SysEx fica desligado, então ele não regrava presets nem firmware.
- Não há dependências externas nem instalação. O único recurso de fora é a fonte Michroma, do Google Fonts; sem ela o app usa a fonte do sistema.
- A bateria é sintetizada na hora com Web Audio: o projeto não contém samples de terceiros.

## O que se sabe sobre a ANNBLACK BOX

Testado em um pedal real:

- No Windows aparece como dispositivo USB composto `VID_4C4A&PID_C755`, com **USB-Audio** e **USB-Midi**, sem driver.
- Troca de preset por **Program Change**: programa 0 = P01 ... programa 79 = P80. Respondeu no canal 16 e em outros canais (provavelmente OMNI).
- Não envia nada pela USB quando é operado, então o app não sabe o preset atual se ele for trocado pelo pé.
- Não responde ao pedido de identidade MIDI universal (`F0 7E 7F 06 01 F7`).

Pelas [notas de versão oficiais do firmware](https://yms-file-store.oss-cn-hongkong.aliyuncs.com/software/releaseNote/firmware/BlackBox.txt), ainda a confirmar em cada pedal:

- **CC 0 a 5** ligam e desligam **FX, AMP, MOD, DLY, REV e CAB**.
- A versão V21 acrescentou escolha de canal de recepção (1–16 ou OMNI), controle de modelos/parâmetros e tap tempo por MIDI, sem publicar os números.
- O áudio do aparelho pela USB sai na saída do pedal.

## Próximos passos

- **Editor de presets:** ler os 80 presets do pedal, fazer backup, editar e gravar. Depende do protocolo próprio da M-VAVE, documentado pela comunidade (por exemplo [jvsobrinho/mvave-blackbox-ble](https://github.com/jvsobrinho/mvave-blackbox-ble)). A ideia é começar só com leitura.
- **Gravar os pacotes no pedal:** hoje o pacote Violão do Teco dá nomes e legendas no app; com o editor, as receitas viram ajustes gravados nos slots.
- **Repetir uma parte da música** na hora (útil quando o refrão se repete ao vivo).

## Desenvolvimento

Requer Node 18 ou mais novo. Não há dependências para instalar.

```bash
npm start
```

Abre em http://localhost:8780. O Web MIDI só funciona em `https` ou `localhost`, por isso o servidor local.

- No `localhost` o modo offline fica desligado para sempre carregar o código novo. Para testá-lo, abra `http://localhost:8780/?sw=1`.
- Ao mudar arquivos do app, troque a versão em `APP_CACHE` no `public/sw.js`; se criar arquivos, inclua-os em `ASSETS`.
- Os ícones PNG são gerados por `node tools/make-icons.js`.

### Publicação

O workflow `.github/workflows/pages.yml` publica a pasta `public/` no **GitHub Pages** a cada push na branch `main`.

### Estrutura

```
public/                   o app publicado
  index.html              página
  app.css                 visual
  sw.js                   modo offline (service worker)
  manifest.webmanifest    instalação como app
  js/main.js              casca, navegação, ações e atalhos
  js/store.js             dados salvos no navegador e backup
  js/midi.js              Web MIDI (Program Change e CC)
  js/drums/               motor da bateria, sons sintetizados e ritmos
  js/views/               telas: palco, presets, bateria, músicas, controles, ajustes
server.js                 servidor local para desenvolvimento
tools/make-icons.js       gera os ícones PNG
.github/workflows/        publicação no GitHub Pages
```
