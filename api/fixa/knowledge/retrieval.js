import { knowledgeForTask } from './fixbridgeKnowledge.js';

export function retrieveKnowledge(task) {
  return knowledgeForTask(task);
}
