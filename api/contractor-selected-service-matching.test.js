import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTRACTOR_SERVICE_OPTIONS } from '../shared/contractorServices.js';
import { contractorHasSelectedService, validateSelectedServiceIds } from './contractor-service-capabilities.js';
import { filterEligibleContractors, isContractorEligibleForJob } from './contractor-matching.js';
const offered = selectedServiceIds => ({role:'contractor',trade:'Licensed plumber',is_blocked:false,dispatch_eligible:true,compliance_status:'approved',service_zips:['78701'],contractor_application:{selectedServiceIds}});
const job={category:'Plumbing',zip:'78701'};
test('contractor canonical service list matches all 28 homeowner offerings',()=>{
 const source=readFileSync(new URL('../src/app/homeownerCategories.ts',import.meta.url),'utf8');
 const names=[...source.match(/export const HOMEOWNER_SERVICES\s*=\s*\[([\s\S]*?)\]/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 assert.equal(names.length,28);assert.deepEqual(CONTRACTOR_SERVICE_OPTIONS.map(s=>s.name),names);
 assert.equal(new Set(CONTRACTOR_SERVICE_OPTIONS.map(s=>s.id)).size,28);
});
test('zero, some and all selected services retain exact canonical boundaries',()=>{
 assert.equal(contractorHasSelectedService(offered([]),job),false);
 assert.equal(contractorHasSelectedService(offered(['plumbing']),job),true);
 assert.equal(contractorHasSelectedService(offered(['plumbing']),{category:'Electrical'}),false);
 const all=CONTRACTOR_SERVICE_OPTIONS.map(s=>s.id);assert(validateSelectedServiceIds(all));
 for(const option of CONTRACTOR_SERVICE_OPTIONS)assert(contractorHasSelectedService(offered(all),{category:option.name}));
});
test('unknown, duplicate, malformed and legacy selections fail closed without inferred trade qualification',()=>{
 for(const ids of [null,undefined,'plumbing',['unknown'],['plumbing','plumbing'],['plumbing',false]])assert.equal(validateSelectedServiceIds(ids),false);
 for(const c of [{trade:'Licensed plumber'}, {...offered(['plumbing']),contractor_application:'invalid'}, {...offered(['plumbing']),contractor_application:{primaryServices:['Plumbing']}}])assert.equal(contractorHasSelectedService(c,job),false);
 assert.equal(contractorHasSelectedService(offered(['plumbing']),{category:'Plumbing emergency special'}),false);
 assert.equal(contractorHasSelectedService(offered(['plumbing']),{category:'Plumbing',offeringId:'unknown'}),false);
 assert.equal(contractorHasSelectedService(offered(['plumbing']),{category:'Other'}),false);
});
test('selected service never bypasses verification, role, block, compliance or ZIP',()=>{
 assert(isContractorEligibleForJob(offered(['plumbing']),job));
 for(const patch of [{role:'homeowner'},{is_blocked:true},{dispatch_eligible:false},{dispatch_eligible:undefined},{compliance_status:'suspended'},{service_zips:['10001']},{service_zips:[]}])assert.equal(isContractorEligibleForJob({...offered(['plumbing']),...patch},job),false);
 assert.equal(isContractorEligibleForJob(offered([]),job,{requireCompliance:false}),false);
});
test('candidate filtering selects only declared verified providers without changing job/customer data',()=>{
 const c=offered(['plumbing']),excluded=offered([]),input={...job,full_address:'Private fixture address',contact_phone:'Private fixture phone'};
 const snapshot=JSON.stringify(input);assert.deepEqual(filterEligibleContractors([excluded,c],input),[c]);assert.equal(JSON.stringify(input),snapshot);assert.equal('full_address' in c,false);assert.equal('contact_phone' in c,false);
});

test('explicit services are authoritative for general contractors and absent legacy trade labels',()=>{
 assert(isContractorEligibleForJob({...offered(['garage_garage_doors']),trade:'General Contractor'},{category:'Garage & Garage Doors',zip:'78701'}));
 assert(isContractorEligibleForJob({...offered(['plumbing']),trade:null},job));
});

test('only persisted explicit temporary unavailability excludes candidates, with no inferred slot rules',()=>{
 assert.equal(isContractorEligibleForJob({...offered(['plumbing']),temporary_unavailable:true},job),false);
 for(const flag of [undefined,null,false])assert(isContractorEligibleForJob({...offered(['plumbing']),temporary_unavailable:flag},job));
});
