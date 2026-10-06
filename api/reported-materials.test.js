import test from 'node:test';
import assert from 'node:assert/strict';
import {reportedMaterials} from './reported-materials.js';
test('material names retain reported provenance without inferring quantities or prices',()=>{
 assert.deepEqual(reportedMaterials({materialsUsed:'Filter; seal\nFilter'}),['Filter','seal']);
 assert.deepEqual(reportedMaterials({materialsUsed:'legacy',partsUsed:[{name:'Recorded part',price:42},null,'Recorded part']}),['Recorded part']);
 assert.equal(reportedMaterials({materialsUsed:Array(25).fill(0).map((_,n)=>`part ${n}`).join(';')}).length,12);
 assert.deepEqual(reportedMaterials({}),[]);
});
