/**
 * Mobile/tablet viewport smoke — overflow + key nav presence.
 */
import { chromium } from 'playwright';
import { loginHomeowner, loginAdminWithMfa } from './smoke-auth.mjs';

const APP = process.env.APP_URL || 'http://localhost:5000';
const WIDTHS = [320, 360, 375, 390, 414, 430, 768, 1024];

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function openDashboard(page, token, user, dashboardPage) {
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ t, u, p }) => {
      localStorage.setItem('fixbridge-auth-token', t);
      localStorage.setItem('fixbridge-user-cache', JSON.stringify(u));
      localStorage.setItem('fixbridge-app-state', JSON.stringify({ page: p, marketingContext: 'home' }));
    },
    { t: token, u: user, p: dashboardPage }
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}

async function checkHomeowner(page, w) {
  const metrics = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    text: document.body?.innerText || '',
  }));
  const overflow = metrics.scrollW > metrics.clientW + 12;
  record(`HO@${w}px no overflow`, !overflow, overflow ? `scroll=${metrics.scrollW}` : 'ok');
  const hasNav = /Home|Jobs|Inbox|More|Request/i.test(metrics.text);
  record(`HO@${w}px bottom nav labels`, hasNav, hasNav ? 'found' : 'missing');
}

async function checkAdmin(page, w) {
  const metrics = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    text: document.body?.innerText || '',
  }));
  const overflow = metrics.scrollW > metrics.clientW + 12;
  record(`Admin@${w}px no overflow`, !overflow);
  record(`Admin@${w}px renders`, metrics.text.length > 100, `chars=${metrics.text.length}`);
}

async function main() {
  console.log(`\n=== Mobile/Tablet QA @ ${APP} ===\n`);
  const browser = await chromium.launch({ headless: true });
  const ho = await loginHomeowner();
  const admin = await loginAdminWithMfa();

  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    await openDashboard(page, ho.token, ho.user, 'homeowner-dashboard');
    await checkHomeowner(page, w);
    await ctx.close();
  }

  for (const w of [768, 1024]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await openDashboard(page, admin.token, admin.user, 'admin');
    await checkAdmin(page, w);
    await ctx.close();
  }

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- Mobile QA: ${passed}/${results.length} passed ---\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
