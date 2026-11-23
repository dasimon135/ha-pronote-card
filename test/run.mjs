/**
 * pronote-card behaviour tests.  Run with:  node test/run.mjs
 *
 * What can go wrong here without looking wrong:
 *   1. the card picks another child's sensors, or misses a renamed one: it finds
 *      them by device and translation key, never by entity id;
 *   2. PRONOTE text reaches innerHTML unescaped (subjects, comments, titles);
 *   3. a value PRONOTE leaves out (-1 average, no colour, no lessons) throws or
 *      prints "NaN" instead of degrading to "-".
 * Dates are built from the real today, so "Tomorrow" stays tomorrow whenever this runs.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCard, check, contains, report } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const registry = await loadCard(join(HERE, '..', 'dist', 'pronote-card.js'));
const Card = registry.get('pronote-card');
check('the element is registered', typeof Card, 'function');

const pad = (n) => String(n).padStart(2, '0');
const day = (offset, time) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return time ? `${iso}T${time}:00` : iso;
};

const common = { full_name: 'EXEMPLE Léa', nickname: 'Léa', updated_at: '2026-11-23T19:44:36+00:00' };
const lesson = (offset, start, end, name, extra = {}) => ({
  start_at: day(offset, start), end_at: day(offset, end), lesson: name, classroom: '101',
  canceled: false, status: null, background_color: '#F49737', teacher_name: 'PROF A.', group_name: null, ...extra,
});

function makeHass(overrides = {}) {
  const sensors = {
    grades: ['40', { grades: [
      { date: day(-6), subject: 'ESPAGNOL LV2 > Expression écrite', comment: '', grade: '18', out_of: '20', class_average: '15,9' },
      { date: day(-11), subject: 'MATHEMATIQUES', comment: 'Les <b>relatifs</b>', grade: '6,5', out_of: '10', class_average: '7' },
    ] }],
    averages: ['2', { averages: [
      { subject: 'ESPAGNOL LV2 > Expression écrite', average: '18', class: '15,9', out_of: '20', background_color: '#E73A1F' },
      { subject: 'MATHEMATIQUES', average: '15', class: '12,06', out_of: '20', background_color: 'red;background:url(x)' },
    ] }],
    overall_average: ['15.4', {}],
    homework: ['3', { homework: [
      { date: day(1), subject: 'ESPAGNOL LV2', description: 'Apprendre le vocabulaire', done: false, background_color: '#E73A1F', files: [] },
      { date: day(1), subject: 'SVT', description: 'Leçon', done: true, background_color: '#5C782A', files: [] },
      { date: day(3), subject: 'TECHNOLOGIE', description: 'Fiche 2', done: false, background_color: '#9D526A', files: [{ name: 'f.pdf' }] },
    ] }],
    lessons_today: ['3', { lessons: [
      lesson(0, '09:00', '09:50', 'TECHNOLOGIE', { canceled: true, status: 'Prof. absent' }),
      lesson(0, '09:00', '09:50', 'TECHNOLOGIE', { teacher_name: 'REMPLACANT B.' }),
      lesson(0, '13:30', '14:30', 'FRANCAIS'),
    ], canceled_lessons_counter: 1, day_start_at: day(0, '09:00'), day_end_at: day(0, '14:30'),
      lunch_break_start_at: day(0, '12:00'), lunch_break_end_at: day(0, '13:30') }],
    lessons_next_day: ['2', { lessons: [
      lesson(1, '08:00', '09:00', 'ANGLAIS LV1', { canceled: true, status: 'Prof. absent' }),
      lesson(1, '09:00', '10:00', 'MATHEMATIQUES'),
    ], canceled_lessons_counter: 1 }],
    absences: ['2', { absences: [
      { from: day(-7, '10:10'), to: day(-7, '11:10'), justified: false, hours: '1h00', reason: '' },
      { from: day(-19, '08:00'), to: day(-19, '09:00'), justified: true, hours: '1h00', reason: 'RAISON FAMILIALE' },
    ] }],
    delays: ['0', { delays: [] }],
    punishments: ['0', { punishments: [] }],
    information_and_surveys: ['2', { unread_count: 1, information_and_surveys: [
      { title: 'Réunion <script>alert(1)</script>', author: 'Mme X', category: 'Direction', read: false, creation_date: day(-1, '10:00') },
      { title: 'Remplacement', author: 'Mme X', category: 'Direction', read: true, creation_date: day(-5, '10:00') },
    ] }],
    class: ['42', { class_name: '4e2', establishment: 'COLLEGE EXEMPLE ' }],
    current_period: ['Mi-semestre 1', {}],
  };
  Object.assign(sensors, overrides);
  const entities = {}, states = {};
  for (const [key, [state, attrs]] of Object.entries(sensors)) {
    const id = `sensor.pronote_lea_${key}`;
    entities[id] = { entity_id: id, platform: 'pronote', translation_key: key, device_id: 'dev_lea' };
    states[id] = { entity_id: id, state, attributes: { ...common, ...attrs }, last_updated: '1' };
  }
  // A second child on another device, and a past-period sensor of the first one.
  entities['sensor.pronote_tom_grades'] = { entity_id: 'sensor.pronote_tom_grades', platform: 'pronote', translation_key: 'grades', device_id: 'dev_tom' };
  states['sensor.pronote_tom_grades'] = { state: '1', attributes: { nickname: 'Tom', grades: [{ subject: 'TOM ONLY', grade: '1', out_of: '20' }] } };
  entities['sensor.pronote_lea_grades_trimestre_1'] = { entity_id: 'sensor.pronote_lea_grades_trimestre_1', platform: 'pronote', translation_key: 'grades_period', device_id: 'dev_lea' };
  return { language: 'fr', entities, states, devices: { dev_lea: { name: 'Pronote Léa' }, dev_tom: { name: 'Pronote Tom' } } };
}

function render(config, hass, setup) {
  const card = new Card();
  card.setConfig(config);
  if (setup) setup(card);
  card.hass = hass;
  return card;
}
const html = (card) => card._root.innerHTML;
const show = (card, fields) => { Object.assign(card, fields); card._render(); return html(card); };

// ── Header and tiles ─────────────────────────────────────────────────────────
const hass = makeHass();
const card = render({ entity: 'sensor.pronote_lea_homework' }, hass);
let out = html(card);
contains('nickname in the header', out, '<span class="title">Léa</span>');
contains('class and school, trimmed', out, '4e2 · COLLEGE EXEMPLE</span>');
contains('unread information pill', out, '1 non lue');
contains('overall average with a French comma', out, '<b>15,4</b>');
contains('homework tile counts what is not done, and what is due tomorrow', out, '<b>2</b><span>à faire, 1 pour demain</span>');
contains('tomorrow tile: first lesson that is still on', out, '<b>9:00</b>');
contains('tomorrow tile warns about a canceled lesson', out, 'class="tile warn"');
contains('footer: period', out, 'Mi-semestre 1</div>');

// ── Grades ───────────────────────────────────────────────────────────────────
contains('grades tab first by default', out, 'data-tab="grades" aria-selected="true"');
contains('subject in sentence case, LV kept', out, '<b>Espagnol LV2</b>');
contains('sub-subject and comment in the detail line', out, 'Expression écrite');
contains('grade over its scale', out, '<b>18<small>/20</small></b>');
contains('above the class average is marked up', out, '<span class="up">classe 15,9</span>');
contains('subject colour taken from the averages list', out, 'background:#E73A1F');
contains('comment escaped', out, 'Les &lt;b&gt;relatifs&lt;/b&gt;');
check('no raw <b> from PRONOTE', out.includes('<b>relatifs'), false);
check('only this child: no other device', out.includes('TOM ONLY'), false);
contains('says only the latest grades are listed', out, 'Les 2 dernières des 40 notes');
out = show(card, { _gradesView: 'subjects' });
contains('by subject: bar width from the average', out, 'width:90%;background:#E73A1F');
contains('by subject: class mark', out, 'left:calc(79.5% - 1px)');
check('a colour that is not a hex never reaches style', out.includes('url(x)'), false);

// ── Homework ─────────────────────────────────────────────────────────────────
out = show(card, { _tab: 'homework' });
contains('grouped under Tomorrow', out, '<b>Demain</b>');
contains('done homework shows checked', out, 'class="check done"');
contains('done homework struck through', out, '<span class="strike">Leçon</span>');
contains('attachment mentioned, never linked', out, 'Pièce jointe');
check('no attachment URL', out.includes('f.pdf'), false);

// ── Lessons ──────────────────────────────────────────────────────────────────
out = show(card, { _tab: 'lessons', _day: 'today' });
contains('replaced lesson: the replacement is shown', out, 'REMPLACANT B.');
check('replaced lesson: the canceled twin is dropped', out.includes('Prof. absent'), false);
contains('lunch break before the first afternoon lesson', out, 'Pause déjeuner · 12:00 à 13:30');
check('lunch break placed after the morning', out.indexOf('Pause') > out.indexOf('9:00'), true);
out = show(card, { _day: 'next' });
contains('next day: canceled lesson kept with its status', out, '<span class="chip">Prof. absent</span>');
contains('next day: struck through', out, '<b class="strike">Anglais LV1</b>');
contains('next day button named after the day', out, 'data-day="next" aria-pressed="true">Demain');

// ── School life ──────────────────────────────────────────────────────────────
out = show(card, { _tab: 'life' });
contains('absences tile warns when one is to justify', out, '<b>2</b><span>absences, 1 à justifier</span>');
contains('unjustified absence chip', out, '<span class="chip">À justifier</span>');
contains('justified absence chip', out, '<span class="chip ok">Justifiée</span>');
contains('reason in lower case', out, 'raison familiale');
contains('information title escaped', out, 'Réunion &lt;script&gt;');
contains('unread information dot', out, '<span class="dot"></span>');

// ── Degrading ────────────────────────────────────────────────────────────────
out = html(render({ entity: 'sensor.pronote_lea_grades' }, makeHass({ overall_average: ['-1', {}] })));
contains('-1 average shows a dash', out, '<b>-</b><span>moyenne générale</span>');
out = html(render({ entity: 'sensor.pronote_lea_grades' }, makeHass({ grades: ['0', { grades: [] }] })));
contains('no grades: empty message', out, 'Aucune note sur cette période.');
out = html(render({ entity: 'sensor.pronote_lea_grades' }, makeHass({ grades: ['unavailable', {}] })));
contains('PRONOTE down: alert', out, 'PRONOTE ne répond pas');
check('PRONOTE down: no tiles', out.includes('class="tiles"'), false);
out = html(render({ entity: 'sensor.nothing' }, { language: 'en', entities: {}, states: {}, devices: {} }));
contains('nothing found: English alert', out, 'No Pronote sensor found');
check('no NaN anywhere', [html(card), out].some((h) => h.includes('NaN')), false);

// ── Second child ─────────────────────────────────────────────────────────────
out = html(render({ entity: 'sensor.pronote_tom_grades' }, hass));
contains('second child: its own name', out, '<span class="title">Tom</span>');
check('second child: none of the first child', out.includes('Espagnol'), false);

// ── Grades: limit and repeated sub-subject ───────────────────────────────────
const limited = render({ entity: 'sensor.pronote_lea_grades', grades: 1 }, makeHass({ grades: ['3', { grades: [
  { date: day(-1), subject: 'TECHNOLOGIE > TECHNOLOGIE', grade: '4', out_of: '10', class_average: '3,5' },
  { date: day(-2), subject: 'FRANCAIS', grade: '12', out_of: '20', class_average: '13' },
] }] }));
out = html(limited);
contains('limit: a show-more button with the hidden count', out, 'Voir 1 note de plus');
check('limit: the second grade is hidden', out.includes('Francais'), false);
check('a sub-subject equal to the subject is not repeated', out.includes('>TECHNOLOGIE'), false);
out = show(limited, { _allGrades: true });
contains('show more: every grade', out, 'Francais');
contains('show more: a button to fold back', out, 'Réduire');
out = html(render({ entity: 'sensor.pronote_lea_grades', grades: 0 }, makeHass()));
check('limit 0: no button', out.includes('data-more'), false);

// ── Editor ───────────────────────────────────────────────────────────────────
check('stub config picks a grades sensor', Card.getStubConfig(hass).entity.includes('grades'), true);
check('config form filters on the integration', Card.getConfigForm().schema[0].selector.entity.filter.integration, 'pronote');

report();
