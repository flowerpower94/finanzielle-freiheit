// Tägliches Bitcoin-Signal (gleiche Formel wie im Rechner) – meldet Zonenwechsel per ntfy aufs Handy.
// Läuft als GitHub Action; der geheime Kanal steht im Repository-Secret NTFY_TOPIC.
const APP = 'https://flowerpower94.github.io/finanzielle-freiheit/';
const SIG = { pl: [0.42, 1.25], mvrv: [0.76, 2.7], mayer: [0.7, 1.5] };
const GENESIS = Date.UTC(2009, 0, 3);
const trend = ms => 1.0117e-17 * Math.pow((ms - GENESIS) / 864e5, 5.82); // Power Law (Santostasi), USD

const part = (x, [lo, hi]) => Math.max(0, Math.min(100, Math.log(x / lo) / Math.log(hi / lo) * 100));
function signal({ pl, mvrv, mayer }) {
  const parts = [part(pl, SIG.pl), part(mvrv, SIG.mvrv), part(mayer, SIG.mayer)];
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { score, zone: score >= 75 ? 'sell' : score <= 15 ? 'deep' : 'hold' };
}
const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' → ' + r.status); return r.json(); };

const [spot, chart, cm] = await Promise.all([
  get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur,usd'),
  get('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=202&interval=daily'),
  get('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur&frequency=1d&page_size=2&paging_from=end'),
]);
const prices = chart.prices.map(p => p[1]);
const ma = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const now = Date.now(), usd = spot.bitcoin.usd, eur = spot.bitcoin.eur;
const mv = cm.data.map(d => +d.CapMVRVCur);              // [vorgestern/gestern, gestern/heute]
const today = { pl: usd / trend(now), mvrv: mv[mv.length - 1], mayer: usd / ma(prices.slice(-200)) };
const yPrice = prices[prices.length - 2];
const yesterday = { pl: yPrice / trend(now - 864e5), mvrv: mv[0], mayer: yPrice / ma(prices.slice(-201, -1)) };
const sT = signal(today), sY = signal(yesterday);

const NAME = { sell: 'Verkaufszone', hold: 'Halten', deep: 'Tiefzone' };
const fmt = (v, d = 2) => v.toLocaleString('de-DE', { maximumFractionDigits: d });
const line = `Bitcoin ${fmt(eur, 0)} € · Signal ${Math.round(sT.score)}/100 · Trend ${fmt(today.pl)}× · MVRV ${fmt(today.mvrv)} · Mayer ${fmt(today.mayer)}`;
console.log(line, '| gestern:', NAME[sY.zone], Math.round(sY.score));

const monday = new Date().getUTCDay() === 1;
let title = null, body = null, prio = 'default', tags = 'chart_with_upwards_trend';
if (process.env.TEST === 'true') { title = `Test: ${NAME[sT.zone]}`; body = line + '\nBenachrichtigungen funktionieren.'; }
else if (sT.zone !== sY.zone) {
  title = `Bitcoin: ${NAME[sT.zone]}`;
  body = sT.zone === 'sell' ? `${line}\nBitcoin steht historisch hoch – geplante Verkäufe prüfen (Eigenkapital, variabler Kredit, Sicherheitstank).`
    : sT.zone === 'deep' ? `${line}\nBitcoin steht historisch tief – nichts verkaufen.`
    : `${line}\nZurück im Halten-Bereich.`;
  prio = sT.zone === 'sell' ? 'high' : 'default'; tags = sT.zone === 'sell' ? 'moneybag' : sT.zone === 'deep' ? 'snowflake' : 'pause_button';
} else if (sT.zone === 'sell' && monday) { title = 'Bitcoin weiter in der Verkaufszone'; body = line; tags = 'moneybag'; }

if (title && process.env.NTFY_TOPIC) {
  const r = await fetch('https://ntfy.sh/' + process.env.NTFY_TOPIC, {
    method: 'POST', body,
    headers: { Title: encodeURIComponent(title).length === title.length ? title : '=?UTF-8?B?' + Buffer.from(title).toString('base64') + '?=', Priority: prio, Tags: tags, Click: APP },
  });
  console.log('Benachrichtigung gesendet:', r.status, title);
} else console.log(title ? 'Kein NTFY_TOPIC gesetzt – nichts gesendet.' : 'Keine Änderung – keine Benachrichtigung.');
