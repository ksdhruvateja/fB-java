import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const bundled = await build({
  entryPoints: ['src/app/homeownerPropertyHealth.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm',
});

test('home setup and passport keep edits open when the server rejects a save', async () => {
  const entry = `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import HealthPanel from './src/app/HomeownerHealthPanel';
    import Passport from './src/app/HomeownerPropertyPassport';
    import {ProFeatureProvider} from './src/app/ProFeatureProvider';
    import {normalizeHealthProfile} from './src/app/homeownerPropertyHealth';
    window.__fail = true;
    function Fixture() {
      const [property,setProperty] = useState({id:101,addressLine1:'101 Fixture Lane',homeSystems:[],healthProfile:{onboardingComplete:false,systems:[]}});
      async function save(id,next) {
        if(window.__fail) throw new Error('Fixture server unavailable; your changes were not saved.');
        window.__saved = JSON.parse(JSON.stringify(normalizeHealthProfile(next)));
        setProperty(p=>({...p,healthProfile:window.__saved}));
      }
      return <ProFeatureProvider planCode="free" homeCareSubscription={{isPro:false,status:'inactive'}} onUpgrade={()=>{}}>
        <HealthPanel properties={[property]} jobs={[]} onSave={save} onAddProperty={async()=>null}/>
        <Passport properties={[property]} property={property} jobs={[]} initialSection="locations" onSaveHealth={save} onSaveProperty={async()=>true} onRefresh={async()=>{}} onOpenJob={()=>{}}/>
      </ProFeatureProvider>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `;
  const result = await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'}});
  const server = createServer((req,res)=>{
    if(req.url==='/fixture.js') {res.setHeader('Content-Type','application/javascript');res.end(result.outputFiles[0].text);}
    else {res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script src="/fixture.js"></script>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page = await browser.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('button',{name:'Skip for now',exact:true}).click();
    await page.getByRole('alert').getByText('Fixture server unavailable;', {exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Skip for now',exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>window.__saved),undefined);
    await page.evaluate(()=>window.__fail=false);
    await page.getByRole('button',{name:'Skip for now',exact:true}).click();
    await page.waitForFunction(()=>window.__saved?.onboardingComplete===true);
    assert.equal(await page.getByRole('button',{name:'Skip for now',exact:true}).count(),0);
    await page.getByRole('button',{name:'Add Important Location',exact:true}).click();
    await page.getByPlaceholder('Custom name').fill('Fixture shutoff');
    await page.evaluate(()=>window.__fail=true);
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Fixture server unavailable; your changes were not saved.',{exact:true}).waitFor();
    assert.equal(await page.getByPlaceholder('Custom name').inputValue(),'Fixture shutoff');
    await page.evaluate(()=>window.__fail=false);
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.waitForFunction(()=>window.__saved?.passport?.importantLocations?.[0]?.name==='Fixture shutoff');
    assert.equal(await page.getByPlaceholder('Custom name').count(),0);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
const health = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('saved passport and completed onboarding survive normalization and automatic health analysis', () => {
  const saved = {
    onboardingComplete: true,
    passport: {
      homeDetails: { floors: '2', heatingType: 'Heat pump' },
      importantLocations: [{ id: 'fixture-shutoff', name: 'Water shutoff', description: 'Garage wall' }],
      warranties: [{ id: 'fixture-warranty', name: 'Heat pump', expirationDate: '2028-01-01' }],
    },
    maintenance: [{ label: 'Change filter', dueDate: '2026-12-01', system: 'HVAC' }],
    previousServices: [{ id: 'fixture-service', title: 'HVAC inspection', system: 'HVAC' }],
  };
  const reloaded = JSON.parse(JSON.stringify(saved));
  const normalized = health.normalizeHealthProfile(reloaded);
  assert.deepEqual(normalized.passport, saved.passport);
  assert.equal(normalized.onboardingComplete, true);
  assert.equal(health.needsHealthOnboarding(normalized, 0), false);
  const analyzed = health.analyzePropertyHealthProfile({ id: 101, yearBuilt: 2005, healthProfile: reloaded, homeSystems: [] });
  assert.deepEqual(analyzed.passport, saved.passport);
  assert.deepEqual(analyzed.maintenance, saved.maintenance);
  assert.equal(analyzed.previousServices[0].id, 'fixture-service');
  assert.equal(analyzed.onboardingComplete, true);
});
