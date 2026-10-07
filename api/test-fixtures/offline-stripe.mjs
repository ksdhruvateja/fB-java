export const checkoutCalls=[];
export const refundCalls=[];
export default class OfflineStripe {
  constructor(){
    this.checkout={sessions:{create:async(params,options)=>{checkoutCalls.push({params,options});return {id:'cs_offline_fixture',url:'https://checkout.example.invalid/fixture'};}}};
    this.refunds={create:async params=>{refundCalls.push(params);return {id:'re_offline_fixture'};}};
  }
}
