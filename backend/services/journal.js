const { persistTradeEvent, persistMarketSnapshot } = require('./persistenceManager');
const fs=require('fs'); const path=require('path');
function journalDir(ctx){ return path.join(ctx.CONFIG.projectRoot,'data','journal'); }
function marketDir(ctx){ return path.join(ctx.CONFIG.projectRoot,'data','market'); }
function ensureDirs(ctx){ fs.mkdirSync(journalDir(ctx),{recursive:true}); fs.mkdirSync(marketDir(ctx),{recursive:true}); }
function appendJsonl(filePath,item){ fs.appendFileSync(filePath, JSON.stringify(item)+'\n'); }
async function journalHeartbeat(ctx,bundle){ ensureDirs(ctx); const now=new Date().toISOString(); for(const {symbol,features,decision} of bundle){ appendJsonl(path.join(marketDir(ctx), `${symbol.replace('/','_')}.jsonl`), { time:now, symbol, features, decision }); } }
function journalTradeOpen(ctx, position, decision, features, executionMeta={}){ ensureDirs(ctx); appendJsonl(path.join(journalDir(ctx),'trades.jsonl'), { event:'OPEN', time:new Date().toISOString(), symbol:position.symbol, side:position.side, entry:position.entry, size:position.size, stopLoss:position.stopLoss, takeProfit:position.takeProfit, confidence:position.confidence, decision, featuresAtEntry:features, execution:executionMeta }); }
function journalTradeClose(ctx, position, exitPrice, pnl, reason){ ensureDirs(ctx); appendJsonl(path.join(journalDir(ctx),'trades.jsonl'), { event:'CLOSE', time:new Date().toISOString(), symbol:position.symbol, side:position.side, entry:position.entry, exit:exitPrice, size:position.size, pnl, reason, confidence:position.confidence }); }
module.exports={ journalHeartbeat, journalTradeOpen, journalTradeClose };
