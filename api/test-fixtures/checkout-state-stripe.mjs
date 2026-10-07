export const sessions = new Map();
export const retrieved = [];
export default class OfflineCheckoutStripe {
  constructor() {
    this.checkout={sessions:{retrieve:async id=>{retrieved.push(id);if(!sessions.has(id))throw Error('Offline session unavailable');return sessions.get(id);}}};
    this.subscriptions={retrieve:async id=>({id,status:'trialing',current_period_end:Math.floor(Date.now()/1000)+604800})};
    this.webhooks={constructEvent:(raw,signature)=>{if(signature!=='offline-fixture-signature')throw Error('Invalid offline signature');return JSON.parse(String(raw));}};
  }
}
