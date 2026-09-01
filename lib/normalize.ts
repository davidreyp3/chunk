import { fix, num, ts } from './invu';

export type ChannelRow = { location_id: number; tipo_orden: number; channel: string; counts_as_retail: boolean };

/** Splits one INVU order into the rows our tables expect.
 *  An order type nobody has classified is quarantined as `unclassified` —
 *  never silently counted as retail. */
export function normalize(o: any, locationId: number, channels: Map<string, ChannelRow>) {
  const closed = ts(o.fecha_cierre_date);
  if (!closed) return null;

  const tipo = o.tipo_orden == null ? null : Number(o.tipo_orden);
  const mapped = tipo == null ? undefined : channels.get(`${locationId}:${tipo}`);
  const cli = Array.isArray(o.cliente) ? o.cliente[0] : o.cliente;
  const client = cli && typeof cli === 'object' ? cli : null;
  const id = String(o.id);
  const day: string = o.fecha_cierre_date.slice(0, 10);

  const order = {
    location_id: locationId,
    invu_order_id: id,
    opened_at: ts(o.fecha_apertura_date),
    closed_at: closed,
    business_date: day,
    hour_of_day: Number((o.hora_cierre || o.fecha_cierre_date.slice(11)).slice(0, 2)),
    dow: new Date(closed).getUTCDay(),
    tipo_orden: tipo,
    order_type_name: fix(o.desc_tipo_orden),
    channel: mapped ? mapped.channel : 'unclassified',
    integration: fix(o.tipo_integracion_desc),
    invu_client_id: client ? String(client.id) : null,
    client_name: client ? (fix(client.nombres) || '').trim() || null : null,
    cashier: fix(o.nombre_empleado_cierre),
    status: fix(o.pagada),
    subtotal: num(o.subtotal),
    total: num(o.total),
    tip: (o.propinas || []).reduce((s: number, p: any) => s + (num(p.monto) || 0), 0),
  };

  const lines: any[] = [];
  const mods: any[] = [];
  for (const it of o.items || []) {
    const lineId = String(it.id);
    lines.push({
      location_id: locationId, invu_order_id: id, invu_line_id: lineId,
      product_code: fix(it.codigo), product_name: fix(it.desc_item),
      category: fix(it.categoria), qty: num(it.cantidad) ?? 1,
      unit_price: num(it.precioSugerido), line_total: num(it?.totales_item?.total),
      discount_name: fix(it.desc_descuento), discount_value: num(it.valor_descuento) || 0,
      status: fix(it.desc_status_venta_item),
    });
    (it.modif || []).forEach((m: any, i: number) =>
      mods.push({
        location_id: locationId, invu_order_id: id, invu_line_id: lineId, seq: i,
        modifier_id: m.idmodificador == null ? null : String(m.idmodificador),
        code: fix(m.codigo), name: fix(m.nombre),
        qty: num(m.cantidad_vendida) ?? 1, total: num(m.total) || 0,
      }),
    );
  }

  const pays = (o.pagos || []).map((p: any) => ({
    location_id: locationId, invu_order_id: id, invu_pay_id: String(p.id),
    method: fix(p.descMetodoPago), pay_type: fix(p.descTipoPago),
    amount: num(p.monto), paid_at: ts(p.fecha_pago),
  }));

  const clientRow = client
    ? {
        location_id: locationId, invu_client_id: String(client.id),
        ruc: client.num_identificacion || null, name: (fix(client.nombres) || '').trim() || null,
        email: client.email || null, address: fix(client.direccion),
      }
    : null;

  return { order, lines, mods, pays, clientRow };
}

/** Accents and case removed, for matching a name typed by hand against the
 *  spelling the POS uses. The calendar said "Tiramisu" while every line said
 *  "Tiramisù", so the September special read zero. Display always uses the
 *  POS spelling — this is only ever for finding the match. */
export const foldName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** The sold flavour matching `planned`, preferring an exact hit. */
export function resolveFlavour(planned: string, sold: Iterable<string>): string {
  const names = [...sold];
  if (names.includes(planned)) return planned;
  return names.find((n) => foldName(n) === foldName(planned)) ?? planned;
}
