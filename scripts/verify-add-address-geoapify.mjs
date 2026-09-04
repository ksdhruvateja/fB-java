import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://127.0.0.1:5000';
const API = process.env.API_BASE_URL;
const email = process.env.TEST_HOMEOWNER_EMAIL;
const password = process.env.TEST_HOMEOWNER_PASSWORD;

function record(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

const login = await fetch(`${API}/api/auth/signin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'homeowner', email, password }),
}).then((r) => r.json());

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const hits = [];
page.on('response', (res) => {
  if (res.url().includes('/address/autocomplete')) hits.push(res.status());
});

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate(
  ({ token, user }) => {
    localStorage.setItem('fixbridge-auth-token', token);
    localStorage.setItem('fixbridge-user-cache', JSON.stringify(user));
    localStorage.setItem(
      'fixbridge-app-state',
      JSON.stringify({ page: 'homeowner-dashboard', marketingContext: 'home' })
    );
  },
  { token: login.token, user: login.user }
);
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

await page.getByRole('button', { name: /^Request Service$/i }).first().click();
await page.waitForTimeout(700);
await page.getByPlaceholder(/water is leaking/i).fill('Water leaking under sink needs repair now.');
await page.waitForTimeout(300);

// describe -> location
await page.getByRole('button', { name: /^Continue$/i }).first().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: /^Kitchen$/i }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Continue$/i }).first().click();
await page.waitForTimeout(1000);

record(
  'Details step has Add a new address',
  (await page.getByRole('button', { name: /add a new address/i }).count()) > 0
);
await page.getByRole('button', { name: /add a new address/i }).click();
await page.waitForTimeout(700);

const modalOpen = (await page.getByText('Add New Address').count()) > 0;
record('Modal/page opens', modalOpen);
if (!modalOpen) {
  console.log((await page.locator('body').innerText()).slice(0, 1500));
  await browser.close();
  process.exit(1);
}

const line1 = page.locator('#add-address-line1');
await line1.waitFor({ state: 'visible' });
await line1.focus();
await page.keyboard.type('131 Continental', { delay: 40 });
await page.waitForSelector('[role="option"]', { timeout: 15000 });
record('Autocomplete request', hits.some((s) => s === 200), `statuses=${hits.join(',') || 'none'}`);
const option = page.locator('[role="option"]').first();
const suggestionsVisible = await option.isVisible().catch(() => false);
record('Suggestions', suggestionsVisible, `opts=${await page.locator('[role=option]').count()}`);

if (suggestionsVisible) {
  await option.click();
  await page.waitForTimeout(500);
  const street = await line1.inputValue();
  record('Selection', true);
  record('Street', street.trim().length >= 3, street);
  const zip = await page.locator('input[autocomplete="postal-code"]').first().inputValue();
  const stateText = await page
    .locator('label')
    .filter({ hasText: /^State/ })
    .locator('button')
    .innerText();
  const cityText = await page
    .locator('label')
    .filter({ hasText: /^City/ })
    .locator('button')
    .innerText();
  record('City', Boolean(cityText && !/select state|search city/i.test(cityText)), cityText);
  record('State', Boolean(stateText && !/search state/i.test(stateText)), stateText);
  record('ZIP', /^\d{5}/.test(zip), zip);
  await page.locator('#add-address-line2').fill('Apt 2B');
  record('Address Line 2', (await page.locator('#add-address-line2').inputValue()) === 'Apt 2B');
  await line1.fill('99 Manual Lane');
  record('Manual fallback', (await line1.inputValue()) === '99 Manual Lane');

  await line1.fill('');
  await page.keyboard.type('131 Continental', { delay: 40 });
  await page.waitForSelector('[role="option"]', { timeout: 15000 });
  await page.locator('[role=option]').first().click();
  const suite = `Suite UI ${Date.now().toString().slice(-4)}`;
  await page.locator('#add-address-line2').fill(suite);
  await page.getByRole('button', { name: /^Save Address$/i }).click();
  await page.waitForTimeout(2800);
  record('Save', (await page.getByText('Add New Address').count()) === 0);

  const listed = await fetch(`${API}/api/properties`, {
    headers: { Authorization: `Bearer ${login.token}` },
  }).then((r) => r.json());
  record(
    'Refresh persistence',
    (listed.properties || []).some((p) => String(p.addressLine2 || '') === suite),
    suite
  );
}

await page.screenshot({ path: 'tmp/add-address-modal-ok.png' });
await browser.close();
console.log('\nDone.\n');
