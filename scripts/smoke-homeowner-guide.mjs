import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const built = await build({ entryPoints: [new URL('../src/app/diy/HomeownerDiyExperience.tsx', import.meta.url).pathname.replace(/^\/(?:[A-Z]:)/i, match => match.slice(1))], bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' }, write: false });
const loaded = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, loaded, loaded.exports);
const Component = loaded.exports.default;
const noop = () => {};
const defaults = {
  userName: 'Fixture', jobId: 9001, title: 'Inspect an appliance filter', category: 'Appliances', risk: 'green',
  steps: ['Inspect the accessible filter without removing covers.'], guideSteps: [],
  tools: [{ name: 'Flashlight', required: true, reason: 'Read the label' }],
  materials: [{ name: 'Compatible filter', required: false, reason: 'Only after checking the model', exact_part_confirmed: false, information_needed: ['Model number'] }],
  causes: [], stopConditions: [], stepIndex: 0, completed: {}, bookmarked: false, savingStep: false, stepSaved: false,
  chatMessages: [], chatInput: '', chatBusy: false, chatBlocked: false, speakingText: null, view: 'step',
  onBack: noop, onOpenStep: noop, onOpenIdeas: noop, onCompleteStep: noop, onConfirmFixed: noop, onStillBroken: noop,
  onToggleBookmark: noop, onHire: noop, onNotComfortable: noop, onChatInput: noop, onSendChat: noop, onSpeak: noop, onUnsafeChat: noop, onView: noop,
};
const render = overrides => renderToStaticMarkup(React.createElement(Component, { ...defaults, ...overrides }));
let html = render({});
assert.match(html, /aria-label="Repair steps"/);
assert.match(html, /Step 1:/);
assert.match(html, /Tools needed/);
assert.match(html, /Parts and materials/);
assert.match(html, /Compatible filter/);
assert.match(html, /Exact part not confirmed/);
assert.doesNotMatch(html, /This check confirms the cause/);
console.log('PASS numbered instructions, separate tools and parts, part uncertainty, no invented explanation');
html = render({ tools: [] });
assert.match(html, /Tools not specified in this assessment/);
assert.ok(html.indexOf('Compatible filter') > html.indexOf('Parts and materials'));
console.log('PASS parts are not substituted for missing tools');
html = render({ steps: [], guideSteps: [{ title: 'Inspect label', instruction: 'Read the model number from the accessible label.' }] });
assert.match(html, /Step 1: Inspect label/);
assert.match(html, /Read the model number/);
console.log('PASS structured instructions remain usable without the legacy steps array');
html = render({ steps: [], guideSteps: [{ title: 'Title only' }] });
assert.match(html, /More information needed before DIY/);
assert.doesNotMatch(html, /I completed this step|It worked/);
console.log('PASS missing instructions cannot be marked completed');
for (const view of ['step', 'ideas', 'home']) {
  html = render({ risk: 'red', steps: ['Dangerous injected instruction'], view });
  assert.doesNotMatch(html, /Dangerous injected instruction/);
  assert.match(html, /professional help/);
}
console.log('PASS professional-only risk hides repair instructions in every DIY view');
