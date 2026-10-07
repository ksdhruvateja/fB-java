import { getStoredToken } from "./auth";
export type PropertyCover = {kind:"default"|"stock"|"upload";stockKey:string|null;url:string|null;version:string|null;imageDataUrl?:string};
export type PropertyCoverStock = {key:string;label:string;url:string};
type CoverResult={ok:boolean;cover?:PropertyCover;stock?:PropertyCoverStock[];message?:string};
const inflight=new Map<string,Promise<CoverResult>>();
async function request(path:string,body?:unknown):Promise<CoverResult>{
  const token=getStoredToken();if(!token)return {ok:false,message:"Sign in again to access your saved property cover."};
  const key=token+"|"+path;if(body===undefined&&inflight.has(key))return inflight.get(key)!;
  const run=(async()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(path,{signal:controller.signal,method:body===undefined?"GET":"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json().catch(()=>null);if(getStoredToken()!==token)return {ok:false,message:"Your sign-in changed. Reload before accessing this cover."};return response.ok&&data?.ok?data:{ok:false,message:data?.message||"Could not load or save the cover. Your existing property records are unchanged."};}catch{return {ok:false,message:"Connection unavailable. Retry to access your saved property cover."};}finally{clearTimeout(timer);}})();
  if(body===undefined){inflight.set(key,run);void run.finally(()=>{if(inflight.get(key)===run)inflight.delete(key);});}return run;
}
export const getPropertyCover=(id:number)=>request(`/api/properties/${id}/cover`);
export const getPropertyCoverOptions=()=>request("/api/property-cover-options");
export const savePropertyCover=(id:number,value:{kind:"default"}|{kind:"stock";stockKey:string}|{kind:"upload";dataUrl:string})=>request(`/api/properties/${id}/cover`,value);
export async function preparePropertyCover(file:File):Promise<string>{
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Choose a JPG, PNG, or WebP photo.");
  if(file.size>12*1024*1024)throw Error("Choose a photo smaller than 12 MB.");
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error("This photo could not be read. Choose another JPG, PNG, or WebP.");});
  try{if(bitmap.width<32||bitmap.height<32||bitmap.width*bitmap.height>16000000)throw Error("Choose an image at least 32 pixels wide and under 16 megapixels.");const scale=Math.min(1,1400/bitmap.width,900/bitmap.height);const canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext("2d");if(!ctx)throw Error("Photo preparation is unavailable in this browser.");ctx.fillStyle="#f6f1e9";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL("image/jpeg",.82);if(data.length>2*1024*1024)throw Error("Choose a smaller photo.");return data;}finally{bitmap.close();}
}
