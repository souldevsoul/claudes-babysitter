// Plain-language explanations for Babysitter Studio: what is wrong, why it matters, how to fix it — in the
// words of the person reviewing the page, not of the checker. Each finding gets { title, why, fix, element }
// in English and Russian, plus a group key so the same issue on twelve pages is one item, not forty-eight.

const num = (s, re) => { const m = String(s).match(re); return m ? m[1] : null; };

const KIND = {
  en: { button: "button", link: "link", field: "text field", dropdown: "dropdown", checkbox: "checkbox", radio: "radio button", heading: "heading", image: "image", table: "table", label: "label", text: "text", block: "block" },
  ru: { button: "кнопка", link: "ссылка", field: "поле ввода", dropdown: "выпадающий список", checkbox: "чекбокс", radio: "переключатель", heading: "заголовок", image: "изображение", table: "таблица", label: "подпись", text: "текст", block: "блок" },
};
const AREA = {
  en: { header: "in the site header", footer: "in the footer", nav: "in the navigation", aside: "in the sidebar", dialog: "in a dialog", form: "in the form" },
  ru: { header: "в шапке сайта", footer: "в футере", nav: "в навигации", aside: "в боковой панели", dialog: "в диалоге", form: "в форме" },
};

/** "the «€ EUR» dropdown in the site header" from { kind, name, place }; parts: { head, place } for grouping. */
export function elementParts(h, lang = "en") {
  if (!h) return null;
  const kind = KIND[lang][h.kind] || h.kind;
  const head = `${kind[0].toUpperCase()}${kind.slice(1)} ${h.name ? `«${h.name}»` : ""}`.trim();
  const place = !h.place ? "" : h.place.area === "section" ? (lang === "ru" ? `в блоке «${h.place.title}»` : `in the “${h.place.title}” section`) : h.place.area === "form" && h.place.title ? (lang === "ru" ? `в форме «${h.place.title}»` : `in the “${h.place.title}” form`) : AREA[lang][h.place.area] || "";
  return { head, place };
}
export function elementLabel(h, lang = "en") {
  if (!h) return null;
  const kind = KIND[lang][h.kind] || h.kind;
  const name = h.name ? `«${h.name}»` : "";
  const place = !h.place ? "" : h.place.area === "section" ? (lang === "ru" ? `в блоке «${h.place.title}»` : `in the “${h.place.title}” section`) : h.place.area === "form" && h.place.title ? (lang === "ru" ? `в форме «${h.place.title}»` : `in the “${h.place.title}” form`) : AREA[lang][h.place.area] || "";
  const head = lang === "ru" ? `${kind[0].toUpperCase()}${kind.slice(1)} ${name}`.trim() : `${kind[0].toUpperCase()}${kind.slice(1)} ${name}`.trim();
  return [head, place].filter(Boolean).join(" ");
}

/** Rendered checks (micro-check / Playwright) — keyed by the check name, the details parsed from `what`. */
const RENDERED = [
  {
    test: (p) => /control boundary/.test(p.check),
    say: (p) => {
      const border = num(p.what, /border ([\d.]+):1/), fill = num(p.what, /fill ([\d.]+):1/);
      const edge = (p.what.match(/lightest passing edge (#[0-9a-f]{6})/i) || [])[1];
      return {
        en: { title: "The control's edge is barely visible", why: `A field, dropdown or toggle must stand out from the page by at least 3:1 (WCAG 1.4.11), or people cannot see where to click. Here the border is ${border ?? "—"}:1 and the fill ${fill ?? "—"}:1.`, fix: edge ? `Darken the edge only as far as needed: ${edge} already reaches 3:1 here; a much darker one passes too but reads harsh. Put it in the theme's input border token (border-input), used by the kit component, so every field changes at once.` : "Give it the theme's input border (border-input) or a visible fill — in the kit component, so every copy changes." },
        ru: { title: "Границы элемента управления почти не видно", why: `Поле, список или переключатель должны отличаться от фона хотя бы на 3:1 (WCAG 1.4.11), иначе непонятно, куда нажимать. Здесь рамка ${border ?? "—"}:1, заливка ${fill ?? "—"}:1.`, fix: edge ? `Затемнить рамку ровно настолько, насколько нужно: ${edge} здесь уже даёт 3:1; заметно более тёмная тоже пройдёт, но режет глаз. Записать её в токен рамки полей темы (border-input), которым пользуется компонент кита, — поменяются все поля сразу.` : "Задать рамку токеном темы (border-input) или видимую заливку — в компоненте кита, чтобы поменялись все копии." },
      };
    },
  },
  {
    test: (p) => /native control/.test(p.check),
    say: (p) => {
      const what = (p.what.match(/native <([^>]+)>/) || [])[1] || "control";
      return {
        en: { title: "A browser-default control instead of the kit's", why: `This <${what}> is drawn by the browser: it ignores the theme (colours, radius, dark mode) and looks different on every system — next to the kit's own controls it reads as a different product.`, fix: "Use the kit component (Checkbox, Select, Switch… from components/ui). If the kit has none, add one there first (Radix or Base UI, styled with the theme tokens: the field edge, radius, focus ring) and switch every such control to it." },
        ru: { title: "Стандартный контрол браузера вместо компонента кита", why: `Этот <${what}> рисует браузер: он не следует теме (цвета, скругления, тёмный режим) и в каждой системе выглядит по-своему — рядом с компонентами кита он смотрится как часть другого продукта.`, fix: "Использовать компонент кита (Checkbox, Select, Switch… из components/ui). Если в ките такого нет — сначала добавить его туда (Radix или Base UI, на токенах темы: рамка полей, скругление, фокус) и перевести на него все такие контролы." },
      };
    },
  },
  {
    test: (p) => /contrast/.test(p.check),
    say: (p) => {
      const ratio = num(p.what, /contrast ([\d.]+):1/), op = num(p.what, /opacity ([\d.]+) on text/), px = num(p.what, /(?:^|, )([\d.]+)px(?!\s*file)/), weight = num(p.what, /weight (\d+)/);
      if (/cannot be measured/.test(p.what)) return {
        en: { title: "Text over an image or gradient — check by eye", why: "Its contrast cannot be measured from colours alone; it may be fine or unreadable depending on what is under it.", fix: "If it is hard to read, put it on a solid surface or add a scrim behind it." },
        ru: { title: "Текст поверх картинки или градиента — проверьте глазами", why: "Контраст нельзя измерить по цветам: он зависит от того, что под текстом.", fix: "Если читается плохо — подложить сплошную подложку или затемнение." },
      };
      const why = { en: [], ru: [] };
      if (ratio) { why.en.push(`it is ${ratio}:1 against its background, and text needs 4.5:1 (3:1 when large) to be readable for people with low vision or on a bright screen`); why.ru.push(`контраст с фоном ${ratio}:1, а тексту нужно 4.5:1 (3:1 для крупного), чтобы его читали люди со слабым зрением и на ярком экране`); }
      if (op) { why.en.push(`it is drawn at ${Math.round(op * 100)}% opacity, which fades it into the background`); why.ru.push(`он нарисован с прозрачностью ${Math.round(op * 100)}% и сливается с фоном`); }
      if (px) { why.en.push(`it is ${px}px — below the 12px minimum`); why.ru.push(`размер ${px}px — меньше минимума 12px`); }
      if (weight) { why.en.push(`the weight ${weight} is too thin at this size`); why.ru.push(`начертание ${weight} слишком тонкое для такого размера`); }
      return {
        en: { title: "Text is hard to read", why: `Because ${why.en.join("; ") || p.what}.`, fix: "Use the theme's text tokens (foreground, muted-foreground) instead of a faint colour or transparency; fix the token if the theme's own colour is too faint." },
        ru: { title: "Текст трудно читать", why: `Потому что ${why.ru.join("; ") || p.what}.`, fix: "Взять текстовые токены темы (foreground, muted-foreground) вместо бледного цвета или прозрачности; если бледный сам токен — поправить его в теме." },
      };
    },
  },
  {
    // code-only: the page looks the same whether the value sits in style= or in a class — not a visible defect
    visual: false,
    test: (p) => /inline style/.test(p.check),
    say: (p) => {
      const props = (p.props || []).join(", ") || (p.what.match(/inline (.+)$/) || [])[1] || "";
      return {
        en: { title: "Style hard-coded on the element", why: `It sets ${props} directly in style=, bypassing the theme: the value will not follow a re-brand or dark mode, and the same look gets written differently in different places.`, fix: "Move it into classes on theme tokens; style= may only pass CSS variables (style={{ \"--x\": value }})." },
        ru: { title: "Стиль прописан прямо в элементе", why: `Свойства ${props} заданы в style= в обход темы: они не изменятся при ребрендинге или в тёмной теме, а один и тот же вид оказывается записан по-разному в разных местах.`, fix: "Перенести в классы на токенах темы; через style= можно передавать только CSS-переменные (style={{ \"--x\": значение }})." },
      };
    },
  },
  {
    test: (p) => /row alignment/.test(p.check),
    say: (p) => {
      const kindEn = /offer cards/.test(p.what) ? "Cards in one row have different heights" : /styled differently/.test(p.what) ? "Cards in one row look different" : /CTAs/.test(p.what) ? "Buttons in one row sit at different heights" : /prices/.test(p.what) ? "Prices in one row sit at different heights" : /column/.test(p.what) ? "A column shifts from row to row" : "Items in one row are misaligned";
      const kindRu = /offer cards/.test(p.what) ? "Карточки в одном ряду разной высоты" : /styled differently/.test(p.what) ? "Карточки в одном ряду оформлены по-разному" : /CTAs/.test(p.what) ? "Кнопки в одном ряду на разной высоте" : /prices/.test(p.what) ? "Цены в одном ряду на разной высоте" : /column/.test(p.what) ? "Колонка сдвигается от строки к строке" : "Элементы одного ряда не выровнены";
      const d = num(p.what, /Δ(\d+)px/);
      return {
        en: { title: kindEn, why: `A row is read as one set of equal options; ${d ? `a ${d}px step` : "uneven edges"} make one of them look different or broken.`, fix: "Stretch the cards to the row height (h-full + flex column) and push the button/price to the bottom (mt-auto); draw every card with the same component." },
        ru: { title: kindRu, why: `Ряд воспринимается как набор равных вариантов; ${d ? `ступенька в ${d}px` : "неровный край"} делает один из них «другим» или сломанным.`, fix: "Растянуть карточки на высоту ряда (h-full + flex-col), кнопку/цену прижать вниз (mt-auto); все карточки — одним компонентом." },
      };
    },
  },
  {
    test: (p) => /horizontal overflow/.test(p.check),
    say: (p) => ({
      en: { title: "The page scrolls sideways on a phone", why: `Something is wider than the 390px screen (${p.what.replace(/\s*\[[^\]]*\]\s*$/, "")}), so the whole page wobbles left and right.`, fix: "Let it wrap or shrink (min-w-0, flex-wrap, max-w-full); never fixed widths wider than the screen." },
      ru: { title: "Страница на телефоне прокручивается вбок", why: `Что-то шире экрана в 390px (${p.what.replace(/\s*\[[^\]]*\]\s*$/, "")}), и вся страница ездит влево-вправо.`, fix: "Дать элементу переноситься или сжиматься (min-w-0, flex-wrap, max-w-full); без фиксированных ширин больше экрана." },
    }),
  },
  {
    test: (p) => /overlay motion/.test(p.check),
    say: (p) => {
      const closing = /closes without motion/.test(p.what);
      return {
        en: closing
          ? { title: "It closes in one frame — no exit animation", why: "The list (menu, popover, dialog) vanishes instantly when you pick, press Escape or click away. Next to controls that glide, it reads as a glitch; the eye loses where it went.", fix: "Give it an exit that mirrors the enter (fade + a small zoom/slide, 120–200 ms). If it is mounted with {open && …} it can never animate out: use the kit's DropdownMenu / Popover / Select. A kit part with exit classes that still blinks out means the library version cannot play them (Radix Select before 2.3 unmounts at once) — update it." }
          : { title: "It opens in one frame — no enter animation", why: "The list (menu, popover, dialog) pops in without any motion. Everything else on the site moves softly, so this one feels broken and cheap.", fix: "Use the kit's DropdownMenu / Popover / Select — they open and close with fade + zoom (150 ms, none under reduced motion) — or give it data-[state=open]:animate-in fade-in-0 zoom-in-95 plus the matching exit." },
        ru: closing
          ? { title: "Закрывается за один кадр — без анимации", why: "Список (меню, всплывающее окно, диалог) исчезает мгновенно — при выборе, Escape или клике мимо. Рядом с плавными элементами это выглядит как сбой: глаз теряет, куда он делся.", fix: "Дать закрытию анимацию, зеркальную открытию (прозрачность + лёгкое уменьшение/сдвиг, 120–200 мс). Если он монтируется через {open && …}, уйти с анимацией он не сможет: использовать DropdownMenu / Popover / Select из кита. Если у компонента кита классы закрытия есть, а он всё равно пропадает мгновенно — версия библиотеки их не проигрывает (Radix Select до 2.3 удаляет список сразу): обновить." }
          : { title: "Открывается за один кадр — без анимации", why: "Список (меню, всплывающее окно, диалог) появляется рывком. Всё остальное на сайте движется мягко, а этот кажется сломанным и дешёвым.", fix: "Использовать DropdownMenu / Popover / Select из кита — они открываются и закрываются с прозрачностью и масштабом (150 мс, без анимации при «уменьшить движение»), — или добавить data-[state=open]:animate-in fade-in-0 zoom-in-95 и такое же закрытие." },
      };
    },
  },
  {
    test: (p) => /mobile table/.test(p.check),
    say: () => ({
      en: { title: "The table does not fit a phone", why: "Columns are cut off or hidden behind a sideways scroll, so people miss data without noticing.", fix: "Below 640px show each row as a stacked card (the kit Table's stacked layout)." },
      ru: { title: "Таблица не помещается на телефоне", why: "Колонки обрезаны или спрятаны за горизонтальной прокруткой — данные легко не заметить.", fix: "На ширине меньше 640px показывать каждую строку карточкой (stacked-вариант Table в ките)." },
    }),
  },
  {
    // a change the reviewer asked for in words (no finding behind it): its own title, where it is, and why
    test: (p) => p.check === "requested change",
    say: (p) => ({
      en: { title: p.what, why: p.why || "A change you asked for. Try it live to judge what a snapshot cannot show (motion, hover, an open menu).", fix: "" },
      ru: { title: p.what, why: p.whyRu || p.why || "Изменение по вашей просьбе. «Попробовать вживую» — чтобы оценить то, чего не видно на снимке (анимации, наведение, открытый список).", fix: "" },
    }),
  },
  {
    test: (p) => p.check === "load",
    say: (p) => ({ en: { title: "The page did not load", why: p.what, fix: "Open it in the dev server and fix the error first." }, ru: { title: "Страница не загрузилась", why: p.what, fix: "Открыть её на dev-сервере и сначала исправить ошибку." } }),
  },
];

/** Static findings (ESLint / Stylelint, file:line) — short titles; the rule's own message is the why. */
const STATIC_TITLES = {
  "ui/no-raw-palette": ["A raw palette colour instead of a theme token", "Цвет из палитры Tailwind вместо токена темы"],
  "ui/no-inline-style": ["Style hard-coded in style=", "Стиль прописан в style="],
  "ui/no-visual-classname-override": ["A kit component restyled at the call site", "Компонент кита перекрашен на месте"],
  "ui/no-transition-all": ["transition-all animates layout too", "transition-all анимирует и раскладку"],
  "ui/no-native-controls": ["A browser-default control instead of the kit's", "Стандартный контрол браузера вместо компонента кита"],
  "ui/no-adhoc-button": ["A link styled as a button by hand", "Ссылка, вручную оформленная как кнопка"],
  "ui/no-arbitrary-values": ["A hard-coded value instead of a token", "Жёстко заданное значение вместо токена"],
  "ui/no-arbitrary-spacing": ["A hard-coded spacing value", "Жёстко заданный отступ"],
  "ui/no-dynamic-classes": ["A class built at runtime (Tailwind cannot see it)", "Класс собирается на лету (Tailwind его не увидит)"],
  "ui/no-illegible-text": ["Text too small or too thin to read", "Текст слишком мелкий или тонкий"],
  "ui/require-layer": ["CSS outside the cascade layers", "CSS вне слоёв каскада"],
  "theme/contrast": ["A theme colour pair fails contrast", "Пара цветов темы не проходит по контрасту"],
};

/** Adds { explain: { en, ru }, group } to a problem (idempotent). */
export function explain(p) {
  if (p.explain) return p;
  const r = RENDERED.find((x) => x.test(p));
  let ex;
  if (r) ex = r.say(p);
  else if (p.rule && STATIC_TITLES[p.rule]) {
    const [en, ru] = STATIC_TITLES[p.rule];
    const msg = String(p.message || "").replace(/^[\w/-]+: /, "");
    ex = { en: { title: en, why: msg, fix: "" }, ru: { title: ru, why: msg, fix: "" } };
  } else {
    const msg = String(p.message || p.what || "");
    ex = { en: { title: msg.split(/[.:]/)[0], why: msg, fix: "" }, ru: { title: msg.split(/[.:]/)[0], why: msg, fix: "" } };
  }
  for (const lang of ["en", "ru"]) {
    ex[lang].element = elementLabel(p.human, lang) || (p.file ? `${p.file}${p.line ? `:${p.line}` : ""}` : null);
    const parts = elementParts(p.human, lang);
    if (parts) { ex[lang].head = parts.head; ex[lang].place = parts.place; }
  }
  // one item per issue × element as a person names it, across pages and repeated copies (header + mobile menu)
  const who = p.human ? `${p.human.kind}|${p.human.name}` : p.selector || `${p.file}:${p.line}`;
  // visual: a person sees the defect on the page (red frame); false: it lives only in the code (yellow frame)
  const visual = r ? r.visual !== false : undefined;
  return { ...p, explain: ex, group: `${ex.en.title}|${who}`, ...(visual === undefined ? {} : { visual }) };
}
