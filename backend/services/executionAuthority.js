'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {fingerprint}=require('./modelRegistry');
const {canonicalExecutionPayload}=require('./executionContract');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function sealIntent(intent) {
  const payload={...canonicalExecutionPayload(intent),orderType:String(intent.orderType || 'MARKET').toUpperCase(),timeInForce:intent.timeInForce || null,experimentId:intent.experimentId || null,configFingerprint:intent.configFingerprint || null,candidateFingerprint:intent.candidateFingerprint || null,candidatePolicy:intent.candidatePolicy || null};
  return Object.freeze({version:'enforced-3',payload:Object.freeze(payload),hash:fingerprint(payload)});
}
function verifyIntent(intent,seal) {return !!seal && seal.hash===sealIntent(intent).hash && fingerprint(seal.payload)===seal.hash;}
function validateRules(intent,rules,external=false) {
  const reasons=[];const quantity=Number(intent.quantity ?? intent.amount),price=Number(intent.entryPrice);
  if(!['BUY','SELL'].includes(String(intent.side).toUpperCase()))reasons.push('invalid-side');
  if(!(quantity>0) || !(price>0) || !Number.isFinite(quantity) || !Number.isFinite(price))reasons.push('invalid-quantity-price');
  if(!intent.decisionId)reasons.push('missing-stable-decision-id');
  if(external && (!rules?.verified || rules.symbol!==intent.symbol || rules.venue!==String(intent.venue).toLowerCase() || !Number.isFinite(Number(rules.fetchedAt)) || Number(rules.fetchedAt)>Date.now()+5000 || Date.now()-rules.fetchedAt>300000))reasons.push('missing-fresh-exchange-rules');
  if(rules) {
    const step=Number(rules.stepSize),tick=Number(rules.tickSize);
    const aligned=(v,s)=>!(s>0) || Math.abs(v/s-Math.round(v/s))<=1e-6;
    if(!aligned(quantity,step))reasons.push('quantity-precision');
    if(intent.orderType==='LIMIT' && !aligned(price,tick))reasons.push('price-precision');
    if(rules.marketLot && (intent.orderType || 'MARKET')==='MARKET'){const lot=rules.marketLot;if(!aligned(quantity,Number(lot.stepSize)) || quantity<Number(lot.minQty) || (Number(lot.maxQty)>0 && quantity>Number(lot.maxQty)))reasons.push('market-lot-limits');}
    if(quantity<Number(rules.minQty || 0) || (rules.maxQty && quantity>rules.maxQty))reasons.push('quantity-limits');
    if(quantity*price<Number(rules.minNotional || 0))reasons.push('min-notional');
    if(!Array.isArray(rules.orderTypes) || !rules.orderTypes.includes(intent.orderType || 'MARKET'))reasons.push('unsupported-order-type');
  }
  return {passed:!reasons.length,reasons};
}
// Shared-disk only. Distributed/cloud submits use the PostgreSQL RPC store below.
class FileAuthorityStore {
  constructor(file){this.file=file;fs.mkdirSync(path.dirname(file),{recursive:true});}
  async command(action,args={}) {
    const lock=this.file+'.lock';let acquired=false;
    for(let i=0;i<80;i++) {try{fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'pid'),String(process.pid));acquired=true;break;}catch(error){if(error.code!=='EEXIST')throw error;
      try{const pid=Number(fs.readFileSync(path.join(lock,'pid'),'utf8'));try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')fs.rmSync(lock,{recursive:true,force:true});}}catch{}
      await sleep(5);}}
    if(!acquired)throw new Error('AUTHORITY_STORE_BUSY');
    try {let state={token:0,owner:null,expires:0,orders:{}};try{state=JSON.parse(fs.readFileSync(this.file));if(!state || !state.orders || typeof state.orders!=='object' || !Number.isFinite(state.token))throw new Error('INVALID_AUTHORITY_LEDGER');}catch(error){if(error.code!=='ENOENT')throw new Error('AUTHORITY_LEDGER_CORRUPT:'+error.message);}
      const t=Date.now();let result={ok:false,reason:'unknown-action'};
      if(action==='acquire') {if(state.expires<=t || state.owner===args.owner){if(state.owner!==args.owner || state.expires<=t)state.token++;state.owner=args.owner;state.expires=t+Math.min(30000,args.ttlMs || 15000);result={ok:true,token:state.token,expires:state.expires};}else result={ok:false,reason:'lease-held'};}
      if(action==='renew'){if(state.owner===args.owner && state.token===args.token && state.expires>t){state.expires=t+Math.min(30000,args.ttlMs || 15000);result={ok:true,token:state.token,expires:state.expires};}else result={ok:false,reason:'lease-lost'};}
      if(action==='reserve') {
        const old=state.orders[args.key];
        if(old)result={ok:false,reason:old.hash!==args.hash?'idempotency-content-conflict':'existing-order',order:old};
        else if(state.owner!==args.owner || state.token!==args.token || state.expires<=t)result={ok:false,reason:'lease-lost'};
        else {const order={key:args.key,hash:args.hash,clientOrderId:args.clientOrderId,token:args.token,status:'pending',at:t};state.orders[args.key]=order;result={ok:true,order};}
      }
      if(action==='complete') {const old=state.orders[args.key];if(old && old.token===args.token){if(old.status!=='accepted' || args.status==='accepted'){old.status=args.status;old.receipt=args.receipt;old.updatedAt=t;}result={ok:true,order:old};}else result={ok:false,reason:'order-token-mismatch'};}
      if(action==='lookup')result={ok:true,order:state.orders[args.key] || null};
      if(action==='status')result={ok:true,owner:state.owner,token:state.token,expires:state.expires,orderCount:Object.keys(state.orders).length,scope:'shared-disk-only'};
      const tmp=this.file+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(state));const fd=fs.openSync(tmp,'r');fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(tmp,this.file);return result;
    }finally{fs.rmSync(lock,{recursive:true,force:true});}
  }
}
class RpcAuthorityStore {
  constructor(rpc,scope='nexus-testnet'){this.rpc=rpc;this.scope=scope;}
  async command(action,args={}){const r=await this.rpc('nexus_execution_authority',{p_scope:this.scope,p_action:action,p_args:args});if(!r.ok)throw new Error(r.error || 'AUTHORITY_RPC_FAILED');return r.data;}
}
class ExecutionAuthority {
  constructor(store,owner,options={}){this.store=store;this.owner=owner;this.ttlMs=options.ttlMs || 15000;this.timeoutMs=options.timeoutMs || 7000;}
  async submit(intent,seal,rules,send,lookup,external=false){
    if(!verifyIntent(intent,seal))return {accepted:false,status:'CONTRACT_MUTATION_BLOCKED'};
    const validation=validateRules(intent,rules,external);if(!validation.passed)return {accepted:false,status:'EXCHANGE_RULES_BLOCKED',reason:validation.reasons.join('|')};
    if(String(intent.mode).toLowerCase()==='live')return {accepted:false,status:'LIVE_SUBMIT_LOCKED'};
    if(external && !['testnet','staging'].includes(String(intent.mode).toLowerCase()))return {accepted:false,status:'EXTERNAL_MODE_MISMATCH'};
    const key=fingerprint({decisionId:seal.payload.decisionId,venue:seal.payload.venue,symbol:seal.payload.symbol,mode:seal.payload.mode});
    const clientOrderId='nx'+key.slice(0,30);
    const lease=await this.store.command('acquire',{owner:this.owner,ttlMs:this.ttlMs});if(!lease.ok)return {accepted:false,status:'EXECUTION_LEASE_HELD'};
    const token=lease.token;
    const reservation=await this.store.command('reserve',{owner:this.owner,token,key,hash:seal.hash,clientOrderId});
    if(!reservation.ok){
      if(reservation.reason==='idempotency-content-conflict')return {accepted:false,status:'IDEMPOTENCY_CONTENT_CONFLICT'};
      if(reservation.order?.status==='accepted')return {...reservation.order.receipt,reused:true};
      if(reservation.order && lookup){const receipt=await lookup(clientOrderId);if(receipt?.accepted){await this.store.command('complete',{key,token:reservation.order.token,status:'accepted',receipt});return {...receipt,reconciled:true};}}
      return {accepted:false,pending:true,status:'RECONCILIATION_REQUIRED',clientOrderId};
    }
    const renew=await this.store.command('renew',{owner:this.owner,token,ttlMs:this.ttlMs});
    if(!renew.ok || !verifyIntent(intent,seal))return {accepted:false,pending:true,status:'LEASE_OR_CONTRACT_LOST'};
    let timer;
    // This is the network boundary. Fencing cannot cancel an already sent exchange request.
    const request=Promise.resolve().then(()=>{if(Number(renew.expires)<=Date.now() || !verifyIntent(intent,seal))throw new Error('LEASE_EXPIRED_BEFORE_NETWORK_SEND');return send(clientOrderId);}).then(async receipt=>{
      const accepted=receipt?.accepted===true;
      await this.store.command('complete',{key,token,status:accepted?'accepted':receipt?.definitiveRejected?'rejected':'uncertain',receipt});return receipt;
    },async error=>{await this.store.command('complete',{key,token,status:'uncertain',receipt:{accepted:false,pending:true,status:'EXCHANGE_RESULT_UNCERTAIN',reason:error.message,clientOrderId}});return {accepted:false,pending:true,status:'EXCHANGE_RESULT_UNCERTAIN',clientOrderId};});
    try{return await Promise.race([request,new Promise(resolve=>{timer=setTimeout(()=>resolve({accepted:false,pending:true,status:'EXCHANGE_RESULT_UNCERTAIN',clientOrderId}),this.timeoutMs);})]);}
    finally{clearTimeout(timer);}
  }
}
module.exports={sealIntent,verifyIntent,validateRules,FileAuthorityStore,RpcAuthorityStore,ExecutionAuthority};
