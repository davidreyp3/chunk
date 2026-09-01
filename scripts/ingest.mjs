#!/usr/bin/env node
/**
 * Chunk dashboard — INVU POS ingestion.
 * Zero dependencies. Reads .env.local, pulls one month at a time, upserts to Supabase.
 *
 *   node scripts/ingest.mjs                    # backfill everything from each location's opening
 *   node scripts/ingest.mjs --months 2         # last N months only (the routine incremental run)
 *   node scripts/ingest.mjs --location 1       # single licence
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const INVU = 'https://api6.invupos.com';
const RAW_BUFFER_DAYS = 45;

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const MONTHS = arg('--months') ? Number(arg('--months')) : null;
const ONLY   = arg('--location') ? Number(arg('--location')) : null;

/** INVU double-encodes UTF-8: "CAFÃ‰" -> "CAFÉ" */
const fix = s => {
  if (typeof s !== 'string') return s;
  try { return Buffer.from(s, 'latin1').toString('utf8'); } catch { return s; }
};
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
/** Panama is UTC-5 year round, no DST — so a fixed offset is correct here. */
const ts = s => (s && s.length >= 19 ? `${s.slice(0, 10)}T${s.slice(11, 19)}-05:00` : null);

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} on ${path}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function upsert(table, rows, conflict) {
  for (let i = 0; i < rows.length; i += 500) {
    await sb(`${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
  }
}

async function invuToken(user, pass) {
  const r = await fetch(`${INVU}/invuApiPos/userAuth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass, grant_type: 'authorization' }),
  });
  const j = await r.json();
  // INVU returns HTTP 200 even on failure — the error lives in the body.
  if (!j.authorization) throw new Error(`INVU auth failed for ${user}: ${JSON.stringify(j)}`);
  return j.authorization;
}

async function invuSales(token, from, to) {
  const fi = Math.floor(from.getTime() / 1000);
  const ff = Math.floor(to.getTime() / 1000);
  const url = `${INVU}/invuApiPos/index.php?r=citas/ordenesAllAdv/fini/${fi}/ffin/${ff}/tipo/all/grouping/false`;
  const r = await fetch(url, { headers: { AUTHORIZATION: token } });
  const j = await r.json();
  if (j && typeof j === 'object' && !('data' in j)) throw new Error(`INVU error: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data || [];
}

function normalize(o, locationId, channelMap) {
  const closed = ts(o.fecha_cierre_date);
  if (!closed) return null;
  const d = new Date(closed);
  const tipo = o.tipo_orden == null ? null : Number(o.tipo_orden);
  const mapped = channelMap.get(`${locationId}:${tipo}`);
  const cli = Array.isArray(o.cliente) ? o.cliente[0] : o.cliente;
  const client = cli && typeof cli === 'object' ? cli : null;

  const order = {
    location_id: locationId,
    invu_order_id: String(o.id),
    opened_at: ts(o.fecha_apertura_date),
    closed_at: closed,
    business_date: o.fecha_cierre_date.slice(0, 10),
    hour_of_day: Number((o.hora_cierre || o.fecha_cierre_date.slice(11)).slice(0, 2)),
    dow: d.getUTCDay(),
    tipo_orden: tipo,
    order_type_name: fix(o.desc_tipo_orden) || null,
    // An order type nobody has classified is quarantined, never silently counted as retail.
    channel: mapped ? mapped.channel : 'unclassified',
    integration: fix(o.tipo_integracion_desc) || null,
    invu_client_id: client ? String(client.id) : null,
    client_name: client ? fix(client.nombres || '').trim() || null : null,
    cashier: fix(o.nombre_empleado_cierre) || null,
    status: fix(o.pagada) || null,
    subtotal: num(o.subtotal),
    total: num(o.total),
    tip: (o.propinas || []).reduce((s, p) => s + (num(p.monto) || 0), 0),
  };

  const lines = [], mods = [], pays = [];
  for (const it of o.items || []) {
    lines.push({
      location_id: locationId, invu_order_id: order.invu_order_id, invu_line_id: String(it.id),
      product_code: fix(it.codigo) || null, product_name: fix(it.desc_item) || null,
      category: fix(it.categoria) || null, qty: num(it.cantidad) ?? 1,
      unit_price: num(it.precioSugerido), line_total: num(it?.totales_item?.total),
      discount_name: fix(it.desc_descuento) || null, discount_value: num(it.valor_descuento) || 0,
      status: fix(it.desc_status_venta_item) || null,
    });
    (it.modif || []).forEach((m, i) => mods.push({
      location_id: locationId, invu_order_id: order.invu_order_id, invu_line_id: String(it.id),
      seq: i, modifier_id: m.idmodificador == null ? null : String(m.idmodificador),
      code: fix(m.codigo) || null, name: fix(m.nombre) || null,
      qty: num(m.cantidad_vendida) ?? 1, total: num(m.total) || 0,
    }));
  }
  for (const p of o.pagos || []) pays.push({
    location_id: locationId, invu_order_id: order.invu_order_id, invu_pay_id: String(p.id),
    method: fix(p.descMetodoPago) || null, pay_type: fix(p.descTipoPago) || null,
    amount: num(p.monto), paid_at: ts(p.fecha_pago),
  });

  const clientRow = client ? {
    location_id: locationId, invu_client_id: String(client.id),
    ruc: client.num_identificacion || null, name: fix(client.nombres || '').trim() || null,
    email: client.email || null, address: fix(client.direccion) || null,
  } : null;

  return { order, lines, mods, pays, clientRow };
}

const monthsBetween = (from, to) => {
  const out = [];
  let y = from.getFullYear(), m = from.getMonth();
  while (y < to.getFullYear() || (y === to.getFullYear() && m <= to.getMonth())) {
    out.push([y, m]);
    if (++m > 11) { m = 0; y++; }
  }
  return out;
};

(async () => {
  const locations = await sb('locations?select=*&order=id');
  const cm = await sb('order_type_channel?select=*');
  const channelMap = new Map(cm.map(r => [`${r.location_id}:${r.tipo_orden}`, r]));
  const rawCutoff = new Date(Date.now() - RAW_BUFFER_DAYS * 864e5);
  const unmapped = new Map();
  const now = new Date();

  for (const loc of locations) {
    if (ONLY && loc.id !== ONLY) continue;
    const tag = loc.name.toUpperCase().replace(/\s+/g, '_');
    const user = process.env[`INVU_${tag}_USER`] || process.env[`INVU_${tag.split('_').pop()}_USER`];
    const pass = process.env[`INVU_${tag}_PASS`] || process.env[`INVU_${tag.split('_').pop()}_PASS`];
    if (!user || !pass) { console.log(`  ${loc.name}: no credentials in .env.local — skipped`); continue; }

    const token = await invuToken(user, pass);
    const start = MONTHS
      ? new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1)
      : new Date(loc.opened_on || '2024-10-01');
    console.log(`\n${loc.name} (licence ${loc.id}) — from ${start.toISOString().slice(0, 7)}`);

    let totals = { o: 0, l: 0, m: 0, p: 0 };
    for (const [y, mo] of monthsBetween(start, now)) {
      const from = new Date(Date.UTC(y, mo, 1, 5, 0, 0));
      const to = new Date(Date.UTC(y, mo + 1, 1, 4, 59, 59));
      const raw = await invuSales(token, from, to);
      if (!raw.length) { console.log(`  ${y}-${String(mo + 1).padStart(2, '0')}  —`); continue; }

      const orders = [], lines = [], mods = [], pays = [], clients = new Map(), raws = [];
      for (const o of raw) {
        const n = normalize(o, loc.id, channelMap);
        if (!n) continue;
        orders.push(n.order); lines.push(...n.lines); mods.push(...n.mods); pays.push(...n.pays);
        if (n.clientRow) clients.set(n.clientRow.invu_client_id, n.clientRow);
        if (n.order.channel === 'unclassified' && n.order.tipo_orden != null) {
          const k = `${loc.id}:${n.order.tipo_orden}:${n.order.order_type_name}`;
          unmapped.set(k, (unmapped.get(k) || 0) + 1);
        }
        if (new Date(n.order.closed_at) >= rawCutoff) {
          raws.push({ location_id: loc.id, invu_order_id: n.order.invu_order_id,
                      closed_at: n.order.closed_at, payload: o });
        }
      }

      if (clients.size) await upsert('clients', [...clients.values()], 'location_id,invu_client_id');
      await upsert('orders', orders, 'location_id,invu_order_id');
      if (lines.length) await upsert('order_lines', lines, 'location_id,invu_order_id,invu_line_id');
      if (mods.length)  await upsert('line_modifiers', mods, 'location_id,invu_order_id,invu_line_id,seq');
      if (pays.length)  await upsert('payments', pays, 'location_id,invu_order_id,invu_pay_id');
      if (raws.length)  await upsert('raw_orders', raws, 'location_id,invu_order_id');

      totals.o += orders.length; totals.l += lines.length; totals.m += mods.length; totals.p += pays.length;
      console.log(`  ${y}-${String(mo + 1).padStart(2, '0')}  ${String(orders.length).padStart(5)} orders  ${String(lines.length).padStart(6)} lines  ${String(mods.length).padStart(6)} mods`);
    }
    console.log(`  → ${totals.o} orders · ${totals.l} lines · ${totals.m} modifiers · ${totals.p} payments`);
  }

  if (unmapped.size) {
    console.log('\n⚠ UNCLASSIFIED ORDER TYPES — add these to order_type_channel:');
    for (const [k, n] of unmapped) console.log(`   ${k}  (${n} orders)`);
  }
  console.log('\ndone.');
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
