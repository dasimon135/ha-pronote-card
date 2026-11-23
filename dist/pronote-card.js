/*
 * Pronote card: grades, homework, timetable and school life of one child, from the
 * sensors of the Pronote integration (github.com/delphiki/hass-pronote).
 * Vanilla custom element, no external dependencies, no build step.
 *
 * Everything shown comes from PRONOTE: subjects, comments, homework text, teacher
 * names and information titles are untrusted text and go through esc() before
 * reaching innerHTML. Colours come from PRONOTE too and go through color().
 */
const PRONOTE_CARD_VERSION = "0.1.0";

const STRINGS = {
  en: {
    grades: "Grades", homework: "Homework", lessons: "Lessons", life: "School life",
    overall: "overall average", toDo: "to do", forTomorrow: (n) => `${n} for tomorrow`,
    firstLesson: "first lesson", canceled: (n) => `${n} canceled`, none: "-",
    recent: "Recent", bySubject: "By subject", classAvg: "class", classMark: "The vertical mark is the class average.",
    lastOf: (shown, total) => `The ${shown} latest of ${total} grades, as sent by the integration.`,
    noGrades: "No grades for this period.", noHomework: "Nothing to hand in.", noLessons: "No lessons.",
    today: "Today", tomorrow: "Tomorrow", lunch: (a, b) => `Lunch break · ${a} to ${b}`,
    absences: "Absences", delays: "Delays", punishments: "Punishments", toJustify: "To justify", justified: "Justified",
    unjustified: (n) => `${n} to justify`, information: "Information", noAbsences: "No absences.", noInfo: "No information.",
    infos: (n) => `${n} unread`, attachment: "Attachment: open it in PRONOTE", done: "Done",
    read: (t) => `Read at ${t}`, unavailable: "PRONOTE cannot be reached right now.",
    notFound: "No Pronote sensor found. Pick one in the card settings.",
    entity: "Any sensor of the child", title: "Title", tab: "Tab shown first",
    grades_label: "Grades shown before \"show more\" (0: all)",
    more: (n) => `Show ${n} more grade${n > 1 ? "s" : ""}`, less: "Show less",
  },
  fr: {
    grades: "Notes", homework: "Devoirs", lessons: "Cours", life: "Vie sco.",
    overall: "moyenne générale", toDo: "à faire", forTomorrow: (n) => `${n} pour demain`,
    firstLesson: "première heure", canceled: (n) => `${n} cours annulé${n > 1 ? "s" : ""}`, none: "-",
    recent: "Récentes", bySubject: "Par matière", classAvg: "classe", classMark: "Le trait vertical marque la moyenne de la classe.",
    lastOf: (shown, total) => `Les ${shown} dernières des ${total} notes, celles que transmet l’intégration.`,
    noGrades: "Aucune note sur cette période.", noHomework: "Rien à rendre.", noLessons: "Pas de cours.",
    today: "Aujourd’hui", tomorrow: "Demain", lunch: (a, b) => `Pause déjeuner · ${a} à ${b}`,
    absences: "Absences", delays: "Retards", punishments: "Punitions", toJustify: "À justifier", justified: "Justifiée",
    unjustified: (n) => `${n} à justifier`, information: "Informations", noAbsences: "Aucune absence.", noInfo: "Aucune information.",
    infos: (n) => `${n} non lue${n > 1 ? "s" : ""}`, attachment: "Pièce jointe : à ouvrir dans PRONOTE", done: "Fait",
    read: (t) => `Lu à ${t}`, unavailable: "PRONOTE ne répond pas pour le moment.",
    notFound: "Aucun capteur Pronote trouvé. Choisissez-en un dans les réglages de la carte.",
    entity: "Un capteur de l’enfant", title: "Titre", tab: "Onglet affiché d’abord",
    grades_label: "Notes affichées avant « voir plus » (0 : toutes)",
    more: (n) => `Voir ${n} note${n > 1 ? "s" : ""} de plus`, less: "Réduire",
  },
};

const TABS = ["grades", "homework", "lessons", "life"];
// Fallback hues for a subject PRONOTE sends without a colour (the grades list has none).
const SUBJECT_COLORS = ["#3b6fd9", "#d9822b", "#2e9e6a", "#8e5ad6", "#c2477a", "#1f9bb5", "#b08a1e", "#6b7a8f"];

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hashColor = (text) => {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length];
};
// Only a plain hex colour reaches a style attribute.
const color = (value, subject) => (/^#[0-9a-f]{3,8}$/i.test(String(value || "")) ? value : hashColor(subject));
// "6,5" -> 6.5; anything else (absent, "Abs", "Disp") -> NaN.
const num = (value) => Number.parseFloat(String(value ?? "").replace(",", "."));
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace(".", ",") : "-");

// "ESPAGNOL LV2 > Expression écrite" -> ["Espagnol LV2", "Expression écrite"]
const splitSubject = (subject) => {
  const [main, ...rest] = String(subject || "").split(">").map((s) => s.trim());
  // PRONOTE writes subjects in capitals; sentence case reads better, LV1/LV2 stay as they are.
  const pretty = main === main.toUpperCase() ? main.toLowerCase().replace(/\blv(\d)\b/g, "LV$1") : main;
  // "TECHNOLOGIE > TECHNOLOGIE" says the same thing twice.
  const part = rest.join(" > ");
  return [pretty.charAt(0).toUpperCase() + pretty.slice(1), part.toLowerCase() === main.toLowerCase() ? "" : part];
};

// "2026-11-24" or "2026-11-24T09:00:00" as a local calendar day.
const parseDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const dayDiff = (day) => {
  const now = new Date();
  return Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
};
const hhmm = (iso) => {
  const m = /T(\d{2}):(\d{2})/.exec(String(iso || ""));
  return m ? `${Number(m[1])}:${m[2]}` : "";
};

const ICONS = {
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
};
const icon = (name, size = 18, width = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const STYLE = `
:host { display: block; }
ha-card { padding: 16px; display: flex; flex-direction: column; gap: 16px; overflow: hidden;
  --pc-accent: var(--primary-color, #03a9f4);
  --pc-muted: var(--secondary-text-color, #727272);
  --pc-line: var(--divider-color, rgba(0,0,0,.12));
  --pc-surface: var(--secondary-background-color, rgba(127,127,127,.08));
  --pc-card: var(--ha-card-background, var(--card-background-color, #fff));
  /* Mixed toward the text colour so warning and success stay readable on light and dark themes. */
  --pc-warn: color-mix(in srgb, var(--warning-color, #ffa600) 62%, var(--primary-text-color, #212121));
  --pc-warn-soft: color-mix(in srgb, var(--warning-color, #ffa600) 16%, transparent);
  --pc-ok: color-mix(in srgb, var(--success-color, #43a047) 70%, var(--primary-text-color, #212121));
  --pc-ok-soft: color-mix(in srgb, var(--success-color, #43a047) 15%, transparent);
  --pc-accent-soft: color-mix(in srgb, var(--pc-accent) 14%, transparent); }
button { font: inherit; color: inherit; }
.muted { color: var(--pc-muted); }
.head { display: flex; align-items: center; gap: 12px; }
.avatar { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center;
  justify-content: center; background: var(--pc-accent-soft); color: var(--pc-accent); font-size: 18px; font-weight: 700; }
.names { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.title { font-size: 17px; font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: 13px; color: var(--pc-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 12px; border: 0; border-radius: 999px;
  background: var(--pc-accent-soft); color: var(--pc-accent); font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; }
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.tile { background: var(--pc-surface); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column;
  gap: 2px; min-width: 0; border: 0; text-align: left; }
button.tile { cursor: pointer; }
.tile b { font-size: 20px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile span { font-size: 12px; color: var(--pc-muted); }
.tile.warn { background: var(--pc-warn-soft); }
.tile.warn b, .tile.warn span { color: var(--pc-warn); }
.tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 12px; background: var(--pc-surface); }
.tab { min-height: 40px; border: 0; border-radius: 9px; background: transparent; color: var(--pc-muted);
  font-size: 13px; font-weight: 600; cursor: pointer; padding: 0 4px; }
.tab[aria-selected="true"] { background: var(--pc-card); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.14); }
.segs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.seg { min-height: 32px; border: 1px solid var(--pc-line); border-radius: 999px; background: transparent; color: var(--pc-muted);
  font-size: 13px; font-weight: 600; cursor: pointer; padding: 0 14px; }
.seg[aria-pressed="true"] { border-color: var(--pc-accent); background: var(--pc-accent-soft); color: var(--pc-accent); }
.segs .aside { margin-left: auto; font-size: 12px; color: var(--pc-muted); }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 12px; align-items: stretch; padding: 10px 12px; border: 1px solid var(--pc-line); border-radius: 12px; }
.bar { width: 4px; border-radius: 4px; flex-shrink: 0; }
.txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.txt b { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.txt span { font-size: 13px; line-height: 1.45; color: var(--pc-muted); white-space: pre-line; overflow-wrap: anywhere; }
.score { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.score b { font-size: 16px; font-weight: 700; white-space: nowrap; }
.score b small { font-size: 13px; font-weight: 500; color: var(--pc-muted); }
.score span { font-size: 12px; color: var(--pc-muted); white-space: nowrap; }
.score span.up { color: var(--pc-ok); }
.subj { display: flex; flex-direction: column; gap: 6px; }
.subjtop { display: flex; align-items: baseline; gap: 8px; }
.subjtop span:first-child { font-size: 14px; font-weight: 600; flex: 1; min-width: 0; }
.subjtop b { font-size: 15px; }
.subjtop .cls { font-size: 12px; color: var(--pc-muted); width: 84px; text-align: right; }
.track { position: relative; height: 6px; border-radius: 6px; background: var(--pc-surface); }
.fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; }
.mark { position: absolute; top: -3px; width: 2px; height: 12px; background: var(--primary-text-color); opacity: .55; border-radius: 2px; }
.day { display: flex; flex-direction: column; gap: 8px; }
.dayhead { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.dayhead b { font-weight: 600; }
.dayhead.soon b { color: var(--pc-accent); }
.dayhead span { color: var(--pc-muted); font-size: 12px; }
.check { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--pc-line); flex-shrink: 0; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; color: transparent; }
.check.done { background: var(--pc-ok); border-color: var(--pc-ok); color: var(--pc-card); }
.strike { text-decoration: line-through; }
.time { display: flex; flex-direction: column; width: 44px; flex-shrink: 0; font-size: 13px; }
.time b { font-weight: 600; }
.time span { font-size: 12px; color: var(--pc-muted); }
.chip { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600;
  white-space: nowrap; align-self: center; flex-shrink: 0; background: var(--pc-warn-soft); color: var(--pc-warn); }
.chip.ok { background: var(--pc-ok-soft); color: var(--pc-ok); }
.break { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--pc-muted); padding: 2px 0; }
.break::before, .break::after { content: ""; flex: 1; height: 1px; background: var(--pc-line); }
.section { font-size: 13px; font-weight: 600; margin: 6px 0 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pc-accent); flex-shrink: 0; margin-top: 6px; box-sizing: border-box; }
.dot.read { background: transparent; border: 1px solid var(--pc-line); }
.more { min-height: 44px; border: 1px dashed var(--pc-line); border-radius: 12px; background: transparent;
  color: var(--pc-accent); font-size: 14px; font-weight: 600; cursor: pointer; }
.note, .empty { margin: 0; font-size: 12px; color: var(--pc-muted); }
.empty { font-size: 14px; padding: 8px 0; }
.alert { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; font-size: 13px;
  background: var(--pc-warn-soft); color: var(--pc-warn); }
.foot { padding-top: 10px; border-top: 1px solid var(--pc-line); font-size: 12px; color: var(--pc-muted); }
`;

class PronoteCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = "grades";
    this._gradesView = "recent";
    this._day = "today";
    this._sig = null;
  }

  static getStubConfig(hass) {
    const found = Object.values(hass?.entities || {}).find((e) => e.platform === "pronote" && e.translation_key === "grades");
    return found ? { entity: found.entity_id } : {};
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", selector: { entity: { filter: { integration: "pronote", domain: "sensor" } } } },
        { name: "title", selector: { text: {} } },
        { name: "tab", selector: { select: { mode: "dropdown", options: TABS } } },
        { name: "grades", selector: { number: { min: 0, max: 20, mode: "box" } } },
      ],
      computeLabel: (schema) => {
        const lang = (document.querySelector("home-assistant")?.hass?.language || "en").split("-")[0];
        const t = STRINGS[lang] || STRINGS.en;
        return schema.name === "grades" ? t.grades_label : t[schema.name];
      },
    };
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._tab = TABS.includes(this._config.tab) ? this._config.tab : "grades";
    this._sig = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const sig = this._signature();
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  get _t() {
    const lang = (this._hass?.language || "en").split("-")[0];
    return STRINGS[lang] || STRINGS.en;
  }

  // The child's sensors are the Pronote entities of the configured sensor's device, found
  // by translation key: entity ids change (a `_2` suffix, a rename), keys do not. The
  // period sensors of past periods carry `*_period` keys and are left out.
  _resolve() {
    const hass = this._hass;
    const all = Object.values(hass.entities || {}).filter((e) => e.platform === "pronote");
    const id = this._config.entity || all.find((e) => e.translation_key === "grades")?.entity_id;
    const deviceId = hass.entities?.[id]?.device_id;
    const mine = all.filter((e) => !deviceId || e.device_id === deviceId);
    const ids = {};
    for (const e of mine) if (e.translation_key && !(e.translation_key in ids)) ids[e.translation_key] = e.entity_id;
    return { ids, device: hass.devices?.[deviceId] };
  }

  _signature() {
    if (!this._hass || !this._config) return null;
    const r = this._resolve();
    return JSON.stringify([this._hass.language, Object.values(r.ids).map((id) => this._hass.states[id]?.last_updated)]);
  }

  _state(key) {
    return this._hass.states[this._r.ids[key]];
  }

  _attr(key, name) {
    const v = this._state(key)?.attributes?.[name];
    return Array.isArray(v) ? v : [];
  }

  _render() {
    if (!this._hass || !this._config) return;
    const t = this._t;
    this._r = this._resolve();
    const any = this._state("grades") || this._state("homework") || this._state("lessons_today");
    if (!any) {
      this._paint(`<div class="alert">${icon("alert")}<span>${esc(t.notFound)}</span></div>`);
      return;
    }
    const down = any.state === "unavailable" || any.state === "unknown";

    const cls = this._state("class")?.attributes || {};
    const name = this._config.title || any.attributes.nickname || any.attributes.full_name || this._r.device?.name || "Pronote";
    const sub = [cls.class_name, String(cls.establishment || "").trim()].filter(Boolean).join(" · ");
    const unread = Number(this._state("information_and_surveys")?.attributes?.unread_count) || 0;
    const head = `
      <div class="head">
        <div class="avatar" aria-hidden="true">${esc(String(name).charAt(0).toUpperCase())}</div>
        <div class="names"><span class="title">${esc(name)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</div>
        ${unread ? `<button class="pill" data-tab="life">${icon("bell", 16)}${esc(t.infos(unread))}</button>` : ""}
      </div>`;

    const body = down
      ? `<div class="alert">${icon("alert")}<span>${esc(t.unavailable)}</span></div>`
      : { grades: () => this._grades(), homework: () => this._homework(), lessons: () => this._lessons(), life: () => this._life() }[this._tab]();

    const period = this._state("current_period")?.state;
    const updated = any.attributes.updated_at ? new Date(any.attributes.updated_at) : null;
    const time = updated && !Number.isNaN(updated.getTime())
      ? new Intl.DateTimeFormat(this._hass.language, { hour: "numeric", minute: "2-digit" }).format(updated) : "";
    const foot = [time ? t.read(time) : "", period && period !== "unknown" && period !== "unavailable" ? period : ""].filter(Boolean).join(" · ");

    const tabs = `<div class="tabs" role="tablist">${TABS.map((id) =>
      `<button class="tab" role="tab" data-tab="${id}" aria-selected="${this._tab === id}">${esc(t[id])}</button>`).join("")}</div>`;

    this._paint(`${head}${down ? "" : this._tiles()}${tabs}${body}${foot ? `<div class="foot">${esc(foot)}</div>` : ""}`);
  }

  _tiles() {
    const t = this._t;
    const avg = num(this._state("overall_average")?.state);
    const hw = this._attr("homework", "homework").filter((h) => !h.done);
    const dueTomorrow = hw.filter((h) => { const d = parseDay(h.date); return d && dayDiff(d) === 1; }).length;
    const next = this._attr("lessons_next_day", "lessons");
    const first = next.find((l) => !l.canceled) || next[0];
    const canceled = Number(this._state("lessons_next_day")?.attributes?.canceled_lessons_counter) || 0;
    const day = parseDay(first?.start_at);
    const when = day ? this._relDay(day).toLowerCase() : "";
    return `<div class="tiles">
      <button class="tile" data-tab="grades"><b>${avg >= 0 ? esc(fmt(avg)) : t.none}</b><span>${esc(t.overall)}</span></button>
      <button class="tile" data-tab="homework"><b>${hw.length}</b><span>${esc(dueTomorrow ? `${t.toDo}, ${t.forTomorrow(dueTomorrow)}` : t.toDo)}</span></button>
      <button class="tile${canceled ? " warn" : ""}" data-tab="lessons" data-day="next"><b>${first ? esc(hhmm(first.start_at)) : t.none}</b><span>${esc([when, canceled ? t.canceled(canceled) : t.firstLesson].filter(Boolean).join(" · "))}</span></button>
    </div>`;
  }

  _relDay(day) {
    const diff = dayDiff(day);
    if (diff === 0) return this._t.today;
    if (diff === 1) return this._t.tomorrow;
    const name = new Intl.DateTimeFormat(this._hass.language, { weekday: "long" }).format(day);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  _grades() {
    const t = this._t;
    // The grades list has no colours; the averages list has one per subject.
    const colors = new Map(this._attr("averages", "averages").map((a) => [a.subject, a.background_color]));
    const period = this._state("current_period")?.state;
    const segs = `<div class="segs">
      <button class="seg" data-view="recent" aria-pressed="${this._gradesView === "recent"}">${esc(t.recent)}</button>
      <button class="seg" data-view="subjects" aria-pressed="${this._gradesView === "subjects"}">${esc(t.bySubject)}</button>
      ${period ? `<span class="aside">${esc(period)}</span>` : ""}</div>`;
    const dateFmt = new Intl.DateTimeFormat(this._hass.language, { day: "numeric", month: "short" });

    if (this._gradesView === "subjects") {
      const avgs = this._attr("averages", "averages");
      if (!avgs.length) return `${segs}<p class="empty">${esc(t.noGrades)}</p>`;
      const rows = avgs.map((a) => {
        const mine = num(a.average), klass = num(a.class), outOf = num(a.out_of) || 20;
        const [main, part] = splitSubject(a.subject);
        const width = Number.isFinite(mine) ? Math.max(0, Math.min(100, (mine / outOf) * 100)) : 0;
        const mark = Number.isFinite(klass) ? `<span class="mark" style="left:calc(${Math.max(0, Math.min(100, (klass / outOf) * 100))}% - 1px)"></span>` : "";
        return `<div class="subj"><div class="subjtop"><span>${esc(part ? `${main} · ${part}` : main)}</span><b>${esc(fmt(mine))}</b>
          <span class="cls">${esc(t.classAvg)} ${esc(fmt(klass))}</span></div>
          <div class="track"><span class="fill" style="width:${width}%;background:${color(a.background_color, main)}"></span>${mark}</div></div>`;
      }).join("");
      return `${segs}<div class="list" style="gap:12px">${rows}<p class="note">${esc(t.classMark)}</p></div>`;
    }

    const grades = this._attr("grades", "grades");
    if (!grades.length) return `${segs}<p class="empty">${esc(t.noGrades)}</p>`;
    // Eleven grades is a very tall card: the latest few, then a button.
    const limit = Number.isInteger(this._config.grades) && this._config.grades >= 0 ? this._config.grades : 5;
    const hidden = limit && !this._allGrades ? Math.max(0, grades.length - limit) : 0;
    const rows = grades.slice(0, hidden ? limit : grades.length).map((g) => {
      const [main, part] = splitSubject(g.subject);
      const day = parseDay(g.date);
      const detail = [part, g.comment, day ? dateFmt.format(day) : ""].filter(Boolean).join(" · ");
      const mine = num(g.grade), klass = num(g.class_average);
      const up = Number.isFinite(mine) && Number.isFinite(klass) && mine >= klass;
      return `<div class="row"><span class="bar" style="background:${color(colors.get(g.subject), main)}"></span>
        <div class="txt"><b>${esc(main)}</b>${detail ? `<span>${esc(detail)}</span>` : ""}</div>
        <div class="score"><b>${esc(g.grade)}<small>/${esc(g.out_of)}</small></b>${Number.isFinite(klass) ? `<span class="${up ? "up" : ""}">${esc(t.classAvg)} ${esc(g.class_average)}</span>` : ""}</div></div>`;
    }).join("");
    const total = Number(this._state("grades")?.state);
    const more = hidden ? `<button class="more" data-more>${esc(t.more(hidden))}</button>`
      : limit && this._allGrades && grades.length > limit ? `<button class="more" data-more>${esc(t.less)}</button>` : "";
    const note = Number.isFinite(total) && total > grades.length ? `<p class="note">${esc(t.lastOf(grades.length, total))}</p>` : "";
    return `${segs}<div class="list">${rows}${more}${note}</div>`;
  }

  _homework() {
    const t = this._t;
    const items = this._attr("homework", "homework");
    if (!items.length) return `<p class="empty">${esc(t.noHomework)}</p>`;
    const days = new Map();
    for (const item of items) {
      const key = String(item.date || "");
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(item);
    }
    const dateFmt = new Intl.DateTimeFormat(this._hass.language, { day: "numeric", month: "short" });
    const out = [];
    for (const [key, list] of days) {
      const day = parseDay(key);
      const soon = day && dayDiff(day) <= 1;
      out.push(`<div class="day"><div class="dayhead${soon ? " soon" : ""}"><b>${esc(day ? this._relDay(day) : key)}</b>${day ? `<span>${esc(dateFmt.format(day))}</span>` : ""}</div>`);
      for (const h of list) {
        const [main] = splitSubject(h.subject);
        out.push(`<div class="row" style="align-items:flex-start">
          <span class="check${h.done ? " done" : ""}" role="img" aria-label="${esc(h.done ? t.done : t.toDo)}">${icon("check", 14, 3)}</span>
          <span class="bar" style="background:${color(h.background_color, main)};align-self:stretch"></span>
          <div class="txt"><b>${esc(main)}</b><span class="${h.done ? "strike" : ""}">${esc(h.description || h.short_description)}</span>
          ${Array.isArray(h.files) && h.files.length ? `<span>${esc(t.attachment)}</span>` : ""}</div></div>`);
      }
      out.push("</div>");
    }
    return `<div class="list" style="gap:14px">${out.join("")}</div>`;
  }

  _lessons() {
    const t = this._t;
    const key = this._day === "today" ? "lessons_today" : "lessons_next_day";
    const st = this._state(key);
    const lessons = this._attr(key, "lessons");
    const nextDay = parseDay(this._attr("lessons_next_day", "lessons")[0]?.start_at);
    const nextLabel = nextDay ? this._relDay(nextDay) : t.tomorrow;
    const a = st?.attributes || {};
    const range = a.day_start_at && a.day_end_at ? `${hhmm(a.day_start_at)} – ${hhmm(a.day_end_at)}` : "";
    const segs = `<div class="segs">
      <button class="seg" data-day="today" aria-pressed="${this._day === "today"}">${esc(t.today)}</button>
      <button class="seg" data-day="next" aria-pressed="${this._day === "next"}">${esc(nextLabel)}</button>
      ${range ? `<span class="aside">${esc(range)}</span>` : ""}</div>`;
    if (!lessons.length) return `${segs}<p class="empty">${esc(t.noLessons)}</p>`;
    // A lesson PRONOTE replaced shows twice at the same time: keep the one still on.
    const shown = lessons.filter((l) => !(l.canceled && lessons.some((o) => o !== l && !o.canceled && o.start_at === l.start_at)));
    const lunchStart = a.lunch_break_start_at, lunchEnd = a.lunch_break_end_at;
    const out = [];
    let lunchDone = !lunchStart || !lunchEnd;
    for (const l of shown) {
      if (!lunchDone && String(l.start_at) >= String(lunchEnd)) {
        out.push(`<div class="break">${esc(t.lunch(hhmm(lunchStart), hhmm(lunchEnd)))}</div>`);
        lunchDone = true;
      }
      const [main] = splitSubject(l.lesson);
      const where = [l.classroom, l.group_name, l.teacher_name].filter(Boolean).join(" · ");
      out.push(`<div class="row"><div class="time"><b>${esc(hhmm(l.start_at))}</b><span>${esc(hhmm(l.end_at))}</span></div>
        <span class="bar" style="background:${color(l.background_color, main)}"></span>
        <div class="txt"><b class="${l.canceled ? "strike" : ""}">${esc(main)}</b>${where ? `<span>${esc(where)}</span>` : ""}</div>
        ${l.canceled || l.status ? `<span class="chip">${esc(l.status || t.canceled(1))}</span>` : ""}</div>`);
    }
    return `${segs}<div class="list">${out.join("")}</div>`;
  }

  _life() {
    const t = this._t;
    const absences = this._attr("absences", "absences");
    const toJustify = absences.filter((a) => !a.justified).length;
    const count = (key) => { const n = Number(this._state(key)?.state); return Number.isFinite(n) ? n : 0; };
    const tiles = `<div class="tiles">
      <div class="tile${toJustify ? " warn" : ""}"><b>${count("absences")}</b><span>${esc(toJustify ? `${t.absences.toLowerCase()}, ${t.unjustified(toJustify)}` : t.absences.toLowerCase())}</span></div>
      <div class="tile"><b>${count("delays")}</b><span>${esc(t.delays.toLowerCase())}</span></div>
      <div class="tile"><b>${count("punishments")}</b><span>${esc(t.punishments.toLowerCase())}</span></div></div>`;
    const dayFmt = new Intl.DateTimeFormat(this._hass.language, { weekday: "long", day: "numeric", month: "short" });
    const abs = absences.length ? absences.map((a) => {
      const day = parseDay(a.from);
      const when = day ? dayFmt.format(day) : "";
      const detail = [`${hhmm(a.from)} – ${hhmm(a.to)}`, a.hours, a.reason ? String(a.reason).toLowerCase() : ""].filter(Boolean).join(" · ");
      return `<div class="row" style="align-items:center"><div class="txt"><b>${esc(when.charAt(0).toUpperCase() + when.slice(1))}</b><span>${esc(detail)}</span></div>
        <span class="chip${a.justified ? " ok" : ""}">${esc(a.justified ? t.justified : t.toJustify)}</span></div>`;
    }).join("") : `<p class="empty">${esc(t.noAbsences)}</p>`;
    const infoFmt = new Intl.DateTimeFormat(this._hass.language, { day: "numeric", month: "short" });
    const infos = this._attr("information_and_surveys", "information_and_surveys");
    const info = infos.length ? infos.map((i) => {
      const day = parseDay(i.creation_date || i.start_date);
      const meta = [i.category, i.author, day ? infoFmt.format(day) : ""].filter(Boolean).join(" · ");
      return `<div class="row" style="align-items:flex-start"><span class="dot${i.read ? " read" : ""}"></span>
        <div class="txt"><b>${esc(i.title)}</b><span>${esc(meta)}</span></div></div>`;
    }).join("") : `<p class="empty">${esc(t.noInfo)}</p>`;
    return `${tiles}<div class="list"><p class="section">${esc(t.absences)}</p>${abs}<p class="section">${esc(t.information)}</p>${info}</div>`;
  }

  _paint(html) {
    if (!this._root) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card></ha-card>`;
      this._root = this.shadowRoot.querySelector("ha-card");
      this._root.addEventListener("click", (ev) => this._click(ev));
    }
    this._root.innerHTML = html;
  }

  _click(ev) {
    const el = ev.target.closest("button");
    if (!el) return;
    if (el.dataset.tab) this._tab = el.dataset.tab;
    if (el.dataset.day) this._day = el.dataset.day;
    if (el.dataset.view) this._gradesView = el.dataset.view;
    if ("more" in el.dataset) this._allGrades = !this._allGrades;
    if (!el.dataset.tab && !el.dataset.day && !el.dataset.view && !("more" in el.dataset)) return;
    this._render();
  }
}

if (!customElements.get("pronote-card")) {
  customElements.define("pronote-card", PronoteCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "pronote-card",
    name: "Pronote",
    description: "Grades, homework, timetable and school life of one child, from the Pronote integration.",
    preview: true,
    documentationURL: "https://github.com/dasimon135/ha-pronote-card",
  });
  console.info(`%c PRONOTE-CARD %c ${PRONOTE_CARD_VERSION} `, "background:#1f8f5f;color:#fff", "");
}
