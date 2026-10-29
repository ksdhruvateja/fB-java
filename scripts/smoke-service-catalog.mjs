/**
 * Smoke tests for Snow Removal, Landscaping, and Cleaning service catalog.
 */

import {
  contractorTradesMatchCategory,
  formatServiceLabel,
  normalizeServiceSlug,
  TRADE_MATCH_TERMS,
} from '../api/service-catalog.js';

const tests = [
  {
    name: 'normalize snow removal slug',
    run: () => normalizeServiceSlug('Snow Removal') === 'snow_removal',
  },
  {
    name: 'normalize landscaping slug',
    run: () => normalizeServiceSlug('Landscaping & Yard') === 'landscaping',
  },
  {
    name: 'normalize cleaning slug',
    run: () => normalizeServiceSlug('Cleaning') === 'cleaning',
  },
  {
    name: 'format service label from slug',
    run: () => formatServiceLabel('snow_removal') === 'Snow Removal',
  },
  {
    name: 'snow job matches snow contractor',
    run: () => contractorTradesMatchCategory('Snow Removal', 'Snow Removal, Handyman'),
  },
  {
    name: 'snow job rejects plumbing-only contractor',
    run: () => !contractorTradesMatchCategory('Snow Removal', 'Plumbing'),
  },
  {
    name: 'landscaping job matches landscaping contractor',
    run: () => contractorTradesMatchCategory('Landscaping', 'Landscaping, Lawn Care'),
  },
  {
    name: 'landscaping job rejects plumbing-only contractor',
    run: () => !contractorTradesMatchCategory('Landscaping', 'Master Plumber'),
  },
  {
    name: 'cleaning job matches cleaning contractor',
    run: () => contractorTradesMatchCategory('Cleaning', 'Cleaning, Janitorial'),
  },
  {
    name: 'cleaning job rejects hvac-only contractor',
    run: () => !contractorTradesMatchCategory('Cleaning', 'HVAC'),
  },
  {
    name: 'legacy Snow trade matches snow removal job',
    run: () => contractorTradesMatchCategory('Snow Removal', 'Snow'),
  },
  {
    name: 'legacy Janitorial trade matches cleaning job',
    run: () => contractorTradesMatchCategory('Cleaning', 'Janitorial'),
  },
  {
    name: 'trade match terms include snow removal',
    run: () => Array.isArray(TRADE_MATCH_TERMS['Snow Removal']) && TRADE_MATCH_TERMS['Snow Removal'].includes('plow'),
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  try {
    const ok = Boolean(t.run());
    if (ok) {
      passed += 1;
      console.log(`PASS  ${t.name}`);
    } else {
      failed += 1;
      console.error(`FAIL  ${t.name}`);
    }
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${t.name}`, err);
  }
}

console.log(`\n${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
