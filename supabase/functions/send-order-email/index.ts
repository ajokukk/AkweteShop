// Supabase Edge Function: sends the order confirmation email through Mailgun.
// Called by checkout.html right after place_order() succeeds.
//
// Secrets (set with `supabase secrets set ...`, never put these in the browser):
//   MAILGUN_API_KEY   your Mailgun API key
//   MAILGUN_DOMAIN    your sending domain, or the sandbox domain
//   MAIL_FROM         optional, e.g. "Akwete <orders@mg.yourdomain.com>"
//   MAILGUN_API_BASE  optional, use https://api.eu.mailgun.net for EU domains
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const naira = (n: number) => "\u20A6" + Number(n).toLocaleString("en-NG");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mgKey = Deno.env.get("MAILGUN_API_KEY");
    const mgDomain = Deno.env.get("MAILGUN_DOMAIN");
    if (!mgKey || !mgDomain) return json({ error: "Mailgun is not configured on the server" }, 500);
    const from = Deno.env.get("MAIL_FROM") ?? `Akwete <orders@${mgDomain}>`;
    const base = Deno.env.get("MAILGUN_API_BASE") ?? "https://api.mailgun.net";

    // 1. Who is calling? Use the caller's own token so row level security applies.
    const asUser = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { order_id } = await req.json();
    if (typeof order_id !== "string") return json({ error: "order_id is required" }, 400);

    // 2. Load the order. RLS only returns it if it belongs to this user.
    const { data: order, error } = await asUser
      .from("orders").select("*, order_items(*)").eq("id", order_id).maybeSingle();
    if (error || !order) return json({ error: "Order not found" }, 404);
    if (order.confirmation_sent_at) return json({ ok: true, already_sent: true });

    // 3. Build the message.
    const items = order.order_items as Array<{ name: string; detail: string; quantity: number; unit_price_ngn: number }>;
    const rows = items.map((i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #ddd5c2">
          <strong>${esc(i.name)}</strong>${i.quantity > 1 ? ` &times; ${i.quantity}` : ""}<br>
          <span style="color:#55534d;font-size:14px">${esc(i.detail)}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #ddd5c2;text-align:right;white-space:nowrap">${naira(i.unit_price_ngn * i.quantity)}</td>
      </tr>`).join("");

    const html = `<!doctype html><html><body style="margin:0;background:#f6f2e8;font-family:Arial,Helvetica,sans-serif;color:#1b1b1d">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff">
        <tr><td style="background:#0d1330;color:#ece6d8;padding:28px;font-family:Georgia,serif;font-size:28px">Akwete</td></tr>
        <tr><td style="padding:28px">
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 8px">Thank you, ${esc(String(order.full_name).split(" ")[0])}.</h1>
          <p style="margin:0 0 20px">We have received your order <strong>${esc(order.order_number)}</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0">${rows}
            <tr><td style="padding:14px 0;font-size:18px"><strong>Total</strong></td>
                <td style="padding:14px 0;text-align:right;font-size:18px"><strong>${naira(order.total_ngn)}</strong></td></tr>
          </table>
          <h2 style="font-family:Georgia,serif;font-weight:400;font-size:20px;margin:24px 0 6px">Delivery details</h2>
          <p style="margin:0;color:#3a3a3a">${esc(order.full_name)}<br>${esc(order.address)}<br>${esc(order.city)}, ${esc(order.state)}<br>${esc(order.phone)}</p>
          <p style="margin:24px 0 0;color:#55534d;font-size:14px">We will contact you to confirm production time and payment. Reply to this email if anything above is wrong.</p>
        </td></tr>
      </table></td></tr></table></body></html>`;

    const text = [
      `Thank you, ${String(order.full_name).split(" ")[0]}.`,
      `We have received your order ${order.order_number}.`,
      "",
      ...items.map((i) => `- ${i.name}${i.quantity > 1 ? " x" + i.quantity : ""} (${i.detail}): ${naira(i.unit_price_ngn * i.quantity)}`),
      `Total: ${naira(order.total_ngn)}`,
      "",
      `Delivery: ${order.full_name}, ${order.address}, ${order.city}, ${order.state}. ${order.phone}`,
      "",
      "We will contact you to confirm production time and payment.",
    ].join("\n");

    // 4. Send through Mailgun.
    const form = new FormData();
    form.append("from", from);
    form.append("to", order.email);
    form.append("subject", `Your Akwete order ${order.order_number}`);
    form.append("text", text);
    form.append("html", html);

    const res = await fetch(`${base}/v3/${mgDomain}/messages`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa("api:" + mgKey) },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Mailgun error", res.status, detail);
      return json({ error: "Mailgun rejected the message", status: res.status, detail }, 502);
    }

    // 5. Record that it was sent (service role, because customers cannot update orders).
    const admin = createClient(url, service);
    await admin.from("orders").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", order.id);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected error" }, 500);
  }
});
