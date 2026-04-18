function fmtPct(v) {
  return `${(Number(v || 0) * 100).toFixed(2)}%`;
}

function iranySzoveg(action) {
  if (action === 'BUY') return 'vételi';
  if (action === 'SELL') return 'eladási / short';
  return 'kivárási';
}

async function aiExplain(ctx, payload) {
  const symbol = payload.symbol;
  const tipus = payload.tipus;

  if (!symbol) throw new Error('Hiányzó szimbólum.');
  if (!tipus) throw new Error('Hiányzó lekérdezési típus.');

  const d = ctx.state.aiDecision?.[symbol];
  const f = ctx.state.featureCache?.[symbol];
  const p = ctx.state.openPositions?.[symbol];
  const arb = (ctx.state.arbitrage || []).find(x => x.symbol === symbol);

  if (!d || !f) {
    throw new Error('Ehhez a szimbólumhoz még nincs elérhető AI adat.');
  }

  let szoveg = '';

  if (tipus === 'piaci_osszefoglalo') {
    szoveg =
      `A ${symbol} piacán jelenleg ${iranySzoveg(d.action)} jelzést lát a rendszer ${fmtPct(d.confidence)} bizonyossággal. `
      + `Az RSI értéke ${Number(f.rsi || 0).toFixed(2)}, az EMA20 ${Number(f.ema20 || 0).toFixed(2)}, az EMA50 ${Number(f.ema50 || 0).toFixed(2)}. `
      + `A forgalmi arány ${Number(f.volRatio || 0).toFixed(2)}, az ATR ${Number(f.atr || 0).toFixed(2)}. `
      + `A fő technikai indokok: ${(d.reasons || []).join(', ') || 'nincs részletes indoklás'}.`
      + (d.historicalAssistUsed && d.historicalAssistText ? ` Történeti segítség is be lett vonva: ${d.historicalAssistText}` : '');
  } else if (tipus === 'kockazati_osszefoglalo') {
    szoveg =
      `A jelenlegi teljes drawdown ${fmtPct(ctx.helpers.drawdownPct())}, a napi veszteség ${fmtPct(ctx.helpers.dailyLossPct())}. `
      + `A vészleállító állapota: ${ctx.state.killSwitch ? 'aktív' : 'nem aktív'}. `
      + (p
        ? `Ehhez a szimbólumhoz van nyitott pozíció, belépő: ${Number(p.entry || 0).toFixed(2)}, stop loss: ${Number(p.stopLoss || 0).toFixed(2)}, take profit: ${Number(p.takeProfit || 0).toFixed(2)}. `
        : `Ehhez a szimbólumhoz jelenleg nincs nyitott pozíció. `)
      + `A rendszer kockázatalapon számolja a pozícióméretet, és több védelmi réteget használ a tőke megóvására.`
      + (d.historicalAssistUsed && d.historicalAssistText ? ` Történeti döntéstámogatás aktív volt: ${d.historicalAssistText}` : '');
  } else if (tipus === 'belepesi_indoklas') {
    szoveg =
      `A belépési indoklás szerint a rendszer ${iranySzoveg(d.action)} lehetőséget látott. `
      + `A döntés bizonyossága ${fmtPct(d.confidence)}. `
      + `A technikai érvek: ${(d.reasons || []).join(', ') || 'nincs részletezett technikai indok'}. `
      + (arb
        ? `Az arbitrázs figyelő ennél a szimbólumnál nettó ${fmtPct(arb.netEdgePct)} előnyt is látott a ${arb.buyExchange} és ${arb.sellExchange} tőzsdék között.`
        : `Jelenleg nincs kiemelt arbitrázs előny eltárolva ehhez a szimbólumhoz.`);
  } else if (tipus === 'kilepesi_indoklas') {
    szoveg =
      (p
        ? `A kilépési logika ennél a nyitott pozíciónál a stop loss és take profit szintekre épül. `
          + `Aktuális stop: ${Number(p.stopLoss || 0).toFixed(2)}, aktuális célár: ${Number(p.takeProfit || 0).toFixed(2)}. `
          + `A rendszer trailing jelleggel is képes módosítani a stop szintet kedvező irányú elmozdulás esetén. `
        : `Jelenleg nincs nyitott pozíció ehhez a szimbólumhoz, ezért a kilépési indoklás általános logikát ad. `)
      + `Kilépés történhet stop loss, take profit, vészleállító aktiválódás vagy részleges/valós idejű order állapotváltozás miatt.`;
  } else {
    throw new Error('Ismeretlen lekérdezési típus.');
  }

  return { symbol, tipus, szoveg };
}

module.exports = { aiExplain };
