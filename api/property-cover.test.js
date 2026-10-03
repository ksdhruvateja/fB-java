import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import express from 'express';
import {ensurePropertyCoverColumns} from './schema-managed.js';
import {registerPropertyCoverRoutes,sanitizePropertyCover,MAX_PROPERTY_COVER_BYTES} from './property-cover.js';

test('cover processing bounds media and strips source metadata',async()=>{
  const source=await sharp({create:{width:80,height:60,channels:3,background:'#ffaa00'}}).jpeg().withMetadata({exif:{IFD0:{ImageDescription:'Fixture private metadata'}}}).toBuffer();
  assert.ok((await sharp(source).metadata()).exif);
  const output=await sanitizePropertyCover(`data:image/jpeg;base64,${source.toString('base64')}`);
  const meta=await sharp(output).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.exif,undefined);assert.equal(meta.xmp,undefined);
  const large=await sharp({create:{width:6001,height:32,channels:3,background:'#ffffff'}}).png().toBuffer();
  for(const data of ['https://example.invalid/photo.jpg','data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA',`data:image/png;base64,${source.toString('base64')}`,`data:image/png;base64,${large.toString('base64')}`,`data:image/jpeg;base64,${Buffer.alloc(MAX_PROPERTY_COVER_BYTES+1).toString('base64')}`]) await assert.rejects(sanitizePropertyCover(data),e=>e.code==='INVALID_PROPERTY_COVER');
});
test('cover selection persists separately per owner/property with private reads and reset',async()=>{
  const require=createRequire(import.meta.url),db=require('pg-mem').newDb(),{Pool}=db.adapters.createPg(),pool=new Pool();
  let server;
  try{
    await pool.query('CREATE TABLE properties(id INT PRIMARY KEY,owner_user_id INT); INSERT INTO properties VALUES(1,901),(2,901),(3,902)');
    await ensurePropertyCoverColumns(pool);
    const app=express();app.use(express.json({limit:'3mb'}));
    // Auth boundary fixture only; route authorization and SQL persistence are real.
    registerPropertyCoverRoutes(app,{pool,requireAuth:(req,_res,next)=>{req.authUser={id:Number(req.headers['x-fixture-user']),role:'homeowner'};next();}});
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    async function request(method,path,id,body){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json','x-fixture-user':String(id)},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
    assert.equal((await request('GET','/api/properties/1/cover',901)).body.cover.kind,'default');
    const png=await sharp({create:{width:80,height:60,channels:3,background:'#ffaa00'}}).png().toBuffer();
    const upload=await request('PUT','/api/properties/1/cover',901,{kind:'upload',dataUrl:`data:image/png;base64,${png.toString('base64')}`});assert.equal(upload.status,200,JSON.stringify(upload.body));assert.ok(upload.body.cover.imageDataUrl.startsWith('data:image/jpeg;base64,'));
    assert.equal((await request('PUT','/api/properties/2/cover',901,{kind:'stock',stockKey:'modern-home'})).status,200);
    assert.equal((await request('GET','/api/properties/1/cover',901)).body.cover.kind,'upload');
    assert.equal((await request('GET','/api/properties/2/cover',901)).body.cover.url,'/auth-homeowner.jpg');
    assert.equal((await request('GET','/api/properties/3/cover',902)).body.cover.kind,'default');
    for(const method of ['GET','PUT'])assert.equal((await request(method,'/api/properties/1/cover',902,method==='PUT'?{kind:'default'}:null)).status,404);
    assert.equal((await request('PUT','/api/properties/2/cover',901,{kind:'stock',stockKey:'https://foreign.invalid/image'})).status,400);
    assert.equal((await request('GET','/api/properties/2/cover',901)).body.cover.kind,'stock','invalid media cannot overwrite the saved cover');
    assert.equal((await request('PUT','/api/properties/1/cover',901,{kind:'default'})).status,200);
    const reset=(await pool.query('SELECT * FROM properties WHERE id=1')).rows[0];assert.equal(reset.cover_image,null);assert.equal(reset.cover_stock_key,null);assert.equal(reset.cover_kind,'default');
    assert.equal((await request('GET','/api/properties/1/cover/image',901)).status,404);
  }finally{if(server)await new Promise(r=>server.close(r));await pool.end();}
});
