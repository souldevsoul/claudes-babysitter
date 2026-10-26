// CT1 (5.6.3): product-status negation — copy that says what the product does NOT do yet, in any word order:
// "Email delivery is not enabled on <Brand> yet", "<Brand> sends no email yet", "What we don't do yet", "Full fine-tune
// is not open yet", "We do not currently collect …". A negation and a "for now" word in one clause. And "temporarily
// unavailable" anywhere but the payment / top-up dialog, the pay button and its error.
// Not this rule's: empty states ("No runs yet.", "Nothing here yet"), the reader's own state ("You haven't added a
// dataset yet", "Don't have an account yet?"), a process still running ("Weights aren't ready for this run yet"), a
// transient error ("isn't available yet, try again").
// One lexicon per language (the locales the products ship — docs/checks-content.md); a language without one is not
// read, and lintContent says so (a soft "CT1 does not read <locale>" notice) instead of looking clean.

const B = "(?<![\\p{L}\\p{M}'’])", E = "(?![\\p{L}\\p{M}'’])";
const w = (alts) => new RegExp(`${B}(?:${alts})${E}`, "iu");
const start = (alts) => new RegExp(`^(?:${alts})${E}`, "iu");
const looks = (alts) => new RegExp(`${B}(?:${alts})${E}`, "giu");

/**
 * Per language: neg (a negation or absence), when (yet / for now / currently …), temp (temporarily unavailable),
 * soon (announced, not there: "coming soon"-like words of that language), empty (an empty state at the start of the
 * clause), status (a feature's state: an empty-state-looking clause with one of these is about the product), you (the
 * reader is the subject: their own state), process (a run / payment / upload still in progress), looks (stopwords that
 * tell the language of a text whose locale is unknown).
 */
export const LEXICON = {
  en: {
    neg: w("not|no|isn['’]t|aren['’]t|doesn['’]t|don['’]t|didn['’]t|hasn['’]t|haven['’]t|wasn['’]t|weren['’]t|can['’]t|cannot|won['’]t|nothing|none|neither|nor"),
    when: w("yet|for now|at the moment|for the moment|currently|for the time being|at this time|at present|so far"),
    temp: /\btemporarily (?:unavailable|not available|disabled|offline|switched off)\b/i,
    soon: /\b(?:has|have|is|are) yet to (?:be )?(?:launch(?:ed)?|open(?:ed)?|go live|enabled|connected|configured|switched on|released|available)\b/i,
    empty: start("(?:there (?:is|are) )?(?:currently |still )?(?:no|nothing|none)"),
    status: w("open|opened|available|enabled|configured|connected|live|launched|supported|switched on|turned on|activated|set up|offered|accepted|integrated"),
    you: w("you|you['’](?:ve|re|ll|d)|your|yours|i|i['’](?:ve|m)|my"),
    process: w("charged|billed|taken on|taken up|picked up|claimed|matched|booked|resolved|fixed|answered|closed|replied|retested|merged|covered|cover|covers|enough|sufficient|ready|finished|done|complete|completed|processed|processing|generated|loaded|synced|uploaded|started|arrived|received|verified|confirmed|approved|reviewed|published|trained|evaluated|deployed|created|assigned|scheduled|rated|submitted|signed|paid|settled|indexed|built|downloaded|reachable|scored|calculated|computed|reached|found|saved|sent to you"),
    looks: null,
  },
  ru: {
    neg: w("не|нет|ничего|никак\\p{L}*|ни одн\\p{L}*"),
    when: w("пока|ещё|еще|на данный момент|в настоящее время|сейчас|временно"),
    temp: w("временно (?:недоступн|не работа|отключ|приостановл)\\p{L}*"),
    soon: w("скоро появ\\p{L}*|в ближайшее время появ\\p{L}*"),
    empty: start("(?:у вас |здесь |тут )?(?:пока |ещё |еще )?(?:нет|ничего|ни одного)"),
    status: /доступ|подключ|включ|настро|запущ|откры|работа|принима|поддерж|предлага/iu,
    you: w("вы|вас|вам|ваш\\p{L}*|я|мой|моя|моё|мои"),
    process: /готов|заверш|обработ|загруж|получ|подтвержд|оплач|провер|созда|начат|отправлен вам/iu,
    looks: /[а-яё]/i,
  },
  uk: {
    neg: w("не|немає|нема|нічого|жодн\\p{L}*"),
    when: w("поки|поки що|ще|наразі|зараз|тимчасово"),
    temp: w("тимчасово (?:недоступн|не працю|вимкнен|призупинен)\\p{L}*"),
    soon: w("незабаром з'явит\\p{L}*|незабаром"),
    empty: start("(?:у вас |тут )?(?:поки що |поки |ще )?(?:немає|нема|нічого|жодного)"),
    status: /доступн|підключ|увімкн|налаштов|запущ|відкрит|працю|прийма|підтрим|пропону/iu,
    you: w("ви|вас|вам|ваш\\p{L}*|я|мій|моя|моє|мої"),
    process: /готов|заверш|оброб|завантаж|отрим|підтвердж|оплач|перевір|створ|розпоч/iu,
    looks: /[іїєґ]/i,
  },
  bg: {
    neg: w("не|няма|нищо|никакв\\p{L}*"),
    when: w("все още|още|засега|в момента|понастоящем|временно"),
    temp: w("временно (?:недостъп|не работи|изключ|спрян)\\p{L}*"),
    soon: w("очаквайте скоро|скоро ще бъде достъп\\p{L}*"),
    empty: start("(?:все още |още |засега )?(?:няма|нищо)"),
    status: /достъп|включ|активир|настро|свърз|отвор|стартир|поддърж|предлаг/iu,
    you: w("вие|вас|ви|ваш\\p{L}*|ти|твоят|твоя|аз|моят|моя"),
    process: /готов|завърш|обработ|зареден|получен|потвърд|платен|провер|създаден/iu,
    looks: /(?<![\p{L}])(?:още|засега|няма|които|това|са|във)(?![\p{L}])|ъ/iu,
  },
  kk: {
    neg: w("жоқ|емес|қосылмаған|іске қосылмаған|қолжетімсіз|жұмыс істемейді|мүмкін емес"),
    when: w("әлі|әзірге|қазір|қазіргі уақытта|уақытша"),
    temp: w("уақытша (?:қолжетімсіз|қолжетімді емес|жұмыс істемейді|тоқтатылған)"),
    soon: w("жақында (?:қолжетімді|іске қосылады|ашылады)"),
    empty: /^(?:әлі |әзірге |мұнда )?(?:\p{L}+ ){0,2}(?:жоқ|ештеңе жоқ)[.!]?$/iu,
    status: /қолжетім|қосыл|іске қос|ашық|баптал|қабылдан/iu,
    you: w("сіз|сізде|сіздің|сен|сенің|мен|менің"),
    process: /дайын|аяқтал|өңдел|жүктел|алынд|расталд|төленд|тексерілд/iu,
    looks: /[әғқңөұүһі]/i,
  },
  ky: {
    neg: w("жок|эмес|иштебейт|болбойт|жеткиликсиз|кошула элек|кошулган жок"),
    when: w("азырынча|али|азыр|убактылуу"),
    temp: w("убактылуу (?:жеткиликсиз|иштебейт|жеткиликтүү эмес|токтотулган)"),
    soon: w("жакында (?:жеткиликтүү|ачылат|иштей баштайт)"),
    empty: /^(?:азырынча |али |бул жерде )?(?:\p{L}+ ){0,2}(?:жок|эч нерсе жок)[.!]?$/iu,
    status: /жеткиликтүү|кошул|иштет|ачык|жөндөл|кабыл/iu,
    you: w("сиз|сизде|сиздин|сен|сенин|мен|менин"),
    process: /даяр|аякта|иштетил|жүктөл|алын|тастыкта|төлөн|текшерил/iu,
    looks: /[өүң]/i,
  },
  az: {
    neg: w("deyil|yoxdur|yox|işləmir|olmur|\\p{L}+(?:ma|mə)y[ıi]b|\\p{L}+(?:mır|mir|mur|mür)|heç nə|heç bir"),
    when: w("hələ|hələlik|hazırda|hal-hazırda|müvəqqəti|indilik"),
    temp: w("müvəqqəti (?:əlçatan deyil|əlçatmazdır|işləmir|mövcud deyil|dayandırılıb)"),
    soon: w("tezliklə (?:əlçatan|aktiv|istifadəyə veriləcək)"),
    empty: /^(?:hələ(?:lik)? |burada )?(?:heç bir )?(?:\p{L}+ ){0,2}(?:yoxdur|yox)[.!]?$/iu,
    status: /əlçatan|mövcud|aktiv|qoşul|açıq|işə sal|konfiqur|qəbul/iu,
    you: w("siz|sizin|sizdə|sən|sənin|mən|mənim"),
    process: /hazır|tamamlan|emal|yüklən|alın|təsdiqlən|ödən|yoxlan/iu,
    looks: /[əğışçöü]/i,
  },
  fr: {
    neg: w("pas|aucun|aucune|rien|ni|non"),
    when: w("encore|pour le moment|pour l['’]instant|actuellement|pour l['’]heure|à ce jour|pour le moment encore|temporairement"),
    temp: /\btemporairement (?:indisponible|hors service|désactivée?|suspendue?)s?\b/i,
    soon: /\bbientôt disponible\b|\bdisponible prochainement\b|\bprochainement\b/i,
    empty: /^(?:il n['’]y a )?(?:encore |toujours )?(?:aucun|aucune|rien|pas encore de|pas encore d['’]|pas de|pas d['’])/iu,
    status: /disponible|activ|configur|connect|ouvert|lanc|propos|accept|pris en charge|branch/i,
    you: w("vous|votre|vos|tu|ton|ta|tes|je|j['’]|mon|ma|mes"),
    process: /\b(?:prête?s?|terminée?s?|traitée?s?|reçue?s?|confirmée?s?|validée?s?|vérifiée?s?|payée?s?|générée?s?|chargée?s?|envoyée?s? à vous)\b/i,
    looks: looks("le|la|les|des|une|est|vous|votre|nous|pour|avec|pas|n['’]|d['’]|l['’]"),
  },
  de: {
    neg: w("nicht|kein|keine|keinen|keinem|keiner|nichts|nie"),
    when: w("noch|derzeit|momentan|aktuell|zurzeit|vorerst|im moment|gerade|bislang|bisher|vorübergehend"),
    temp: /\bvorübergehend (?:nicht verfügbar|nicht erreichbar|deaktiviert|ausgesetzt|abgeschaltet)\b/i,
    soon: /\bdemnächst\b|\bin kürze verfügbar\b|\bbald verfügbar\b/i,
    empty: start("(?:es gibt )?(?:noch |bisher |derzeit )?(?:kein|keine|keinen|nichts)"),
    status: /verfügbar|aktiviert|eingerichtet|verbunden|freigeschaltet|geöffnet|\boffen\b|\blive\b|gestartet|unterstützt|angeboten|konfiguriert|angebunden|eingeschaltet/i,
    you: new RegExp(`${B}(?:Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|du|dein\\p{L}*|ich|mein\\p{L}*)${E}`, "u"),
    process: /\b(?:bereit|fertig|abgeschlossen|verarbeitet|geladen|hochgeladen|eingegangen|bestätigt|bezahlt|geprüft|erstellt|berechnet)\b/i,
    looks: looks("der|die|das|und|ist|nicht|noch|mit|für|wir|sie|ein|eine|auf|zu"),
  },
  es: {
    neg: w("no|ningún|ninguna|ninguno|nada|sin|tampoco"),
    when: w("todavía|aún|aun|por ahora|de momento|por el momento|actualmente|en este momento|temporalmente"),
    temp: /\btemporalmente (?:no disponible|fuera de servicio|desactivad[oa]|inhabilitad[oa]|suspendid[oa])s?\b/i,
    soon: /\bpróximamente\b|\bmuy pronto disponible\b/i,
    empty: start("(?:todavía |aún |aun )?(?:no hay|ningún|ninguna|ninguno|nada|sin)"),
    status: /disponible|activad|habilitad|configurad|conectad|abiert|lanzad|admit|acept|ofrec|compatible/i,
    you: w("tú|tu|tus|usted|ustedes|su cuenta|tienes|has|yo|mi|mis"),
    process: /\b(?:list[oa]s?|terminad[oa]s?|completad[oa]s?|procesad[oa]s?|cargad[oa]s?|subid[oa]s?|recibid[oa]s?|confirmad[oa]s?|pagad[oa]s?|verificad[oa]s?|generad[oa]s?)\b/i,
    looks: looks("el|los|las|y|es|usted|para|con|una|que|del|al|son|todavía|aún|está"),
  },
  pt: {
    neg: w("não|nenhum|nenhuma|nada|sem|nem"),
    when: w("ainda|por enquanto|no momento|de momento|atualmente|neste momento|por agora|temporariamente"),
    temp: /\btemporariamente (?:indisponível|indisponíveis|fora do ar|desativad[oa]s?|suspens[oa]s?)\b/i,
    soon: /\bem breve\b|\bbrevemente disponível\b/i,
    empty: start("(?:ainda )?(?:não há|não existem|nenhum|nenhuma|nada|sem)"),
    status: /disponível|ativad|habilitad|configurad|conectad|abert|lançad|aceit|ofereci|suportad|compatível/i,
    you: w("você|vocês|seu|sua|seus|suas|tu|teu|tua|eu|meu|minha"),
    process: /\b(?:pront[oa]s?|concluíd[oa]s?|processad[oa]s?|carregad[oa]s?|enviad[oa]s?|recebid[oa]s?|confirmad[oa]s?|pag[oa]s?|verificad[oa]s?|gerad[oa]s?)\b/i,
    looks: looks("o|os|as|e|é|você|para|com|uma|que|do|da|não|são|ainda|está"),
  },
  it: {
    neg: w("non|nessun|nessuna|nessuno|niente|nulla|né"),
    when: w("ancora|per ora|al momento|attualmente|per il momento|momentaneamente|temporaneamente"),
    temp: /\btemporaneamente (?:non disponibil[ei]|non attiv[oaie]|sospes[oaie]|disattivat[oaie])\b/i,
    soon: /\bprossimamente\b|\bin arrivo\b|\bdisponibile a breve\b/i,
    empty: start("(?:ancora )?(?:nessun|nessuna|nessuno|niente|nulla|non ci sono|non c['’]è)"),
    status: /disponibil|attivat|abilitat|configurat|collegat|conness|apert|lanciat|supportat|accettat|offert/i,
    you: w("tu|tuo|tua|tuoi|tue|lei|suo account|hai|io|mio|mia"),
    process: /\b(?:pront[oaie]|completat[oaie]|terminat[oaie]|elaborat[oaie]|caricat[oaie]|ricevut[oaie]|confermat[oaie]|pagat[oaie]|verificat[oaie]|generat[oaie])\b/i,
    looks: looks("il|lo|la|gli|le|e|è|per|con|una|che|del|della|non|sono|ancora"),
  },
  sk: {
    neg: w("nie|žiadn\\p{L}*|nič|ne\\p{L}{3,}"),
    when: w("ešte|zatiaľ|momentálne|aktuálne|dočasne|v súčasnosti|teraz"),
    temp: w("dočasne (?:nedostupn|nefunk|vypnut|mimo prevádzky|pozastaven)\\p{L}*"),
    soon: w("čoskoro dostupn\\p{L}*|už čoskoro"),
    empty: start("(?:zatiaľ |ešte )?(?:tu )?(?:žiadn\\p{L}*|nič|nie sú|nie je tu)"),
    status: /dostupn|aktivovan|zapnut|nastaven|pripojen|otvoren|spusten|podporovan|ponúk/iu,
    you: w("vy|vás|vám|váš\\p{L}*|ty|tvoj\\p{L}*|nemáte|máte|ja|môj|moja"),
    process: /pripraven|dokončen|spracovan|nahrat|prijat|potvrden|zaplaten|overen|vytvoren/iu,
    looks: /[ľĺŕôäťďň]|(?<![\p{L}])(?:je|nie|sú|ešte|zatiaľ|alebo|ktor\p{L}*|môžete)(?![\p{L}])/giu,
  },
  sl: {
    neg: w("ne|ni|niso|nobene\\p{L}*|nobenih|nobenega|nič|brez|nimamo"),
    when: w("še|zaenkrat|trenutno|začasno|za zdaj|ta hip"),
    temp: w("začasno (?:ni na voljo|nedosegljiv\\p{L}*|onemogočen\\p{L}*|ne deluje)"),
    soon: w("kmalu na voljo"),
    empty: start("(?:še |zaenkrat |tu )?(?:ni|nobene\\p{L}*|nobenih|nič|brez)"),
    status: /na voljo|omogočen|vklopljen|nastavljen|povezan|odprt|zagnan|podprt|ponuj/iu,
    you: w("vi|vas|vam|vaš\\p{L}*|ti|tvoj\\p{L}*|nimate|imate|jaz|moj\\p{L}*"),
    process: /pripravljen|končan|obdelan|naložen|prejet|potrjen|plačan|preverjen|ustvarjen/iu,
    looks: /(?<![\p{L}])(?:je|ni|še|zaenkrat|ali|ki|tudi|lahko|niso)(?![\p{L}])/giu,
  },
  el: {
    neg: w("δεν|όχι|κανένα|κανένας|καμία|τίποτα|μη"),
    when: w("ακόμα|ακόμη|προς το παρόν|αυτή τη στιγμή|προσωρινά|επί του παρόντος|τώρα"),
    temp: w("προσωρινά (?:μη διαθέσιμ\\p{L}*|εκτός λειτουργίας|απενεργοποιημέν\\p{L}*)"),
    soon: w("έρχεται σύντομα|σύντομα διαθέσιμ\\p{L}*"),
    empty: start("(?:δεν υπάρχ\\p{L}+|κανένα|κανένας|καμία|τίποτα)"),
    status: /διαθέσιμ|ενεργοποιη|ρυθμισ|συνδε|ανοιχτ|ξεκιν|υποστηρίζ|προσφέρ/iu,
    you: w("εσύ|εσείς|σας|σου|έχετε|έχεις|εγώ|μου"),
    process: /έτοιμ|ολοκληρ|επεξεργ|ληφθ|επιβεβαι|πληρώθ|ελέγχθ|δημιουργ/iu,
    looks: /[α-ωάέήίόύώ]/i,
  },
  ar: {
    neg: w("لا|لم|لن|ليس|ليست|غير|لا يوجد|لا توجد"),
    when: w("بعد|حاليًا|حاليا|في الوقت الحالي|مؤقتًا|مؤقتا|حتى الآن|الآن"),
    temp: /غير متاح(?:ة)? مؤقت(?:ًا|ا)|متوقف(?:ة)? مؤقت(?:ًا|ا)|معطل(?:ة)? مؤقت(?:ًا|ا)/u,
    soon: /قريبًا|قريبا|سيتوفر قريب/u,
    empty: start("(?:لا (?:يوجد|توجد)|ليس (?:هناك|لديك)|لا شيء)"),
    status: /متاح|مفعل|مفعّل|متصل|مفتوح|مُعد|معد|مدعوم|مقبول/u,
    you: w("أنت|أنتم|لديك|لديكم|حسابك|لم تقم|أنا|لدي"),
    process: /جاهز|اكتمل|مكتمل|معالج|تحميل|استلام|تأكيد|مدفوع|التحقق/u,
    looks: /[؀-ۿ]/u,
  },
  ja: {
    neg: /ません|ていない|でない|できない|未対応|未設定|未接続|未公開|ありません/u,
    when: /まだ|現在|現時点|今のところ|一時的|しばらく/u,
    temp: /一時的に(?:ご)?利用(?:でき|いただけ)ません|一時的に停止|一時的に無効/u,
    soon: /近日公開|近日対応|準備中/u,
    empty: /^(?:まだ)?[^、。]{1,15}(?:は|が)?(?:ありません|ないです)$/u,
    status: /利用|有効|設定|接続|公開|対応|開始|受付/u,
    you: /あなた|お客様の(?:アカウント)?/u,
    process: /準備ができ|完了|処理|読み込|受信|確認|支払/u,
    looks: /[぀-ヿ]/u,
  },
};
LEXICON.kk.temp = w("уақытша (?:қолжетімсіз|қолжетімді емес|жұмыс істемейді|тоқтатылған)");

/** the locales CT1 reads (base codes) */
export const CT1_LOCALES = Object.keys(LEXICON);
const base = (l) => String(l || "").toLowerCase().split(/[-_]/)[0];
export const readsLocale = (locale) => !locale || Object.prototype.hasOwnProperty.call(LEXICON, base(locale));

// which lexicons read a text of unknown locale: English always; another language when its own letters or 2+ of its
// stopwords are there (so "no … aún" never comes from an English sentence)
function lexiconsFor(text, locale) {
  const b = base(locale);
  if (b && LEXICON[b]) return [b];
  if (b) return [];
  const out = ["en"];
  for (const [code, lx] of Object.entries(LEXICON)) {
    if (code === "en" || !lx.looks) continue;
    if (lx.looks.global) { lx.looks.lastIndex = 0; if ((text.match(lx.looks) || []).length >= 2) out.push(code); }
    else if (lx.looks.test(text)) out.push(code);
  }
  return out;
}

// a clause: between sentence ends, commas, semicolons, colons, dashes, brackets and the "·" of a label list
const CLAUSE = /[.!?;:,()\[\]·•|\n。、！？；：،؛]+|\s[—–-]\s|—|–/u;
// "yet" that means "but": at the start of a clause, after and / but / nor / or, before another / again / more / still
const conjunctionYet = /(?:^|\b(?:and|but|nor|or)\s+)yet\b|\byet\s+(?:another|again|more|still|so)\b/i;

/**
 * The not-yet / status-negation finding of one text, or null: { match, index, kind: "not-yet" | "temporarily" | "soon" }.
 * opts.payUi: the text is in the payment / top-up dialog, the pay button or its error (where "temporarily
 * unavailable" is the honest stub); opts.locale: the text's language (unknown → English + any language it reads as).
 */
export function notYet(text, { locale = null, payUi = false } = {}) {
  const t = String(text || "").replace(/\{x\}/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const code of lexiconsFor(t, locale)) {
    const lx = LEXICON[code];
    const tm = !payUi && t.match(lx.temp);
    if (tm) return { match: tm[0], index: tm.index, kind: "temporarily", locale: code };
    const sm = t.match(lx.soon);
    if (sm) return { match: sm[0], index: sm.index, kind: "soon", locale: code };
    // a transient error: "isn't available yet, try again in a minute"
    if (/\b(?:try again|retry|refresh|reload|in a (?:moment|minute|few))\b|yenidən (?:cəhd|yoxla)|қайталап көріңіз|попробуйте (?:ещё|еще|снова|позже)|réessayez|versuchen sie es (?:später )?erneut|inténtalo de nuevo|tente novamente|riprova|再試行|もう一度/i.test(t)) continue;
    let pos = 0;
    for (const raw of t.split(CLAUSE)) {
      const at = t.indexOf(raw, pos); pos = at >= 0 ? at + raw.length : pos;
      const c = raw.trim();
      if (!c || /^not yet$/i.test(c)) continue;
      const nm = c.match(lx.neg), wm = c.match(lx.when);
      if (!nm || !wm) continue;
      if (code === "en" && /^yet$/i.test(wm[0]) && conjunctionYet.test(c) && !/\byet\s*$/i.test(c)) continue;
      // the reader's own state, or a question to the reader ("Don't have an account yet?")
      const youAt = c.search(lx.you);
      if (youAt >= 0 && youAt <= nm.index) continue;
      const sentenceEnd = t.slice(Math.max(0, at) + raw.length).match(/^[^.!?。！？]*([.!?。！？])/);
      if (sentenceEnd && /[?？]/.test(sentenceEnd[1])) continue;
      // an empty state: "No runs yet.", "Nothing here yet", "Noch keine Läufe", "Пока нет запусков"
      if (lx.empty.test(c) && !lx.status.test(c)) continue;
      // a process still running: "Weights aren't ready for this run yet"
      if (lx.process.test(c.slice(nm.index))) continue;
      // the words that say it: the whole clause when short, else from the negation to the "yet" word
      const a = Math.min(nm.index, wm.index), z = Math.max(nm.index + nm[0].length, wm.index + wm[0].length);
      const match = c.length <= 50 ? c : c.slice(a, z).length <= 70 ? c.slice(a, z) : c.slice(a, a + 69) + "…";
      return { match, index: Math.max(0, at) + (c.length <= 50 ? 0 : a), kind: "not-yet", locale: code };
    }
  }
  return null;
}

/* where "temporarily unavailable" is the payment stub's own place: the top-up / checkout dialog, the pay button, its error */
const PAY = /(top-?up|checkout|payment|pay(?!load)|purchase|deposit|billing|buy|wallet|credits?)/i;
const UI = /(dialog|modal|sheet|drawer|popup|popover|button|btn|form|widget|panel|error|toast|alert)/i;
/** a component file of the payment UI (components/topup-modal.tsx, CheckoutDialog.tsx, pay-button.tsx) — not a page */
export const payUiFile = (file) => { const b = String(file || "").split("/").pop() || ""; return PAY.test(b) && UI.test(b) && !/^(page|layout)\.[jt]sx?$/.test(b); };
/** a message key of the payment UI (topup.dialog.unavailable, checkout.errors.down, billing.payButton) */
export const payUiKey = (key) => { const k = String(key || ""); return PAY.test(k) && UI.test(k) && !/(^|\.)(legal|terms|privacy|policy|faq|about|pricing|cookies|security|aml)(\.|$)/i.test(k); };
