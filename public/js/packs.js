// Pacotes de presets prontos: nomes, cores e legendas para um grupo de slots do pedal.
// "recipe" explica cada preset em linguagem simples; "sound" são os ajustes que o hub grava no pedal
// (valores de 0 a 100, como o pedal guarda). Blocos fora do "sound" ficam desligados.

const CHAIN = ['fx', 'amp', 'mod', 'dly', 'rev', 'cab'];
const compressor = (Sustain, Attack) => ({ model: 'Compress', knobs: { Gate: 0, Sustain, Attack, Level: 55 } });
const room = (Decay, Mix, lowPass = 80) => ({ model: 'Room', knobs: { Decay, Mix, 'High Pass': 80, 'Low Pass': lowPass, Depth: 40 } });
const hall = (Decay, Mix, lowPass = 80) => ({ model: 'Hall', knobs: { Decay, Mix, 'High Pass': 80, 'Low Pass': lowPass, Depth: 40 } });
const analogDelay = (Time, Feedback, Mix) => ({ model: 'Analog', knobs: { Time, Feedback, Mix, Phaser: 0, Pitch: 0 } });

export const PACKS = [
  {
    id: 'teco-violao',
    name: 'Violão do Teco',
    summary: 'Nove presets para violão eletroacústico, de P60 a P68, com o P64 mudo no meio.',
    instrument: 'Violão eletroacústico (com captador)',
    slots: [
      {
        preset: 60,
        name: 'Teco Natural',
        color: '#7ED6A2',
        use: 'O som do dia a dia: violão com cara de violão, pronto para qualquer música.',
        sound: { volume: 85, chain: CHAIN, fx: compressor(30, 60), rev: room(30, 12) },
        recipe: [
          { module: 'FX', text: 'Compressor leve: segura os picos da batida sem tirar a dinâmica.' },
          { module: 'REV', text: 'Reverb de sala curto: um pouco de ambiente sem embolar.' },
          { module: 'AMP', off: true, text: 'Desligado: amplificador simulado deixa o violão com som de guitarra.' },
          { module: 'CAB', off: true, text: 'Desligado: caixa simulada abafa o violão.' },
        ],
      },
      {
        preset: 61,
        name: 'Teco Dedilhado',
        color: '#93D9CF',
        use: 'Para arpejos e dedilhados: mais brilho e definição em cada corda.',
        sound: { volume: 85, chain: CHAIN, fx: compressor(25, 75), rev: room(35, 14, 95) },
        recipe: [
          { module: 'FX', text: 'Compressor leve com ataque mais lento: o começo de cada nota passa inteiro e o dedilhado fica definido.' },
          { module: 'REV', text: 'Reverb de sala mais brilhante: um rastro curto depois de cada nota.' },
          { module: 'AMP', off: true, text: 'Desligado.' },
          { module: 'CAB', off: true, text: 'Desligado.' },
        ],
      },
      {
        preset: 62,
        name: 'Teco Ritmo',
        color: '#E9D66B',
        use: 'Para levadas batidas: som mais firme e encorpado, que segura a banda.',
        sound: { volume: 85, chain: CHAIN, fx: compressor(50, 45), rev: room(25, 8) },
        recipe: [
          { module: 'FX', text: 'Compressor mais forte: a batida fica uniforme do começo ao fim.' },
          { module: 'REV', text: 'Reverb curto: só para não ficar seco demais.' },
          { module: 'AMP', off: true, text: 'Desligado.' },
          { module: 'CAB', off: true, text: 'Desligado.' },
        ],
      },
      {
        preset: 63,
        name: 'Teco Chorus',
        color: '#45C4DC',
        use: 'Som mais largo e aberto, bom para músicas lentas e introduções.',
        sound: {
          volume: 85, chain: CHAIN, fx: compressor(30, 60), mod: { model: 'Chorus', knobs: { Speed: 20, Depth: 25, Mix: 25 } }, rev: hall(35, 14),
        },
        recipe: [
          { module: 'FX', text: 'Compressor leve.' },
          { module: 'MOD', text: 'Chorus suave: dobra o som e dá sensação de dois violões.' },
          { module: 'REV', text: 'Reverb hall médio.' },
          { module: 'AMP', off: true, text: 'Desligado.' },
          { module: 'CAB', off: true, text: 'Desligado.' },
        ],
      },
      {
        preset: 64,
        name: 'Teco Mudo',
        color: '#EF6B73',
        use: 'Silêncio total. Para trocar de instrumento, afinar ou esperar entre as músicas sem tirar o cabo. Fica a um passo do P63 e do P65.',
        sound: { volume: 0, chain: CHAIN, fx: { model: 'Noise Gate++', knobs: { Gate: 100 } } },
        recipe: [
          { module: 'VOL', text: 'Volume do preset no zero: nenhum som passa.' },
          { module: 'FX', text: 'Noise gate no máximo: segurança extra caso o volume zero ainda deixe passar alguma coisa.' },
        ],
      },
      {
        preset: 65,
        name: 'Teco Adoração',
        color: '#A98BF5',
        use: 'Para ministração e momentos calmos: o violão "flutua" no ambiente.',
        sound: { volume: 85, chain: CHAIN, fx: compressor(30, 60), dly: analogDelay(50, 20, 10), rev: hall(60, 22, 75) },
        recipe: [
          { module: 'FX', text: 'Compressor leve.' },
          { module: 'DLY', text: 'Delay bem suave: repetições baixinhas que preenchem os espaços.' },
          { module: 'REV', text: 'Reverb longo (hall): som de igreja grande.' },
          { module: 'AMP', off: true, text: 'Desligado.' },
          { module: 'CAB', off: true, text: 'Desligado.' },
        ],
      },
      {
        preset: 66,
        name: 'Teco Solo',
        color: '#F2B35B',
        use: 'Para destacar uma introdução ou um dedilhado solo: um pouco mais alto que os outros.',
        sound: { volume: 95, chain: CHAIN, fx: compressor(30, 60), dly: analogDelay(45, 15, 8), rev: hall(35, 14) },
        recipe: [
          { module: 'VOL', text: 'Volume um pouco acima dos outros presets do pacote.' },
          { module: 'FX', text: 'Compressor leve.' },
          { module: 'DLY', text: 'Delay discreto: dá destaque sem atrapalhar o ritmo.' },
          { module: 'REV', text: 'Reverb médio.' },
          { module: 'AMP', off: true, text: 'Desligado.' },
          { module: 'CAB', off: true, text: 'Desligado.' },
        ],
      },
      {
        preset: 67,
        name: 'Teco Ambiente',
        color: '#5B95F5',
        use: 'Para introduções e finais com clima: repetições e reverb mais presentes.',
        sound: { volume: 85, chain: CHAIN, dly: analogDelay(60, 35, 18), rev: hall(70, 25, 75) },
        recipe: [
          { module: 'DLY', text: 'Delay mais presente: as notas ecoam por mais tempo.' },
          { module: 'REV', text: 'Reverb longo.' },
          { module: 'AMP', off: true, text: 'Desligado.' },
          { module: 'CAB', off: true, text: 'Desligado.' },
        ],
      },
      {
        preset: 68,
        name: 'Teco Seco',
        color: '',
        use: 'Para quando a mesa de som já coloca reverb: só o violão limpo.',
        sound: { volume: 85, chain: CHAIN, fx: compressor(30, 60) },
        recipe: [
          { module: 'FX', text: 'Compressor leve.' },
          { module: 'MOD', off: true, text: 'Desligado.' },
          { module: 'DLY', off: true, text: 'Desligado.' },
          { module: 'REV', off: true, text: 'Desligado: o reverb fica por conta da mesa.' },
          { module: 'AMP', off: true, text: 'Desligado.' },
          { module: 'CAB', off: true, text: 'Desligado.' },
        ],
      },
    ],
  },
];

// Texto curto que vai para as anotações do preset (aparece no palco e no card).
export function slotNotes(slot) {
  const on = slot.recipe.filter((r) => !r.off).map((r) => r.text.split(':')[0].replace(/\.$/, '').toLowerCase());
  const off = slot.recipe.filter((r) => r.off).map((r) => r.module);
  let text = slot.use;
  if (on.length) text += `\nReceita: ${on.join(', ')}.`;
  if (off.length) text += `\nDesligados: ${off.join(', ')}.`;
  return text;
}

// "O que é cada parte do som", em linguagem simples.
export const GLOSSARY = [
  { term: 'FX', text: 'O primeiro bloco da corrente. Costuma trazer compressor, booster ou drive.' },
  { term: 'AMP', text: 'Simula um amplificador (limpo, crunch ou distorcido). No violão eletroacústico fica desligado.' },
  { term: 'MOD', text: 'Modulação: chorus, flanger, phaser e tremolo. Dá movimento e largura ao som.' },
  { term: 'DLY', text: 'Delay: repete as notas como um eco.' },
  { term: 'REV', text: 'Reverb: a ambiência, como tocar numa sala ou numa igreja grande.' },
  { term: 'CAB', text: 'Simula a caixa e o alto-falante do amplificador, ou usa um IR carregado. No violão fica desligado, a não ser que você use um IR de violão.' },
  { term: 'VOL', text: 'Volume do preset: quanto ele sai mais alto ou mais baixo que os outros.' },
  { term: 'Compressor', text: 'Deixa o volume mais igual entre notas fortes e fracas.' },
  { term: 'Equalização', text: 'Ajuste de graves, médios e agudos: mais corpo ou mais brilho.' },
  { term: 'Noise gate', text: 'Corta o chiado quando você não está tocando.' },
  { term: 'IR', text: 'Arquivo de som que reproduz uma caixa de amplificador ou o corpo de um instrumento.' },
];
