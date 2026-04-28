import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Webhook do Mercado Pago.
 * MP envia notificações de pagamento. Buscamos o pagamento via API e
 * atualizamos o pedido para 'paid' se aprovado.
 */
export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
          if (!token) return new Response("missing token", { status: 500 });

          const url = new URL(request.url);
          const topic = url.searchParams.get("topic") || url.searchParams.get("type");
          let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");

          // Tenta ler body também
          const text = await request.text();
          if (text) {
            try {
              const body = JSON.parse(text);
              if (!paymentId && body?.data?.id) paymentId = String(body.data.id);
              if (!topic && body?.type) {
                // ok
              }
            } catch {}
          }

          if (!paymentId) return new Response("ok", { status: 200 });

          // Busca o pagamento no MP
          const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            console.error("MP fetch payment fail", res.status);
            return new Response("ok", { status: 200 });
          }
          const payment = (await res.json()) as {
            status: string;
            external_reference: string;
            id: number;
          };

          if (!payment.external_reference) return new Response("ok", { status: 200 });

          if (payment.status === "approved") {
            await supabaseAdmin
              .from("purchases")
              .update({
                status: "paid",
                mp_payment_id: String(payment.id),
                paid_at: new Date().toISOString(),
              })
              .eq("id", payment.external_reference)
              .eq("status", "pending");
          } else if (["rejected", "cancelled", "refunded"].includes(payment.status)) {
            await supabaseAdmin
              .from("purchases")
              .update({ status: "failed", mp_payment_id: String(payment.id) })
              .eq("id", payment.external_reference)
              .eq("status", "pending");
          }

          return new Response("ok", { status: 200 });
        } catch (e) {
          console.error("mp-webhook error", e);
          return new Response("ok", { status: 200 });
        }
      },
      GET: async () => new Response("ok"),
    },
  },
});
