const Stripe = require('stripe');
const { getSupabase, json } = require('./_shared/supabase');
const TYPES = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed']);
function statusFor(session, type) {
  if (session.status === 'complete' && ['paid','no_payment_required'].includes(session.payment_status)) return 'paid';
  return type === 'checkout.session.async_payment_failed' ? 'failed' : 'pending';
}
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405,{error:'Method not allowed'});
  const current={key:process.env.STRIPE_SECRET_KEY,secret:process.env.STRIPE_WEBHOOK_SECRET,id:process.env.STRIPE_ACCOUNT_ID};
  const legacy={key:process.env.STRIPE_LEGACY_SECRET_KEY,secret:process.env.STRIPE_LEGACY_WEBHOOK_SECRET,id:process.env.STRIPE_LEGACY_ACCOUNT_ID};
  let verified,api,account;
  const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64'):event.body;
  for(const candidate of [current,legacy]) {
    if(!candidate.key||!candidate.secret||!candidate.id)continue;
    try { const stripe=new Stripe(candidate.key);verified=stripe.webhooks.constructEvent(raw,event.headers?.['stripe-signature']||event.headers?.['Stripe-Signature'],candidate.secret);api=stripe;account=candidate.id;break; } catch(_) { /* Try the configured legacy endpoint during account transition. */ }
  }
  if(!verified)return json(400,{error:'Invalid webhook signature'});
  if(!TYPES.has(verified.type))return json(200,{received:true});
  if(verified.data.object.metadata?.source!=='gmf-productions-website')return json(200,{received:true,ignored:true});
  const db=getSupabase();if(!db)return json(503,{error:'Order storage unavailable'});
  try {
    const session=await api.checkout.sessions.retrieve(verified.data.object.id);
    const lines=[];
    for await(const line of api.checkout.sessions.listLineItems(session.id,{limit:100,expand:['data.price.product']})) {
      const product=line.price?.product;
      lines.push({description:line.description,quantity:line.quantity,amount_subtotal:line.amount_subtotal,amount_total:line.amount_total,currency:line.currency,sku:product?.metadata?.gmf_sku||product?.metadata?.sku||null,legacySessionSkus:session.metadata?.skus?session.metadata.skus.split(',').filter(Boolean):undefined,size:product?.metadata?.size||null,color:product?.metadata?.garment_color||null,artworkColorway:product?.metadata?.artwork_colorway||null,stripe_price_id:line.price?.id,stripe_product_id:typeof product==='string'?product:product?.id});
    }
    const {error}=await db.rpc('gmf_record_order',{p_order:{stripe_account_id:account,stripe_session_id:session.id,stripe_payment_intent:session.payment_intent,customer_email:session.customer_details?.email||session.customer_email,customer_details:session.customer_details,shipping_details:session.collected_information?.shipping_details||session.shipping_details||null,amount_total:session.amount_total,currency:session.currency,line_items:lines,status:statusFor(session,verified.type),stripe_event_id:verified.id,event_created:verified.created}});
    if(error)throw error;
    return json(200,{received:true});
  }catch(err){console.error('Order persistence failed:',err.code||err.type||'error');return json(503,{error:'Order could not be recorded; retry required'});}
};
exports.statusFor=statusFor;
