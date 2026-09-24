// End-to-end test: drives the real UI in Chrome (Playwright). Needs the server (:4000), the Expo web app (:8081) and Redis running.
// Run: cd e2e && npm i && node e2e.js   (CHROME_PATH / APP_URL / API_URL / SHOTS_DIR env vars override defaults)
// Data created by the run is deleted from Redis at the end (structs that did not exist when the run started).
const { chromium } = require('playwright-core');
const http = require('http');
const APP = process.env.APP_URL || 'http://localhost:8081', API = process.env.API_URL || 'http://localhost:4000';
const SHOTS = process.env.SHOTS_DIR || '.';
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + (extra ?? '')}`); };
let page;
const step = async (name, fn) => {
  try { await fn(); } catch (e) {
    check(name + ' (threw)', false, e.message.split('\n').slice(0, 3).join(' | '));
    try { await page.screenshot({ path: `${SHOTS}/fail_${name.replace(/\W+/g, '_')}.png` }); } catch (_) {}
  }
};

// Mock "selection" API
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify([{ id: 'v1', name: 'Acme', email: 'acme@x.com' }, { id: 'v2', name: 'Globex', email: 'globex@x.com' }]));
}).listen(4100);

(async () => {
  const existing = new Set(((await (await fetch(`${API}/api/structs`)).json()).structs || []).map(s => s.id));
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: 12.9716, longitude: 77.5946 } });
  const p = await ctx.newPage(); page = p;
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const txt = () => p.innerText('body');
  const has = async (t) => (await txt()).includes(t);
  const vis = (loc) => loc.locator('visible=true');
  const field = (label) => vis(p.getByText(label, { exact: false })).first();
  const inputOf = (label) => field(label).locator('xpath=following::input[1]');
  const comboOf = (label) => field(label).locator('xpath=following::*[@role="combobox"][1]');
  const combos = () => p.locator('[role="combobox"]:visible');
  const click = (t) => vis(p.getByText(t, { exact: true })).first().click();
  const tid = (id) => p.getByTestId(id);
  // custom dropdown: open it, click the option
  const choose = async (combo, name) => {
    await combo.click(); await p.waitForTimeout(250);
    await vis(p.getByRole('option', { name, exact: true })).first().click(); await p.waitForTimeout(250);
  };
  const rows = () => p.locator('[data-testid^="record-"]:not([data-testid="record-detail"])');
  const wait = (ms = 350) => p.waitForTimeout(ms);

  // ---------------------------------------------------------------- empty state
  await step('empty state', async () => {
    await p.route(API + '/api/structs', r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"structs":[]}' }) : r.continue());
    await p.goto(APP); await p.waitForTimeout(2500);
    check('home: empty state text', await has('No structs yet'));
    check('home: empty state CTA', await has('Create your first struct'));
    check('sidebar: empty hint', (await txt()).split('No structs yet').length > 2);
    await p.unroute(API + '/api/structs');
  });

  // ---------------------------------------------------------------- shell / theme
  await step('shell', async () => {
    await p.goto(APP); await p.waitForTimeout(2500);
    check('shell: sidebar + overview visible', (await has('Overview')) && (await has('Definitions')) && (await has('Design a struct')));
    check('shell: stats tiles', (await has('Records collected')) && (await has('Fields defined')));
    await tid('theme-toggle').click(); await wait();
    check('theme: cycles to light', await has('Theme: light'));
    await tid('theme-toggle').click(); await wait();
    check('theme: cycles to dark', await has('Theme: dark'));
    await p.screenshot({ path: `${SHOTS}/dark.png` });
    await tid('theme-toggle').click(); await wait();
    check('theme: back to system', await has('Theme: system'));
  });

  // ---------------------------------------------------------------- builder
  let structId;
  await step('builder', async () => {
    await tid('new-struct').click(); await p.waitForTimeout(1000);
    check('nav: builder route', p.url().endsWith('/structs/new'), p.url());
    check('builder: empty fields hint', await has('No fields yet'));
    await tid('save-struct').click(); await wait();
    check('builder: empty name error', await has('Give the struct a name'));
    await tid('struct-name').fill('E2E Leave Request');
    await tid('struct-key').fill('1 bad key');
    await tid('save-struct').click(); await wait();
    check('builder: invalid key rejected', await has('The key must start with a letter'));
    await tid('struct-key').fill('e2e-leave');
    await tid('save-struct').click(); await wait();
    check('builder: no fields error', await has('Add at least one field'));

    await tid('add-field').click(); await p.waitForTimeout(700);
    const t = await txt();
    check('picker: categories + types', ['BASIC FIELDS', 'COMPONENTS', 'SPECIAL FIELDS', 'Short Text', 'Large Text', 'Drop Down', 'Select from API', 'Auto Fill', 'Mobile Number', 'Location'].every(x => t.includes(x)));
    await p.screenshot({ path: `${SHOTS}/picker.png` });
    await tid('type-Short Text').click(); await p.waitForTimeout(500);
    await tid('save-field').click(); await wait(200);
    check('editor: name required', await has('Give this field a name'));
    await click('Cancel'); await p.waitForTimeout(500);
    check('editor: cancel adds nothing', !(await has('Untitled field')));

    const defs = [
      { n: 'Employment type', pick: 'Drop Down', x: async () => p.getByPlaceholder(/Full-time, Contract/).fill('Full-time, Contract'), req: true },
      { n: 'Company name', pick: 'Short Text' },
      { n: 'Days', pick: 'Whole Number', x: async () => { await p.getByPlaceholder('Min').last().fill('1'); await p.getByPlaceholder('Max').last().fill('30'); }, req: true },
      { n: 'Start date', pick: 'Date', x: async () => p.getByPlaceholder(/Min YYYY/).fill('2026-01-01'), req: true },
      { n: 'Contact email', pick: 'Email' },
      { n: 'Website', pick: 'URL' },
      { n: 'Phone', pick: 'Mobile Number', x: async () => { await vis(p.getByText('Show country picker', { exact: true })).last().click(); await choose(combos().nth(1), 'IN'); } },
      { n: 'Notes', pick: 'Large Text' },
      { n: 'Site location', pick: 'Location' },
      { n: 'Vendor', pick: 'Select from API', x: async () => p.getByPlaceholder('https://...').fill('http://localhost:4100/vendors') },
      { n: 'Vendor email', pick: 'Auto Fill', x: async () => { await choose(combos().nth(1), 'Vendor'); await p.getByPlaceholder('e.g. email').fill('email'); } },
      { n: 'Meeting time', pick: 'Time' },
      { n: 'Budget', pick: 'Decimal Number', x: async () => { await p.getByPlaceholder('Min').last().fill('0'); await p.getByPlaceholder('Max').last().fill('1000.5'); } },
      { n: 'Contract end', pick: 'Date', cond: { field: 'Days', op: 'is greater than', value: '10' } },
    ];
    for (const d of defs) {
      await tid('add-field').click(); await p.waitForTimeout(300);
      await tid(`type-${d.pick}`).click(); await p.waitForTimeout(400);
      await tid('field-name').fill(d.n);
      if (d.x) await d.x();
      if (d.req) await vis(p.getByText('Required', { exact: true })).last().click();
      if (d.cond) {
        await vis(p.getByText('Show this field conditionally', { exact: true })).last().click(); await wait(300);
        const n = await combos().count();
        await choose(combos().nth(n - 2), d.cond.field);
        await choose(combos().nth(n - 1), d.cond.op);
        await p.getByPlaceholder('Value').fill(d.cond.value);
      }
      await tid('save-field').click(); await wait(300);
    }
    check('builder: 14 field rows', (await p.locator('[data-testid^="field-row-"]').count()) === 14);
    check('builder: badges show Required/Conditional', (await has('Required')) && (await has('Conditional')));

    // section (condition on Employment type -> value chosen from its options)
    await tid('add-section').click(); await p.waitForTimeout(500);
    await tid('section-name').fill('Employer details');
    await vis(p.getByText('Show this section conditionally', { exact: true })).last().click(); await wait(300);
    await choose(combos().nth(0), 'Employment type');
    await choose(combos().nth(2), 'Full-time');
    await tid('save-section').click(); await wait(400);
    check('builder: section listed', await has('Employer details'));
    // assign Company name (row 1) to the section
    await tid('field-row-1').click(); await p.waitForTimeout(500);
    await choose(combos().nth(1), 'Employer details');
    await tid('save-field').click(); await wait(400);
    check('builder: section badge on field row', (await tid('field-row-1').innerText()).includes('Employer details'));

    // condition without a field is rejected on save
    await tid('add-field').click(); await tid('type-Short Text').click(); await tid('field-name').fill('Temp');
    await vis(p.getByText('Show this field conditionally', { exact: true })).last().click();
    await tid('save-field').click(); await wait(400);
    await tid('save-struct').click(); await wait(500);
    check('builder: condition without field rejected', await has('choose which field'));
    // reorder / duplicate / remove (15 rows now, Temp is row 14)
    await vis(p.getByLabel('Move up')).last().click(); await wait(400);
    check('builder: move up reorders', (await tid('field-row-14').innerText()).includes('Temp') === false && (await tid('field-row-13').innerText()).includes('Temp'));
    await vis(p.getByLabel('Duplicate field')).nth(13).click(); await wait(400);
    check('builder: duplicate', await has('Temp copy'));
    await vis(p.getByLabel('Remove field')).nth(14).click(); await wait(300);
    await vis(p.getByLabel('Remove field')).nth(13).click(); await wait(400);
    check('builder: remove leaves 14', (await p.locator('[data-testid^="field-row-"]').count()) === 14);
    await p.screenshot({ path: `${SHOTS}/builder_full.png`, fullPage: true });

    await tid('save-struct').click(); await p.waitForURL(/\/form$/, { timeout: 8000 });
    structId = p.url().split('/structs/')[1].split('/')[0];
    check('builder: save -> form route', true);
    await wait(500);
    check('toast: struct saved', await has('Struct saved'));
    check('sidebar: new struct listed + active', (await tid('nav-struct-E2E Leave Request').first().getAttribute('aria-current')) === 'page');
  });

  // ---------------------------------------------------------------- stored definition
  await step('stored def', async () => {
    const def = (await (await fetch(`${API}/api/structs/${structId}`)).json()).struct;
    check('def: 14 fields, 1 section', def.fields.length === 14 && def.sections.length === 1, JSON.stringify(def).slice(0, 300));
    const f = Object.fromEntries(def.fields.map(x => [x.id, x]));
    check('def: employmentType list+required', f.employmentType?.type === 'list' && f.employmentType.required && f.employmentType.options.length === 2);
    check('def: companyName sectioned', f.companyName?.sectionId === def.sections[0].id);
    check('def: days min/max', f.days?.min === 1 && f.days?.max === 30);
    check('def: multiline notes', f.notes?.multiline === true && f.notes?.type === 'text');
    check('def: phone countryPicker + IN', f.phone?.countryPicker && f.phone?.defaultCountry === 'IN', JSON.stringify(f.phone));
    check('def: fill wiring', f.vendorEmail?.sourceField === 'vendor' && f.vendorEmail?.sourceProp === 'email', JSON.stringify(f.vendorEmail));
    check('def: stable key saved', def.key === 'e2e-leave', def.key);
    check('def: field condition (numeric value)', f.contractEnd?.condition?.field === 'days' && f.contractEnd.condition.operator === 'gt' && f.contractEnd.condition.value === 10, JSON.stringify(f.contractEnd?.condition));
    check('def: section condition', def.sections[0].condition?.field === 'employmentType' && def.sections[0].condition?.value === 'Full-time', JSON.stringify(def.sections[0]));
  });

  // ---------------------------------------------------------------- form
  await step('form', async () => {
    await p.waitForTimeout(1200);
    check('form: title', await has('New E2E Leave Request record'));
    check('form: bubble header + progress', (await has('Please fill in the details below')) && (await has('0 of 3 required fields completed')));
    check('form: section hidden initially', !(await has('Employer details')) && !(await has('Company name')));
    check('form: conditional field hidden initially', !(await has('Contract end')));
    check('form: fill shown', await has('Vendor email'));
    {
      const a = await comboOf('Employment type').boundingBox(), b2 = await inputOf('Days').boundingBox(), c = await inputOf('Contact email').boundingBox();
      const notes = await p.locator('textarea').first().boundingBox(), form = await tid('submit').boundingBox();
      check('form layout: fields sit side by side (same row, different columns)', Math.abs(a.y - b2.y) < 6 && b2.x > a.x + a.width - 4, JSON.stringify({ a, b2 }));
      check('form layout: uses the pane width (>= 3 columns at 1440px)', Math.abs(b2.y - (await inputOf('Start date').boundingBox()).y) < 6, JSON.stringify(b2));
      check('form layout: long fields (notes) span the full row', notes.width > (b2.x + b2.width - a.x) * 0.9 && notes.y > c.y, JSON.stringify(notes));
    }

    await choose(comboOf('Employment type'), 'Full-time'); await wait(500);
    check('cond: section appears on Full-time', (await has('Employer details')) && (await has('Company name')));
    check('progress: 1 of 3', await has('1 of 3 required fields completed'));
    await choose(comboOf('Employment type'), 'Contract'); await wait(500);
    check('cond: section hides on Contract', !(await has('Company name')));
    await choose(comboOf('Employment type'), 'Full-time'); await wait(400);
    await inputOf('Company name').fill('Acme Corp');
    await click('Employer details'); await wait(300);
    check('section: collapses', (await vis(p.getByText('Company name', { exact: true })).count()) === 0);
    await click('Employer details'); await wait(300);
    check('section: value kept after collapse', (await inputOf('Company name').inputValue()) === 'Acme Corp');

    await inputOf('Days').fill('5'); await wait(500);
    check('cond: contract end hidden at days=5', !(await has('Contract end')));
    await inputOf('Days').fill('12'); await wait(500);
    check('cond: contract end shown at days=12', await has('Contract end'));

    await inputOf('Days').fill('50');
    await inputOf('Start date').fill('2025-06-01');
    await inputOf('Contact email').fill('nope');
    await inputOf('Website').fill('ftp//x');
    await field('Phone').locator('xpath=following::input[1]').fill('123');
    await inputOf('Budget').fill('2000');
    await tid('submit').click(); await wait(600);
    const t = await txt();
    check('val: days max', t.includes('Days must be at most 30'));
    check('val: date min', t.includes('Start date must be on or after 2026-01-01'));
    check('val: email', t.includes('Contact email must be a valid email'));
    check('val: url', t.includes('Website must be a valid URL'));
    check('val: phone', t.includes('Phone must be a valid phone number'));
    check('val: budget max', t.includes('Budget must be at most 1000.5'));
    check('val: summary banner', t.includes('Please fix'));
    check('val: not navigated', p.url().endsWith('/form'));
    await p.screenshot({ path: `${SHOTS}/form_errors.png`, fullPage: true });

    await inputOf('Days').fill('12');
    await inputOf('Start date').fill('2026-10-01');
    await inputOf('Contact email').fill('a@b.co');
    await inputOf('Website').fill('https://example.com');
    await field('Phone').locator('xpath=following::input[1]').fill('98765 43210');
    await inputOf('Budget').fill('99.5');
    await p.locator('textarea').first().fill('line1\nline2');
    await inputOf('Meeting time').fill('14:30');
    await inputOf('Contract end').fill('2027-01-01');
    await click('Capture'); await p.waitForTimeout(1500);
    check('loc: captured coords shown', await has('12.97160, 77.59460'), (await txt()).slice(-300));
    await p.waitForTimeout(500);
    await choose(comboOf('Vendor'), 'Acme');
    check('fill: vendor email auto-filled', (await inputOf('Vendor email').inputValue()) === 'acme@x.com');
    await choose(comboOf('Vendor'), 'Globex');
    check('fill: updates on change', (await inputOf('Vendor email').inputValue()) === 'globex@x.com');
    check('form: errors cleared after fixes/typing', !(await has('must be')));
    check('progress: complete', await has('3 of 3 required fields completed'));
    await p.screenshot({ path: `${SHOTS}/form_filled.png`, fullPage: true });

    await tid('submit').click(); await p.waitForURL(/\/records$/, { timeout: 8000 });
    check('submit: -> records route', true);
    await wait(600);
    check('toast: record saved', await has('Record saved'));
  });

  // ---------------------------------------------------------------- records
  await step('records', async () => {
    await p.waitForTimeout(1200);
    check('records: header + count', (await has('1 record')) && (await tid('add-record').count()) === 1);
    check('records: table columns', (await has('Employment type')) && (await has('Created')) && (await has('Showing 5 of 14 fields')));
    await rows().first().click(); await wait(600);
    const t = await tid('record-detail').innerText();
    check('records: detail drawer shows all data', t.includes('Acme Corp') && t.includes('globex@x.com') && t.includes('12.97160, 77.59460') && t.includes('2026-10-01') && t.includes('+919876543210') && t.includes('line1'), t.slice(0, 400));
    await p.screenshot({ path: `${SHOTS}/records_detail.png` });
    await p.getByLabel('Close panel').click({ position: { x: 5, y: 5 } }); await wait(500);
    check('records: drawer closes', (await tid('record-detail').count()) === 0);
    const recs = (await (await fetch(`${API}/api/structs/${structId}/records`)).json()).records;
    const d = recs[0].data;
    check('stored: numbers are numbers', d.days === 12 && d.budget === 99.5, JSON.stringify(d));
    check('stored: phone E.164', d.phone === '+919876543210', d.phone);
    check('stored: location obj', d.siteLocation?.lat === 12.9716);
    check('stored: fill value saved', d.vendorEmail === 'globex@x.com');
    check('stored: no __country junk', !Object.keys(d).some(k => k.includes('__')));
  });

  await step('minimal submit', async () => {
    await tid('add-record').click(); await p.waitForTimeout(1500);
    check('records: New record -> form route', /\/form$/.test(p.url()));
    await choose(comboOf('Employment type'), 'Full-time');
    await inputOf('Company name').fill('ShouldBeDropped');
    await choose(comboOf('Employment type'), 'Contract'); await wait(400);
    await inputOf('Days').fill('3');
    await inputOf('Start date').fill('2026-11-01');
    await tid('submit').click(); await p.waitForURL(/\/records$/, { timeout: 8000 });
    await p.waitForTimeout(1200);
    const recs = (await (await fetch(`${API}/api/structs/${structId}/records`)).json()).records;
    check('records: 2 saved', recs.length === 2, recs.length);
    const d = recs[0].data;
    check('hidden section value not saved', d.companyName === undefined && d.contractEnd === undefined, JSON.stringify(d));
    { const n = await rows().count(); const first = n ? (await rows().first().innerText()).replace(/\s+/g, ' ') : ''; check('records: 2 table rows, newest #2 first', n === 2 && first.includes('#2'), `${n} rows; first: ${first}`); }
    await vis(p.getByPlaceholder('Search records')).first().fill('Acme'); await wait(400);
    check('records: search filters', (await rows().count()) === 1 && (await rows().first().innerText()).includes('#1'));
    await vis(p.getByPlaceholder('Search records')).first().fill('zzzz'); await wait(400);
    check('records: search no match', await has('No records match'));
    await vis(p.getByPlaceholder('Search records')).first().fill('');
    await tid('add-record').click(); await p.waitForTimeout(1200);
    await click('Discard'); await p.waitForTimeout(900);
    check('form: Discard -> records', /\/records$/.test(p.url()));
  });

  // ---------------------------------------------------------------- edit a record
  await step('edit record', async () => {
    const list = async () => (await (await fetch(`${API}/api/structs/${structId}/records`)).json()).records;
    const before = (await list())[0]; // newest = #2 (Contract, 3 days)
    await rows().first().click(); await wait(600);
    check('edit record: drawer has Edit button', (await tid('edit-record').count()) === 1);
    await tid('edit-record').click(); await p.waitForTimeout(1800);
    check('edit record: route', new RegExp(`/structs/${structId}/record/${before.id}$`).test(p.url()), p.url());
    check('edit record: title + intro', (await has('Edit E2E Leave Request record')) && (await has('Update the details below')));
    check('edit record: values pre-filled', (await comboOf('Employment type').innerText()).includes('Contract') && (await inputOf('Days').inputValue()) === '3' && (await inputOf('Start date').inputValue()) === '2026-11-01');
    check('edit record: hidden section stays hidden', !(await has('Company name')));
    await choose(comboOf('Employment type'), 'Full-time'); await wait(500);
    check('edit record: condition reveals section', await has('Company name'));
    await inputOf('Company name').fill('Edited Co');
    await inputOf('Days').fill('4');
    await tid('submit').click(); await p.waitForURL(/\/records$/, { timeout: 8000 });
    await wait(700);
    check('toast: record updated', await has('Record updated'));
    const after = (await list()).find(r => r.id === before.id);
    check('edit record: data saved', after.data.days === 4 && after.data.companyName === 'Edited Co' && after.data.employmentType === 'Full-time', JSON.stringify(after.data));
    check('edit record: id + createdAt kept, modifiedAt bumped', after.id === before.id && after.createdAt === before.createdAt && after.modifiedAt > before.modifiedAt);
    check('edit record: still 2 records, list refreshed', (await list()).length === 2 && (await rows().count()) === 2 && (await rows().first().innerText()).includes('Full-time'));
    await rows().first().click(); await wait(600);
    check('edit record: drawer shows edited time', (await tid('record-detail').innerText()).includes('edited'));
    await p.getByLabel('Close panel').click({ position: { x: 5, y: 5 } }); await wait(500);

    // record #1 has selection / fill / location / mobile / multiline values: they must come back pre-filled
    await rows().last().click(); await wait(600);
    await tid('edit-record').click(); await p.waitForTimeout(2200);
    check('edit record: selection pre-selected', (await comboOf('Vendor').innerText()).includes('Globex'));
    check('edit record: fill hydrated', (await inputOf('Vendor email').inputValue()) === 'globex@x.com');
    check('edit record: location pre-filled', await has('Location captured'));
    check('edit record: mobile + number + multiline pre-filled', (await field('Phone').locator('xpath=following::input[1]').inputValue()) === '+919876543210' && (await inputOf('Budget').inputValue()) === '99.5' && (await p.locator('textarea').first().inputValue()).includes('line1'));
    await inputOf('Days').fill('');
    await tid('submit').click(); await wait(600);
    check('edit record: validation on required field, stays on page', (await has('Days is required')) && /\/record\//.test(p.url()));
    await click('Discard'); await p.waitForTimeout(900);
    check('edit record: Discard -> records, nothing changed', /\/records$/.test(p.url()) && (await list()).find(r => r.data.days === 12));
  });

  // ---------------------------------------------------------------- sidebar + definitions + edit
  await step('sidebar + definitions', async () => {
    await tid('nav-overview').click(); await p.waitForTimeout(1000);
    check('sidebar: Overview', p.url().replace(/\/$/, '') === APP);
    await vis(p.getByPlaceholder('Search structs')).first().fill('e2e leave'); await wait(400);
    check('sidebar: search filters', (await tid('nav-struct-E2E Leave Request').count()) >= 1 && (await tid('nav-struct-Test').count()) === 0);
    await vis(p.getByPlaceholder('Search structs')).first().fill('qqqq'); await wait(300);
    check('sidebar: search no match', await has('No structs match'));
    await vis(p.getByPlaceholder('Search structs')).first().fill(''); await wait(300);
    await tid('nav-struct-E2E Leave Request').first().click(); await p.waitForTimeout(1500);
    check('sidebar: click struct -> records in centre', new RegExp(`/structs/${structId}/records$`).test(p.url()) && (await has('2 records')));
    check('sidebar: active struct highlighted', (await tid('nav-struct-E2E Leave Request').first().getAttribute('aria-current')) === 'page');

    await tid('nav-definitions').click(); await p.waitForTimeout(1200);
    check('definitions: route + list', /\/structs$/.test(p.url()) && (await tid('def-E2E Leave Request').count()) >= 1);
    check('definitions: shows counts', (await has('14 fields')) && (await has('1 section')) && (await has('2 records')));
    await vis(p.getByPlaceholder('Search definitions')).first().fill('zzzz'); await wait(300);
    check('definitions: search no match', await has('No definitions match'));
    await vis(p.getByPlaceholder('Search definitions')).first().fill(''); await wait(300);
    await p.screenshot({ path: `${SHOTS}/definitions.png` });

    // edit the definition: rename a field (id must stay), add a field, keep old records valid
    await tid('def-E2E Leave Request').first().click(); await p.waitForTimeout(1500);
    check('edit: route + warning about existing records', /\/edit$/.test(p.url()) && (await has('already has 2 records')));
    check('edit: fields pre-filled', (await p.locator('[data-testid^="field-row-"]').count()) === 14 && (await tid('struct-name').inputValue()) === 'E2E Leave Request');
    await tid('field-row-7').click(); await p.waitForTimeout(500);
    check('edit: editor pre-filled', (await tid('field-name').inputValue()) === 'Notes');
    await tid('field-name').fill('Remarks');
    await tid('save-field').click(); await wait(400);
    await tid('add-field').click(); await tid('type-Short Text').click(); await tid('field-name').fill('Extra');
    await tid('save-field').click(); await wait(400);
    await tid('field-row-13').click(); await p.waitForTimeout(500);
    check('edit: condition restored (Days is greater than 10)', (await has('Show only when')) && (await has('Days')) && (await has('is greater than')));
    await click('Cancel'); await wait(400);
    await tid('save-struct').click(); await p.waitForURL(/\/structs$/, { timeout: 8000 });
    await wait(500);
    check('edit: saved -> definitions + toast', await has('Definition updated'));
    const def = (await (await fetch(`${API}/api/structs/${structId}`)).json()).struct;
    const f = Object.fromEntries(def.fields.map(x => [x.id, x]));
    check('edit: renamed field kept its id', f.notes?.label === 'Remarks' && !f.remarks, JSON.stringify(def.fields.map(x => x.id)));
    check('edit: new field added with generated id', f.extra?.label === 'Extra' && def.fields.length === 15);
    check('edit: section + conditions intact', def.sections.length === 1 && f.contractEnd?.condition?.field === 'days' && f.contractEnd.condition.value === 10 && f.companyName?.sectionId === def.sections[0].id);
    check('edit: modifiedAt set, createdAt kept', !!def.modifiedAt && !!def.createdAt);
    const recs = (await (await fetch(`${API}/api/structs/${structId}/records`)).json()).records;
    check('edit: existing records untouched', recs.length === 2 && recs.some(r => r.data.notes === 'line1\nline2'));
    await tid('nav-struct-E2E Leave Request').first().click(); await p.waitForTimeout(1500);
    await tid('edit-definition').click(); await p.waitForTimeout(1200);
    check('records: Edit definition button -> edit route', /\/edit$/.test(p.url()));
  });

  // ---------------------------------------------------------------- dropdown behaviour
  await step('dropdown', async () => {
    const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    const many = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'];
    const { structId: sid } = await post('/api/structs', { name: 'DropTest', fields: [
      { id: 'a', label: 'Small', type: 'list', options: ['red', 'blue'] },
      { id: 'b', label: 'Many', type: 'list', options: many },
    ] });
    await p.goto(APP + '/structs/' + sid + '/form'); await p.waitForTimeout(2500);
    await comboOf('Small').click(); await wait(300);
    check('dropdown: themed options (role=option), no search for short lists', (await vis(p.getByRole('option')).count()) === 3 && (await vis(p.getByPlaceholder('Search...')).count()) === 0);
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await wait(400);
    check('dropdown: keyboard arrows + enter selects', (await comboOf('Small').innerText()).includes('blue'));
    await comboOf('Small').click(); await wait(600);
    check('dropdown: selected option marked', (await vis(p.getByRole('option', { name: 'blue' })).first().getAttribute('aria-selected')) === 'true');
    await p.keyboard.press('Escape'); await wait(300);
    check('dropdown: Escape closes', (await vis(p.getByRole('option')).count()) === 0);
    await comboOf('Small').click(); await wait(300);
    await vis(p.getByRole('option', { name: 'Select...' })).first().click(); await wait(300);
    check('dropdown: placeholder row clears value', (await comboOf('Small').innerText()).includes('Select...'));
    await comboOf('Many').click(); await wait(300);
    check('dropdown: search box appears for long lists', (await vis(p.getByPlaceholder('Search...')).count()) === 1);
    await vis(p.getByPlaceholder('Search...')).first().fill('ech'); await wait(300);
    check('dropdown: search filters', (await vis(p.getByRole('option')).count()) === 2 && (await vis(p.getByRole('option', { name: 'Echo' })).count()) === 1);
    await vis(p.getByPlaceholder('Search...')).first().fill('zzz'); await wait(300);
    check('dropdown: search no matches', await has('No matches'));
    await p.keyboard.press('Escape'); await wait(300);
    await p.screenshot({ path: `${SHOTS}/dropdown.png` });
  });

  // ---------------------------------------------------------------- conditions (all operators)
  await step('operators', async () => {
    const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    const { structId: sid } = await post('/api/structs', { name: 'OpTest', fields: [
      { id: 'n', label: 'Num', type: 'wholeNumber' },
      { id: 'c', label: 'Colour', type: 'list', options: ['red', 'blue'] },
      { id: 'w', label: 'Words', type: 'text' },
      { id: 'ne', label: 'NotBlue', type: 'text', condition: { field: 'c', operator: 'notEquals', value: 'blue' } },
      { id: 'lt', label: 'SmallNum', type: 'text', condition: { field: 'n', operator: 'lt', value: 5 } },
      { id: 'gt', label: 'BigNum', type: 'text', condition: { field: 'n', operator: 'gt', value: 5 } },
      { id: 'ct', label: 'HasHello', type: 'text', condition: { field: 'w', operator: 'contains', value: 'hello' } },
      { id: 'eq', label: 'EqSeven', type: 'text', condition: { field: 'n', operator: 'equals', value: 7 } },
    ] });
    await p.goto(APP + '/structs/' + sid + '/form'); await p.waitForTimeout(2500);
    let t = await txt();
    check('op: notEquals true when unset', t.includes('NotBlue'));
    check('op: lt/gt/eq/contains hidden when unset', !t.includes('SmallNum') && !t.includes('BigNum') && !t.includes('EqSeven') && !t.includes('HasHello'), t);
    await choose(comboOf('Colour'), 'blue'); await wait(400);
    check('op: notEquals false when blue', !(await has('NotBlue')));
    await inputOf('Num').fill('3'); await wait(400);
    t = await txt(); check('op: lt shows at 3', t.includes('SmallNum') && !t.includes('BigNum'));
    await inputOf('Num').fill('7'); await wait(400);
    t = await txt(); check('op: gt+equals show at 7', t.includes('BigNum') && t.includes('EqSeven') && !t.includes('SmallNum'));
    await inputOf('Words').fill('say hello there'); await wait(400);
    check('op: contains shows', await has('HasHello'));
    await inputOf('Num').fill(''); await wait(400);
    t = await txt(); check('op: numeric ops hide when cleared', !t.includes('BigNum') && !t.includes('SmallNum'));

    const { structId: s2 } = await post('/api/structs', { name: 'BadApi', fields: [{ id: 'v', label: 'Thing', type: 'selection', apiUrl: 'http://localhost:4199/nope' }] });
    await p.goto(APP + '/structs/' + s2 + '/form'); await p.waitForTimeout(2500);
    check('selection: API failure shows error + Retry', (await has('Could not load options')) && (await has('Retry')));
    await p.goto(APP + '/structs/does-not-exist/form'); await p.waitForTimeout(2500);
    check('form: 404 struct shows error + retry', (await has('Struct not found')) && (await has('Retry')));
    await p.goto(APP + '/structs/does-not-exist/records'); await p.waitForTimeout(2500);
    check('records: 404 struct shows error', await has('Struct not found'));
  });

  // ---------------------------------------------------------------- narrow (phone) layout
  await step('narrow layout', async () => {
    const c2 = await b.newContext({ viewport: { width: 400, height: 860 } });
    const q = await c2.newPage();
    await q.goto(APP); await q.waitForTimeout(3000);
    check('narrow: home is the struct list', (await q.getByTestId('nav-struct-E2E Leave Request').count()) >= 1 && (await q.getByTestId('new-struct').count()) === 1);
    await q.getByTestId('nav-struct-E2E Leave Request').first().click(); await q.waitForTimeout(1500);
    const cards = q.locator('[data-testid^="record-"]:not([data-testid="record-detail"])');
    check('narrow: records as stacked cards (no table header)', (await cards.count()) === 2 && !(await q.innerText('body')).includes('Showing 5 of'));
    await cards.first().click(); await q.waitForTimeout(700);
    check('narrow: detail opens as bottom sheet', await q.getByTestId('record-detail').isVisible());
    await q.screenshot({ path: `${SHOTS}/narrow_detail.png` });
    await c2.close();
  });

  // ---------------------------------------------------------------- embedding (key, ref, component, iframe)
  await step('embedding', async () => {
    const H = { 'content-type': 'application/json' };
    // struct key resolves everywhere an id does
    let r = await fetch(`${API}/api/structs/e2e-leave`); const byKey = (await r.json()).struct;
    check('embed: GET struct by key', r.status === 200 && byKey.id === structId);
    r = await fetch(`${API}/api/structs`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Dup', key: 'e2e-leave', fields: [{ id: 'a', label: 'A', type: 'text' }] }) });
    check('embed: duplicate key -> 409', r.status === 409);
    r = await fetch(`${API}/api/structs`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Bad', key: '9x', fields: [{ id: 'a', label: 'A', type: 'text' }] }) });
    check('embed: invalid key -> 400', r.status === 400);
    const listed = (await (await fetch(`${API}/api/structs`)).json()).structs.find(s => s.id === structId);
    check('embed: list exposes key', listed.key === 'e2e-leave');
    const good = { employmentType: 'Contract', days: 4, startDate: '2026-12-01' };
    r = await fetch(`${API}/api/structs/e2e-leave/records`, { method: 'POST', headers: { ...H, 'X-Tstruct-User': 'crm-bot' }, body: JSON.stringify({ data: good, ref: 'order-7', meta: { src: 'api' } }) });
    const made = (await r.json()).record;
    check('embed: create record via key with ref/meta/user header', r.status === 201 && made.structId === structId && made.ref === 'order-7' && made.meta.src === 'api' && made.createdBy === 'crm-bot', JSON.stringify(made));
    let refd = (await (await fetch(`${API}/api/structs/e2e-leave/records?ref=order-7`)).json()).records;
    check('embed: filter records by ref', refd.length === 1 && refd[0].id === made.id);
    r = await fetch(`${API}/api/structs/e2e-leave/records`, { method: 'POST', headers: H, body: JSON.stringify({ data: good, ref: 123 }) });
    check('embed: non-string ref -> 400', r.status === 400);
    r = await fetch(`${API}/api/structs/e2e-leave/records/${made.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ data: good, ref: null }) });
    check('embed: PUT ref:null removes the link', (await r.json()).record.ref === undefined);

    // the studio accepts the key in URLs and shows it on the Definitions page
    await p.goto(`${APP}/structs/e2e-leave/form`); await p.waitForTimeout(2500);
    check('embed: studio form route accepts the key', await has('New E2E Leave Request record'));
    await tid('nav-definitions').click(); await p.waitForTimeout(1200);
    check('embed: key badge on Definitions page', await has('e2e-leave'));

    // <StructForm /> used by a host application (host-demo.html imports only the public package API)
    const hostUrl = (extra) => `${APP}/host-demo.html?struct=e2e-leave&ref=order-42${extra || ''}`;
    await p.goto(hostUrl('&values=' + encodeURIComponent('{"days":7}') + '&brand=green')); await p.waitForTimeout(3000);
    check('host component: renders form without the studio shell', (await has('Acme CRM')) && (await tid('nav-overview').count()) === 0);
    check('host component: initialValues pre-filled', (await inputOf('Days').inputValue()) === '7');
    const bg = await tid('submit').evaluate(el => getComputedStyle(el).backgroundImage);
    check('host component: brand override applied (green gradient)', bg.includes('79, 209, 165') || bg.includes('10, 125, 90'), bg);
    await choose(comboOf('Employment type'), 'Contract'); await inputOf('Start date').fill('2027-02-03');
    await tid('submit').click(); await p.waitForTimeout(1800);
    const ev = await tid('host-events').innerText();
    check('host component: onSubmitted fired with ref + user', /submitted new id=\S+ ref=order-42 by=host-user/.test(ev), ev);
    const hostRec = (await (await fetch(`${API}/api/structs/e2e-leave/records?ref=order-42`)).json()).records;
    check('host component: record stored with ref, meta, createdBy', hostRec.length === 1 && hostRec[0].meta.source === 'host-demo' && hostRec[0].createdBy === 'host-user' && hostRec[0].data.days === 7, JSON.stringify(hostRec[0]));
    check('host component: <RecordList recordRef> shows the linked record', (await rows().count()) === 1);
    // edit mode
    await p.goto(hostUrl(`&mode=edit&recordId=${hostRec[0].id}`)); await p.waitForTimeout(3000);
    check('host component: mode=edit pre-fills the record', (await inputOf('Days').inputValue()) === '7' && (await has('Save changes')));
    await inputOf('Days').fill('9'); await tid('submit').click(); await p.waitForTimeout(1800);
    check('host component: edit saved + event', /submitted edit id=/.test(await tid('host-events').innerText()) && (await (await fetch(`${API}/api/structs/e2e-leave/records/${hostRec[0].id}`)).json()).record.data.days === 9);

    // iframe variant: /embed page (no sidebar) + postMessage events
    await p.goto(hostUrl('&iframe=1')); await p.waitForTimeout(3500);
    const fr = p.frameLocator('[data-testid=host-iframe]');
    check('iframe: embed page has no studio chrome', (await fr.getByTestId('nav-overview').count()) === 0 && (await fr.getByTestId('submit').count()) === 1);
    let ev2 = await tid('host-events').innerText();
    check('iframe: host received ready + resize messages', ev2.includes('tstruct:ready') && ev2.includes('tstruct:resize'), ev2);
    await fr.locator('[role=combobox]').first().click(); await p.waitForTimeout(300);
    await fr.getByRole('option', { name: 'Contract', exact: true }).click(); await p.waitForTimeout(300);
    await fr.getByPlaceholder('0', { exact: true }).fill('2'); await fr.locator('input[type=date]').first().fill('2027-03-04');
    await fr.getByTestId('submit').click(); await p.waitForTimeout(2000);
    ev2 = await tid('host-events').innerText();
    check('iframe: host received tstruct:submitted with the record', /tstruct:submitted id=\S+/.test(ev2), ev2);
    const ifr = (await (await fetch(`${API}/api/structs/e2e-leave/records?ref=order-42`)).json()).records;
    check('iframe: record linked to the ref from the URL', ifr.length === 2, ifr.length);
    // records embed, filtered by ref
    await p.goto(`${APP}/embed/e2e-leave/records?ref=order-7`); await p.waitForTimeout(2500);
    check('embed page: records view filtered by ref', (await rows().count()) === 0 || (await rows().count()) === 1);
    await p.goto(`${APP}/embed/e2e-leave/records?ref=order-42`); await p.waitForTimeout(2500);
    check('embed page: records view shows the 2 linked records', (await rows().count()) === 2 && (await tid('nav-overview').count()) === 0);
  });

  // ---------------------------------------------------------------- api
  await step('server', async () => {
    const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => [r.status, await r.json()]);
    const put = (path, body) => fetch(API + path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => [r.status, await r.json()]);
    let [s] = await post('/api/structs', {}); check('api: struct no name -> 400', s === 400);
    [s] = await post('/api/structs', { name: 'x', fields: [] }); check('api: struct empty fields -> 400', s === 400);
    [s] = await post('/api/structs', { name: 'x', fields: [{ id: 'a', label: 'A', type: 'text' }, { id: 'a', label: 'B', type: 'text' }] }); check('api: duplicate field ids -> 400', s === 400);
    [s] = await post('/api/structs', { name: 'x', fields: [{ id: 'a', label: 'A', type: 'bogus' }] }); check('api: unknown field type -> 400', s === 400);
    [s] = await post(`/api/structs/${structId}/records`, { data: {} }); check('api: record missing required -> 400', s === 400);
    [s] = await post(`/api/structs/${structId}/records`, { data: { employmentType: 'Contract', days: 99, startDate: '2026-11-01' } }); check('api: record days>max -> 400', s === 400);
    [s] = await post(`/api/structs/${structId}/records`, { data: { employmentType: 'Full-time', days: 3, startDate: '2026-11-01' } });
    check('api: Full-time w/o company ok', s === 201);
    [s] = await post('/api/structs/nope/records', { data: {} }); check('api: record on missing struct -> 404', s === 404);
    const r = await fetch(`${API}/api/structs/${structId}/records/nope`); check('api: missing record -> 404', r.status === 404);
    const someRec = (await (await fetch(`${API}/api/structs/${structId}/records`)).json()).records[0];
    [s] = await put(`/api/structs/${structId}/records/${someRec.id}`, { data: {} }); check('api: PUT record missing required -> 400', s === 400);
    [s] = await put(`/api/structs/${structId}/records/nope`, { data: { employmentType: 'Contract', days: 3, startDate: '2026-11-01' } }); check('api: PUT missing record -> 404', s === 404);
    [s] = await put('/api/structs/nope/records/x', { data: {} }); check('api: PUT record on missing struct -> 404', s === 404);
    [s] = await put(`/api/structs/${structId}/records/${someRec.id}`, { data: someRec.data }); check('api: PUT record with unchanged data -> 200', s === 200);
    [s] = await put('/api/structs/nope', { name: 'x', fields: [{ id: 'a', label: 'A', type: 'text' }] }); check('api: PUT missing struct -> 404', s === 404);
    [s] = await put(`/api/structs/${structId}`, { name: '', fields: [] }); check('api: PUT invalid -> 400', s === 400);
    const list = (await (await fetch(`${API}/api/structs`)).json()).structs.find(x => x.id === structId);
    check('api: list has field/section/record counts + modifiedAt', list.fieldCount === 15 && list.sectionCount === 1 && list.recordCount === (await (await fetch(`${API}/api/structs/${structId}/records`)).json()).records.length && !!list.modifiedAt, JSON.stringify(list));
    const st = (await post('/api/structs', { name: 'T', fields: [{ id: 'm', label: 'M', type: 'mobile', required: true }] }))[1].structId;
    [s] = await post(`/api/structs/${st}/records`, { data: { m: 'abc' } }); check('api: invalid mobile rejected server-side', s === 400, s);
    const st2 = (await post('/api/structs', { name: 'T2', fields: [{ id: 'l', label: 'L', type: 'list', options: ['a', 'b'] }, { id: 't', label: 'T', type: 'time' }] }))[1].structId;
    [s] = await post(`/api/structs/${st2}/records`, { data: { l: 'zzz' } }); check('api: list value not in options rejected', s === 400, s);
    [s] = await post(`/api/structs/${st2}/records`, { data: { t: '99:99' } }); check('api: bad time rejected', s === 400, s);
  });

  const noise = errs.filter(e => !/404 \(Not Found\)|xx GET .*does-not-exist|xx \(selection\) http:\/\/localhost:4199|ERR_CONNECTION_REFUSED|Failed to load resource|\[warn\]/.test(e));
  console.log('\nUnexpected browser errors:', noise.length ? noise : 'none');

  // cleanup: remove every struct (and its records) created during this run
  try {
    const Redis = require('../server/node_modules/ioredis');
    const r = new Redis();
    let removed = 0;
    for (const id of await r.smembers('structs:index')) {
      if (existing.has(id)) continue;
      for (const rid of await r.smembers(`records:${id}:index`)) await r.del(`record:${id}:${rid}`);
      const sj = JSON.parse((await r.get(`struct:${id}`)) || '{}');
      if (sj.key) await r.hdel('structs:keys', sj.key);
      await r.del(`records:${id}:index`, `struct:${id}`); await r.srem('structs:index', id); removed++;
    }
    r.disconnect();
    console.log(`Cleanup: removed ${removed} structs created by this run`);
  } catch (e) { console.log('Cleanup skipped:', e.message); }

  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
