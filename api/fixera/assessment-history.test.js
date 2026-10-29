import assert from 'node:assert/strict';
import test from 'node:test';
import { appendAssessmentRevision } from './assessment-history.js';

test('assessment revisions preserve the initial hypothesis and bound history', () => {
  const initial = { summary: 'Likely fan issue', confidence: 0.72 };
  const revised = { summary: 'The new observation suggests a blocked vent', confidence: 0.8 };
  const first = appendAssessmentRevision([], initial, '2026-09-30T10:00:00Z');
  const second = appendAssessmentRevision(first, revised, '2026-09-30T11:00:00Z');

  assert.equal(first[0].kind, 'AI_INITIAL_HYPOTHESIS');
  assert.deepEqual(first[0].assessment, initial);
  assert.equal(second[1].kind, 'AI_REASSESSMENT');
  assert.deepEqual(second[1].assessment, revised);
  assert.equal(second.length, 2);
  assert.equal(appendAssessmentRevision('not-json', null).length, 0);
});