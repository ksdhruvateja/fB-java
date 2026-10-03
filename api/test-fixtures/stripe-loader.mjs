// Used only by the isolated financial regression worker, never application code.
export async function resolve(specifier,context,nextResolve){
  if(specifier==='stripe')return {url:new URL('./offline-stripe.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
