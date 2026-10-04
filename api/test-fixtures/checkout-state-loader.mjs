// Only the isolated checkout regression worker imports this loader.
export async function resolve(specifier,context,nextResolve) {
  if(specifier==='stripe')return {url:new URL('./checkout-state-stripe.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
