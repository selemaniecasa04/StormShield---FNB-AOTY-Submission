// Alert text in South Africa's 11 official spoken languages.
// English is reviewed. All other languages are DRAFT translations awaiting native-speaker review.
import type { Hazard } from "./geo";
import type { Level } from "./risk";

export const LANGS = [
  { code: "en", name: "English", native: "English" },
  { code: "zu", name: "isiZulu", native: "isiZulu" },
  { code: "xh", name: "isiXhosa", native: "isiXhosa" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "st", name: "Sesotho", native: "Sesotho" },
  { code: "tn", name: "Setswana", native: "Setswana" },
  { code: "ts", name: "Xitsonga", native: "Xitsonga" },
  { code: "ve", name: "Tshivenda", native: "Tshivenḓa" },
  { code: "nso", name: "Sepedi", native: "Sepedi" },
  { code: "ss", name: "siSwati", native: "siSwati" },
  { code: "nr", name: "isiNdebele", native: "isiNdebele" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.code === x);
export const langName = (c: string) => LANGS.find((l) => l.code === c)?.name ?? "English";

type Pack = { hazard: Record<Hazard, string>; level: Record<Level, string>; eased: string; checkin: string };

const T: Record<Lang, Pack> = {
  en: {
    hazard: { flood: "Flood warning", rain: "Heavy rain", landslide: "Landslide risk", wind: "Strong winds", road: "Road closure" },
    level: {
      green: "No weather concerns in your area.",
      yellow: "Heavy rain is possible. Prepare your emergency kit.",
      orange: "Flooding is likely. Move vehicles and valuables to higher ground.",
      red: "Extreme flood danger. Evacuate now to the nearest shelter.",
    },
    eased: "The risk is easing. Stay alert and avoid flooded roads.",
    checkin: "Are you safe? Please check in.",
  },
  zu: {
    hazard: { flood: "Isexwayiso sezikhukhula", rain: "Imvula enamandla", landslide: "Ingozi yokudilika komhlaba", wind: "Imimoya enamandla", road: "Umgwaqo uvaliwe" },
    level: {
      green: "Azikho izinkinga zesimo sezulu endaweni yakho.",
      yellow: "Kungenzeka kube nemvula enamandla. Lungisa isikhwama sakho sezimo eziphuthumayo.",
      orange: "Kungenzeka kube nezikhukhula. Susa izimoto nezinto zakho eziyigugu uziyise endaweni ephakeme.",
      red: "Ingozi enkulu yezikhukhula. Phuma manje uye endaweni yokukhosela eseduze.",
    },
    eased: "Ingozi iyancipha. Qaphela futhi ugweme imigwaqo egcwele amanzi.",
    checkin: "Uphephile? Sicela usazise.",
  },
  xh: {
    hazard: { flood: "Isilumkiso sezikhukula", rain: "Imvula enkulu", landslide: "Umngcipheko wokudilika komhlaba", wind: "Imimoya enamandla", road: "Indlela ivaliwe" },
    level: {
      green: "Akukho zinkxalabo zemozulu kwindawo yakho.",
      yellow: "Kunokubakho imvula enkulu. Lungisa ingxowa yakho yongxamiseko.",
      orange: "Izikhukula zinokwenzeka. Susa izithuthi nezinto zakho ezixabisekileyo uziyise kwindawo ephakamileyo.",
      red: "Ingozi enkulu yezikhukula. Shiya ngoku uye kwindawo yokhuseleko ekufutshane.",
    },
    eased: "Ingozi iyancipha. Hlala uphaphile kwaye uphephe iindlela ezinamanzi.",
    checkin: "Ukhuselekile? Nceda usazise.",
  },
  af: {
    hazard: { flood: "Vloedwaarskuwing", rain: "Swaar reën", landslide: "Grondverskuiwingsrisiko", wind: "Sterk winde", road: "Pad gesluit" },
    level: {
      green: "Geen weerkommer in jou area nie.",
      yellow: "Swaar reën is moontlik. Maak jou noodtas gereed.",
      orange: "Oorstromings is waarskynlik. Skuif voertuie en waardevolle items na hoër grond.",
      red: "Uiterste vloedgevaar. Ontruim nou na die naaste skuiling.",
    },
    eased: "Die risiko neem af. Bly waaksaam en vermy oorstroomde paaie.",
    checkin: "Is jy veilig? Meld asseblief aan.",
  },
  st: {
    hazard: { flood: "Temoso ya meroallo", rain: "Pula e matla", landslide: "Kotsi ya ho wa ha mobu", wind: "Meya e matla", road: "Tsela e kwetswe" },
    level: {
      green: "Ha ho na matshwenyeho a boemo ba lehodimo sebakeng sa hao.",
      yellow: "Pula e matla e ka nna ya na. Lokisa mokotla wa hao wa tshohanyetso.",
      orange: "Meroallo e ka nna ya etsahala. Tlosa dikoloi le thepa ya bohlokwa o di ise sebakeng se phahameng.",
      red: "Kotsi e kgolo ya meroallo. Tloha jwale o ye setshabelong se haufi.",
    },
    eased: "Kotsi e a fokotseha. Lula o falimehile mme o qobe ditsela tse nang le metsi.",
    checkin: "Na o bolokehile? Ka kopo re tsebise.",
  },
  tn: {
    hazard: { flood: "Tlhagiso ya merwalela", rain: "Pula e kgolo", landslide: "Kotsi ya go thelela ga mmu", wind: "Diphefo tse di maatla", road: "Tsela e tswetswe" },
    level: {
      green: "Ga go na matshwenyego a boemo jwa loapi mo kgaolong ya gago.",
      yellow: "Pula e kgolo e ka na. Baakanya kgetsi ya gago ya tshoganyetso.",
      orange: "Merwalela e ka diragala. Tlosa dikoloi le dithoto tsa botlhokwa o di ise kwa lefelong le le kwa godimo.",
      red: "Kotsi e kgolo ya merwalela. Tswa jaanong o ye kwa botshabelong jo bo gaufi.",
    },
    eased: "Kotsi e a fokotsega. Nna o tlhagafetse mme o tila ditsela tse di nang le metsi.",
    checkin: "A o babalesegile? Tsweetswee re itsise.",
  },
  ts: {
    hazard: { flood: "Xitsundzuxo xa ndhambi", rain: "Mpfula leyi tikeke", landslide: "Khombo ra ku khuluka ka misava", wind: "Mimoya ya matimba", road: "Ndlela yi pfariwile" },
    level: {
      green: "A ku na swivilelo swa maxelo endhawini ya wena.",
      yellow: "Mpfula leyi tikeke yi nga ha na. Lunghiselela nkwama wa wena wa xihatla.",
      orange: "Ndhambi yi nga ha humelela. Susa timovha ni swilo swa nkoka u swi yisa endhawini leyi tlakukeke.",
      red: "Khombo lerikulu ra ndhambi. Suka sweswi u ya eka vutumbelo lebyi nga kusuhi.",
    },
    eased: "Khombo ri le ku hunguteni. Tshama u xalamukile u papalata tindlela leti nga ni mati.",
    checkin: "Xana u hlayisekile? Hi kombela u hi tivisa.",
  },
  ve: {
    hazard: { flood: "Tsevhudzo ya maḓi a ḓalaho", rain: "Mvula khulwane", landslide: "Khombo ya u wa ha mavu", wind: "Mimuya ya maanḓa", road: "Bada yo valwa" },
    level: {
      green: "A hu na vhuṱungu ha mutsho kha vhupo haṋu.",
      yellow: "Mvula khulwane i nga na. Lugisani khethe yaṋu ya tshoganetso.",
      orange: "Maḓi a ḓalaho a nga vha hone. Bvisani dzigoloi na zwithu zwa ndeme ni zwi ise fhethu ho dzulaho nṱha.",
      red: "Khombo khulwane ya maḓi. Bvani zwino ni ye fhethu ha tsireledzo hu re tsini.",
    },
    eased: "Khombo i khou fhungudzea. Dzulani no ṱhogomela ni iledze bada dzi re na maḓi.",
    checkin: "Naa no tsireledzea? Ri ḓivhadzeni.",
  },
  nso: {
    hazard: { flood: "Temošo ya mafula", rain: "Pula ye kgolo", landslide: "Kotsi ya go thelela ga mobu", wind: "Diphefo tše maatla", road: "Tsela e tswaletšwe" },
    level: {
      green: "Ga go na matshwenyego a maemo a leratadima lefelong la gago.",
      yellow: "Pula ye kgolo e ka na. Lokišetša mokotla wa gago wa tšhoganetšo.",
      orange: "Mafula a ka direga. Tloša dikoloi le dilo tša bohlokwa o di iše lefelong le le phagamego.",
      red: "Kotsi ye kgolo ya mafula. Tloga bjale o ye setšhabelong sa kgauswi.",
    },
    eased: "Kotsi e a fokotšega. Dula o šetše gomme o phema ditsela tše di nago le meetse.",
    checkin: "Na o bolokegile? Hle re tsebiše.",
  },
  ss: {
    hazard: { flood: "Secwayiso setikhukhula", rain: "Imvula lenamandla", landslide: "Ingoti yekudilika kwemhlaba", wind: "Imimoya lenamandla", road: "Umgwaco uvaliwe" },
    level: {
      green: "Akukho tinkinga telizulu endzaweni yakho.",
      yellow: "Kungaba nemvula lenkhulu. Lungisa sikhwama sakho setimo letiphutfumako.",
      orange: "Tikhukhula tingenteka. Susa timoto netintfo letibalulekile utise endzaweni lephakeme.",
      red: "Ingoti lenkhulu yetikhukhula. Phuma nyalo uye endzaweni yekukhosela leseduze.",
    },
    eased: "Ingoti iyancipha. Hlala uchaphile futsi ugweme imigwaco lenemanti.",
    checkin: "Uphephile yini? Sicela usatise.",
  },
  nr: {
    hazard: { flood: "Isiyeleliso sezikhukhula", rain: "Izulu elinamandla", landslide: "Ingozi yokudilika kwehlabathi", wind: "Imimoya enamandla", road: "Indlela ivaliwe" },
    level: {
      green: "Akunamiraro yesimo sezulu endaweni yakho.",
      yellow: "Kungaba nezulu elikhulu. Lungiselela isikhwama sakho sezehlakalo ezirhabako.",
      orange: "Izikhukhula zingenzeka. Susa iinkoloyi neenthwezakho eziqakathekileko uziyise endaweni ephakemeko.",
      red: "Ingozi ekulu yezikhukhula. Suka nje uye endaweni yokuphephela eseduze.",
    },
    eased: "Ingozi iyehla. Hlala uqaphele begodu ubalekele iindlela ezinamanzi.",
    checkin: "Uphephile na? Sibawa usazise.",
  },
};

export interface AlertText {
  title: string;
  body: string;
}

/** Build an alert in a language. `custom` replaces the standard body (English only, flagged). */
export function alertText(lang: string, hazard: Hazard, level: Level, area: string, opts: { eased?: boolean; custom?: string | null } = {}): AlertText {
  const p = T[(lang as Lang) in T ? (lang as Lang) : "en"];
  const body = opts.custom ? opts.custom : opts.eased ? p.eased : p.level[level];
  return { title: `${p.hazard[hazard]} · ${area}`, body };
}

export function checkinText(lang: string) {
  return T[(lang as Lang) in T ? (lang as Lang) : "en"].checkin;
}

export const isDraftLang = (lang: string) => lang !== "en";
