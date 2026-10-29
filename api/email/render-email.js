import { renderEmailTemplate } from './templates.js';

export { renderEmailTemplate, listEmailTemplates } from './templates.js';

export function renderEmail(templateId, data = {}) {
  return renderEmailTemplate(templateId, data);
}
