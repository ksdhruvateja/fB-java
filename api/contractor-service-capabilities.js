import { CONTRACTOR_SERVICE_OPTIONS } from '../shared/contractorServices.js';
const ids = new Set(CONTRACTOR_SERVICE_OPTIONS.map(s => s.id));
export function validateSelectedServiceIds(value) { return Array.isArray(value) && value.length <= ids.size && value.every(id => typeof id === 'string' && ids.has(id)) && new Set(value).size === value.length; }
export function contractorHasSelectedService(contractor, job) {
 let app = contractor?.contractor_application ?? contractor?.contractorApplication;
 if (typeof app === 'string') { try { app = JSON.parse(app); } catch { return false; } }
 if (!validateSelectedServiceIds(app?.selectedServiceIds)) return false;
 const explicit = job?.service_offering_id || job?.offering_id || job?.offeringId || job?.metadata?.offeringId;
 const category = String(job?.category || '').trim();
 const id = explicit || CONTRACTOR_SERVICE_OPTIONS.find(s => s.name.toLowerCase() === category.toLowerCase())?.id;
 return ids.has(id) && app.selectedServiceIds.includes(id);
}
