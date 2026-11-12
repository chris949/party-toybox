// セレクトファイブのお題（正解とダミーを登録し、出題のたびに決めた数だけ抜き出す）。数字の根拠は src/modes/five/README.md の10章
import { MAX_OPT, MAX_TOPICS_PER_PLAYER, OPTION_MAX, TITLE_MAX } from '../../core/constants';
import { clean } from '../../core/text';

export const FIVE_PICK = 5;                         // 選ぶ数
export const FIVE_MIN_ANSWERS = 5, FIVE_MIN_DUMMIES = 1;
export const FIVE_MIN_SIZE = 7, FIVE_MAX_SIZE = 12, FIVE_DEFAULT_SIZE = 10; // 出題する選択肢の数

export interface FiveTopic {
  title: string;
  answers: string[];
  dummies: string[];
  size: number;          // 出題する選択肢の数
  dummy: number | null;  // うちダミーの数（null = おまかせ：毎回ランダム）
}

// 選べるダミーの数の範囲。正解が5つを下回らず、登録した数を超えないようにする
export function dummyRange(size: number, answers: number, dummies: number) {
  return { lo: Math.max(1, size - answers), hi: Math.min(dummies, size - FIVE_PICK) };
}
// 選べる選択肢の数の範囲（登録した数まで）
export const sizeRange = (answers: number, dummies: number) =>
  ({ lo: FIVE_MIN_SIZE, hi: Math.min(FIVE_MAX_SIZE, answers + dummies) });

// 決めた数を出せるお題か
export const fiveError = (t: Pick<FiveTopic, 'title' | 'answers' | 'dummies'>): string | null => {
  if (!t.title) return 'お題を入力してください';
  if (t.answers.length < FIVE_MIN_ANSWERS) return `正解を${FIVE_MIN_ANSWERS}個以上入力してください`;
  if (t.dummies.length < FIVE_MIN_DUMMIES) return `ダミーを${FIVE_MIN_DUMMIES}個以上入力してください`;
  const all = [...t.answers, ...t.dummies];
  if (new Set(all).size !== all.length) return '同じ選択肢が重複しています（正解とダミーを通して）';
  if (all.length < FIVE_MIN_SIZE) return `正解とダミーを合わせて${FIVE_MIN_SIZE}個以上入力してください`;
  if (all.length > MAX_OPT) return `正解とダミーは合わせて${MAX_OPT}個までです`;
  return null;
};

// 数を範囲に収める
export function fitCounts(answers: number, dummies: number, size: number, dummy: number | null) {
  const s = sizeRange(answers, dummies);
  const fs = Math.max(s.lo, Math.min(s.hi, Math.trunc(size) || FIVE_DEFAULT_SIZE));
  const d = dummyRange(fs, answers, dummies);
  const fd = dummy == null ? null : Math.max(d.lo, Math.min(d.hi, Math.trunc(dummy) || d.lo));
  return { size: fs, dummy: fd };
}
export const defaultDummy = (size: number, answers: number, dummies: number) => {
  const d = dummyRange(size, answers, dummies);
  return Math.max(d.lo, Math.min(d.hi, Math.round(size / 2)));
};

// 参加者から届いたお題を検査して整える
export function sanitizeFives(list: unknown): FiveTopic[] {
  if (!Array.isArray(list)) return [];
  const opts = (a: unknown) => Array.isArray(a) ? (a.map(o => clean(o, OPTION_MAX)).filter(Boolean) as string[]) : [];
  return list.slice(0, MAX_TOPICS_PER_PLAYER).flatMap((t: any) => {
    const answers = [...new Set(opts(t?.answers))];
    const dummies = [...new Set(opts(t?.dummies))].filter(d => !answers.includes(d));
    const title = clean(t?.title, TITLE_MAX);
    if (fiveError({ title, answers, dummies })) return [];
    return [{ title, answers, dummies, ...fitCounts(answers.length, dummies.length, Number(t?.size), t?.dummy == null ? null : Number(t.dummy)) }];
  });
}

// お題名と選択肢（順不同）が同じなら同じお題とみなす
export const fiveKey = (t: Pick<FiveTopic, 'title' | 'answers' | 'dummies'>) =>
  JSON.stringify([t.title, [...t.answers].sort(), [...t.dummies].sort()]);

// 同梱のサンプル。誰もお題を作っていなくても10人まで遊べるよう、10個以上用意する（ダミーの数はおまかせ）
const s = (title: string, answers: string[], dummies: string[]): FiveTopic => ({ title, answers, dummies, size: FIVE_DEFAULT_SIZE, dummy: null });
export const SAMPLE_FIVES: FiveTopic[] = [
  s('海に面していない都道府県は？', ['栃木県', '群馬県', '埼玉県', '山梨県', '長野県', '岐阜県', '滋賀県', '奈良県'], ['京都府', '岡山県', '福井県', '三重県', '和歌山県', '千葉県']),
  s('哺乳類はどれ？', ['イルカ', 'コウモリ', 'クジラ', 'カモノハシ', 'ラッコ', 'アザラシ'], ['ペンギン', 'サメ', 'ワニ', 'カメ', 'イモリ', 'ダチョウ']),
  s('将棋の駒にあるのは？', ['王将', '飛車', '角行', '金将', '銀将', '桂馬', '香車', '歩兵'], ['騎士', '女王', '僧正', '城', '大砲', '象']),
  s('虹の七色にあるのは？', ['赤', '橙', '黄', '緑', '青', '藍', '紫'], ['桃', '白', '黒', '茶', '金', '灰']),
  s('星占いの12星座にあるのは？', ['おひつじ座', 'おうし座', 'ふたご座', 'かに座', 'しし座', 'おとめ座', 'てんびん座', 'さそり座', 'いて座', 'やぎ座', 'みずがめ座', 'うお座'], ['オリオン座', 'はくちょう座', 'こぐま座', 'カシオペヤ座', 'わし座', 'へびつかい座']),
  s('十二支にいる動物は？', ['ねずみ', 'うし', 'とら', 'うさぎ', 'たつ', 'へび', 'うま', 'ひつじ', 'さる', 'とり', 'いぬ', 'いのしし'], ['ねこ', 'しか', 'くま', 'きつね', 'たぬき', 'かえる']),
  s('元素記号がアルファベット1文字の元素は？', ['水素', '炭素', '窒素', '酸素', 'フッ素', 'リン', '硫黄', 'カリウム', 'ヨウ素'], ['ヘリウム', 'ナトリウム', '鉄', '金', '銀', 'カルシウム']),
  s('太陽系の惑星は？', ['水星', '金星', '地球', '火星', '木星', '土星', '天王星', '海王星'], ['冥王星', '月', '太陽', 'ケレス', '北極星', 'ハレー彗星']),
  s('日本の国民の祝日は？', ['元日', '成人の日', '建国記念の日', '昭和の日', '憲法記念日', 'こどもの日', '海の日', '山の日', '敬老の日', '文化の日', '勤労感謝の日', '天皇誕生日'], ['バレンタインデー', 'ひな祭り', '七夕', 'クリスマス', '大晦日', '母の日']),
  s('国土が南半球にある国は？', ['オーストラリア', 'ニュージーランド', 'アルゼンチン', '南アフリカ', 'チリ', 'マダガスカル'], ['メキシコ', 'エジプト', 'タイ', 'インド', 'ナイジェリア', 'フィリピン']),
  // v0.22 で追加（spec.md の 3.3.1）。時間がたっても答えが変わらない事実だけにする
  s('東北地方の県は？', ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'], ['新潟県', '茨城県', '栃木県', '群馬県', '長野県', '富山県']),
  s('九州・沖縄地方の県は？', ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'], ['山口県', '愛媛県', '高知県', '広島県', '徳島県', '島根県']),
  s('県庁所在地の市は？', ['盛岡市', '宇都宮市', '前橋市', '甲府市', '津市', '松江市', '高松市', '那覇市'], ['浜松市', '郡山市', '倉敷市', '北九州市', '函館市', '高崎市']),
  s('鳥類はどれ？', ['ペンギン', 'ダチョウ', 'ニワトリ', 'フクロウ', 'カラス', 'ハト', 'スズメ'], ['コウモリ', 'ムササビ', 'モモンガ', 'トンボ', 'チョウ', 'トビウオ']),
  s('昆虫はどれ？', ['カブトムシ', 'トンボ', 'セミ', 'アリ', 'ハチ', 'チョウ', 'バッタ'], ['クモ', 'ダンゴムシ', 'ムカデ', 'サソリ', 'ダニ', 'カニ']),
  s('は虫類はどれ？', ['ヘビ', 'トカゲ', 'ワニ', 'カメ', 'ヤモリ', 'カメレオン'], ['イモリ', 'カエル', 'サンショウウオ', 'ウナギ', 'ナマズ', 'タツノオトシゴ']),
  s('国旗に赤が使われている国は？', ['日本', 'アメリカ', '中国', 'フランス', 'イギリス', '韓国', 'カナダ', 'トルコ'], ['ギリシャ', 'スウェーデン', 'ウクライナ', 'アルゼンチン', 'イスラエル', 'フィンランド']),
  s('アフリカの国は？', ['エジプト', 'ケニア', 'ナイジェリア', '南アフリカ', 'モロッコ', 'エチオピア', 'ガーナ', 'タンザニア'], ['サウジアラビア', 'イラン', 'トルコ', 'ペルー', 'パキスタン', 'ヨルダン']),
  s('南アメリカの国は？', ['ブラジル', 'アルゼンチン', 'チリ', 'ペルー', 'コロンビア', 'ベネズエラ', 'ウルグアイ', 'エクアドル'], ['メキシコ', 'キューバ', 'パナマ', 'スペイン', 'ポルトガル', 'コスタリカ']),
  s('素数はどれ？', ['2', '3', '5', '7', '11', '13', '17', '19', '23'], ['1', '9', '15', '21', '27', '51']),
  s('31日まである月は？', ['1月', '3月', '5月', '7月', '8月', '10月', '12月'], ['2月', '4月', '6月', '9月', '11月']),
  s('部首が「さんずい」の漢字は？', ['海', '池', '波', '泳', '油', '流', '湖', '汗'], ['冷', '凍', '准', '雨', '雲', '次']),
  s('弦楽器はどれ？', ['バイオリン', 'ビオラ', 'チェロ', 'コントラバス', 'ギター', 'ハープ', '三味線', '琴'], ['フルート', 'トランペット', 'クラリネット', 'サックス', 'ティンパニ', 'オーボエ']),
  s('金管楽器はどれ？', ['トランペット', 'トロンボーン', 'ホルン', 'チューバ', 'ユーフォニアム', 'コルネット'], ['サックス', 'フルート', 'クラリネット', 'オーボエ', 'ファゴット', 'リコーダー']),
  s('二十四節気にあるのは？', ['立春', '雨水', '啓蟄', '春分', '小満', '夏至', '立秋', '秋分', '冬至', '大寒'], ['七夕', '彼岸', '節分', '土用', '八十八夜', '入梅']),
  s('日本の世界遺産にふくまれるのは？', ['姫路城', '屋久島', '白川郷', '厳島神社', '富士山', '知床', '法隆寺', '原爆ドーム'], ['東京タワー', '大阪城', '名古屋城', '皇居', '松本城', '鳥取砂丘']),
  s('天守が国宝の城は？', ['姫路城', '松本城', '犬山城', '彦根城', '松江城'], ['大阪城', '名古屋城', '熊本城', '弘前城', '高知城', '丸亀城']),
  s('オリンピックのマークの輪の色は？', ['青', '黄', '黒', '緑', '赤'], ['白', '紫', 'オレンジ', 'ピンク', '茶', '金']),
  s('総理大臣になった人は？', ['伊藤博文', '大隈重信', '原敬', '犬養毅', '吉田茂', '佐藤栄作', '田中角栄'], ['西郷隆盛', '坂本龍馬', '福沢諭吉', '大久保利通', '板垣退助', '野口英世']),
  s('七福神にいるのは？', ['恵比寿', '大黒天', '毘沙門天', '弁財天', '福禄寿', '寿老人', '布袋'], ['不動明王', '阿弥陀如来', '帝釈天', '天照大神', '菅原道真', '観音菩薩']),
];
export const SAMPLE_FIVE_KEYS = new Set(SAMPLE_FIVES.map(fiveKey));
