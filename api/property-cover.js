import sharp from 'sharp';
import {randomUUID} from 'node:crypto';

// Existing first-party sample assets; never accept a client-controlled URL.
export const PROPERTY_COVER_STOCK = Object.freeze([
  {key:'modern-home',label:'Modern home · sample image',url:'/auth-homeowner.jpg'},
  {key:'renovation',label:'Renovation · sample image',url:'/hero-homeowner.png'},
]);
export const MAX_PROPERTY_COVER_BYTES=2*1024*1024;
const invalid=message=>Object.assign(new Error(message),{status:400,code:'INVALID_PROPERTY_COVER'});
export function propertyCoverDto(row,{includeImage=false}={}) {
  const stock=PROPERTY_COVER_STOCK.find(item=>item.key===row?.cover_stock_key);
  if(row?.cover_kind==='stock'&&stock)return {kind:'stock',stockKey:stock.key,url:stock.url,version:row.cover_version||null};
  if(row?.cover_kind==='upload'&&row.cover_image)return {kind:'upload',stockKey:null,url:`/api/properties/${Number(row.id)}/cover/image`,version:row.cover_version||null,
    ...(includeImage?{imageDataUrl:`data:image/jpeg;base64,${Buffer.from(row.cover_image).toString('base64')}`}:{})};
  return {kind:'default',stockKey:null,url:null,version:row?.cover_version||null};
}
export async function sanitizePropertyCover(dataUrl) {
  const match=typeof dataUrl==='string'&&dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||match[2].length%4!==0||dataUrl.length>Math.ceil(MAX_PROPERTY_COVER_BYTES*4/3)+100)throw invalid('Choose a JPEG, PNG or WebP image up to 2 MB.');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>MAX_PROPERTY_COVER_BYTES||bytes.toString('base64')!==match[2])throw invalid('The image encoding is invalid or too large.');
  try {
    const decoder=sharp(bytes,{limitInputPixels:16000000,failOn:'warning',animated:false});
    const meta=await decoder.metadata();
    if(meta.format!==match[1]||!meta.width||!meta.height||meta.width<32||meta.height<32||meta.width>6000||meta.height>6000||(meta.pages||1)>1)throw invalid('Choose a still photo between 32 and 6000 pixels per side.');
    // Re-encoding strips EXIF, GPS, XMP and other original metadata by default.
    const result=await decoder.rotate().resize({width:1400,height:900,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80,mozjpeg:true}).toBuffer();
    if(result.length>500000)throw invalid('Choose a smaller photo after compression.');
    return result;
  }catch(failure){if(failure.code==='INVALID_PROPERTY_COVER')throw failure;throw invalid('This image could not be decoded safely.');}
}
export function registerPropertyCoverRoutes(app,{pool,requireAuth}) {
  app.get('/api/property-cover-options',requireAuth,(_req,res)=>res.json({ok:true,stock:PROPERTY_COVER_STOCK}));
  async function owned(req,res) {
    const id=Number(req.params.id);
    if(req.authUser.role!=='homeowner'||!Number.isSafeInteger(id)||id<=0){res.status(403).json({ok:false,code:'PROPERTY_COVER_NOT_OWNER',message:'Property owner access is required.'});return null;}
    const row=(await pool.query('SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2',[id,req.authUser.id])).rows[0];
    if(!row){res.status(404).json({ok:false,code:'PROPERTY_NOT_FOUND',message:'Property not found.'});return null;}
    return row;
  }
  app.get('/api/properties/:id/cover',requireAuth,async(req,res)=>{
    try{const row=await owned(req,res);if(row)res.json({ok:true,cover:propertyCoverDto(row,{includeImage:true})});}
    catch{res.status(500).json({ok:false,message:'Could not load property cover.'});}
  });
  app.get('/api/properties/:id/cover/image',requireAuth,async(req,res)=>{
    try{const row=await owned(req,res);if(!row)return;if(row.cover_kind!=='upload'||!row.cover_image)return res.status(404).json({ok:false,message:'No uploaded cover.'});
      res.set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff').type('image/jpeg').send(Buffer.from(row.cover_image));}
    catch{res.status(500).json({ok:false,message:'Could not load property cover.'});}
  });
  app.put('/api/properties/:id/cover',requireAuth,async(req,res)=>{
    try{
      const row=await owned(req,res);if(!row)return;
      const kind=String(req.body?.kind||'');let stockKey=null,image=null;
      if(kind==='stock'){stockKey=String(req.body?.stockKey||'');if(!PROPERTY_COVER_STOCK.some(item=>item.key===stockKey))throw invalid('Choose an available sample image.');}
      else if(kind==='upload')image=await sanitizePropertyCover(req.body?.dataUrl);
      else if(kind!=='default')throw invalid('Choose an upload, sample image, or default cover.');
      const updated=(await pool.query('UPDATE properties SET cover_kind=$3,cover_stock_key=$4,cover_image=$5,cover_version=$6 WHERE id=$1 AND owner_user_id=$2 RETURNING *',[row.id,req.authUser.id,kind,stockKey,image,randomUUID()])).rows[0];
      if(!updated)return res.status(404).json({ok:false,message:'Property not found.'});
      return res.json({ok:true,cover:propertyCoverDto(updated,{includeImage:true})});
    }catch(failure){res.status(failure.status||500).json({ok:false,code:failure.code||'PROPERTY_COVER_SAVE_FAILED',message:failure.status===400?failure.message:'Could not save property cover.'});}
  });
}
