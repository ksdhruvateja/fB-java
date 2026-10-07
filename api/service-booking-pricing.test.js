import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePricingRules } from './pricing.js';
import { buildProfessionalDispatchBreakdown, validateServiceBookingPricing } from './professional-dispatch-pricing.js';
import { validateBookingSchedule } from './booking-schedule.js';

test('per-service prices use exact cents, conditional flat charges and fallback without mutating history',()=>{
 const input={booking_fee_cents:12500,professional_dispatch_pricing:{by_service:{plumbing:75125},additional_charges:[{key:'priority',label:'Priority',amount_cents:1234,enabled:true,basis:'flat',applies_when:'same-day',service_ids:['plumbing']},{key:'disabled',label:'Disabled',amount_cents:999,enabled:false,basis:'flat',applies_when:'always',service_ids:[]}]}};
 const original=JSON.stringify(input),rules=mergePricingRules(input);
 assert.equal(validateServiceBookingPricing(rules.professional_dispatch_pricing).ok,true);
 assert.equal(buildProfessionalDispatchBreakdown({category:'Plumbing',service_timing:'weekday'},rules).authorizedNowCents,75125);
 const specific=buildProfessionalDispatchBreakdown({category:'Plumbing',service_timing:'same-day'},rules);
 assert.equal(specific.authorizedNowCents,76359);assert.equal(specific.authorizedNow,763.59);assert.equal(specific.lines.length,2);
 assert.equal(buildProfessionalDispatchBreakdown({category:'Cleaning',service_timing:'same-day'},rules).authorizedNowCents,12500);
 assert.equal(JSON.stringify(input),original);
 for(const amount of [-1,NaN,Infinity,12.5,'12500',100000000])assert.equal(validateServiceBookingPricing({by_service:{plumbing:amount}}).ok,false);
 assert.equal(validateServiceBookingPricing({by_service:{plumbing:0}}).ok,true);
 for(const condition of ['unknown',undefined])assert.equal(validateServiceBookingPricing({additional_charges:[{...input.professional_dispatch_pricing.additional_charges[0],applies_when:condition}]}).ok,false);
 assert.equal(validateServiceBookingPricing({additional_charges:[input.professional_dispatch_pricing.additional_charges[0],input.professional_dispatch_pricing.additional_charges[0]]}).ok,false);
});
test('booking boundary rejects invalid/past dates, timing and arbitrary arrival windows',()=>{
 assert.equal(validateBookingSchedule({preferredDate:'2026-10-04'},'2026-10-03'),null);
 assert.equal(validateBookingSchedule({preferredDate:null},'2026-10-03'),null);
 for(const options of [{preferredDate:'2026-02-31'},{preferredDate:'2026-10-02'},{preferredDate:'2026-10-04junk'},{preferredTimeSlot:'custom'},{serviceTiming:'unapproved'}])assert.ok(validateBookingSchedule(options,'2026-10-03'));
});
