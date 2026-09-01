import { select, upsert } from './db';
import { invuToken, invuSalesForDay } from './invu';
import { normalize, type ChannelRow } from './normalize';
import { businessToday } from './panama';

/** Don't hammer INVU: skip if we pulled within this window. */
const MIN_INTERVAL_MS = 90_000;

const CREDS: Record<number, { user?: string; pass?: string }> = {
  1: { user: process.env.INVU_TOCUMEN_USER, pass: process.env.INVU_TOCUMEN_PASS },
  2: { user: process.env.INVU_SUNSET_USER, pass: process.env.INVU_SUNSET_PASS },
};

export async function refreshToday(force = false) {
  const day = businessToday();

  if (!force) {
    const [last] = await select<{ fetched_at: string }>(
      'raw_orders?select=fetched_at&order=fetched_at.desc',
    ).then((r) => r.slice(0, 1));
    if (last && Date.now() - Date.parse(last.fetched_at) < MIN_INTERVAL_MS) {
      return { skipped: true as const, day };
    }
  }

  const channels = new Map<string, ChannelRow>(
    (await select<ChannelRow>('order_type_channel?select=*')).map((c) => [`${c.location_id}:${c.tipo_orden}`, c]),
  );
  const locations = await select<{ id: number }>('locations?select=id&active=is.true&order=id');

  let count = 0;
  const unmapped: string[] = [];

  for (const loc of locations) {
    const { user, pass } = CREDS[loc.id] ?? {};
    if (!user || !pass) continue;

    const raw = await invuSalesForDay(await invuToken(user, pass), day);
    if (!raw.length) continue;

    const orders: any[] = [], lines: any[] = [], mods: any[] = [], pays: any[] = [], raws: any[] = [];
    const clients = new Map<string, any>();

    for (const o of raw) {
      const n = normalize(o, loc.id, channels);
      if (!n) continue;
      orders.push(n.order); lines.push(...n.lines); mods.push(...n.mods); pays.push(...n.pays);
      if (n.clientRow) clients.set(n.clientRow.invu_client_id, n.clientRow);
      if (n.order.channel === 'unclassified' && n.order.tipo_orden != null) {
        unmapped.push(`${loc.id}:${n.order.tipo_orden}:${n.order.order_type_name}`);
      }
      raws.push({ location_id: loc.id, invu_order_id: n.order.invu_order_id,
                  closed_at: n.order.closed_at, payload: o });
    }

    if (clients.size) await upsert('clients', [...clients.values()], 'location_id,invu_client_id');
    await upsert('orders', orders, 'location_id,invu_order_id');
    if (lines.length) await upsert('order_lines', lines, 'location_id,invu_order_id,invu_line_id');
    if (mods.length) await upsert('line_modifiers', mods, 'location_id,invu_order_id,invu_line_id,seq');
    if (pays.length) await upsert('payments', pays, 'location_id,invu_order_id,invu_pay_id');
    if (raws.length) await upsert('raw_orders', raws, 'location_id,invu_order_id');
    count += orders.length;
  }

  return { skipped: false as const, day, orders: count, unmapped: [...new Set(unmapped)] };
}
