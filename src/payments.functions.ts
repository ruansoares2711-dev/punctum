import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const APP_URL_ENV = "VITE_APP_URL";

type MpPreference = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
};

function resolveAppOrigin(clientOrigin: string): string {
  const fromEnv = process.env[APP_URL_ENV] || process.env.APP_URL;
  return (fromEnv || clientOrigin).replace(/\/$/, "");
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function isMercadoPagoTestToken(token: string): boolean {
  return /^TEST-/i.test(token);
}

function resolveMercadoPagoCheckoutUrl(pref: MpPreference, token: string): string {
  const testMode = isMercadoPagoTestToken(token);
  const checkoutUrl =
    (testMode ? pref.sandbox_init_point : pref.init_point) ||
    pref.init_point ||
    pref.sandbox_init_point;
  if (checkoutUrl) return checkoutUrl;
  if (!pref.id) {
    throw new Error("Mercado Pago não retornou o link de pagamento");
  }
  const host = testMode ? "sandbox.mercadopago.com.br" : "www.mercadopago.com.br";
  return `https://${host}/checkout/v1/redirect?pref_id=${encodeURIComponent(pref.id)}`;
}

function mercadoPagoErrorMessage(pref: MpPreference, status: number): string {
  const cause = pref.cause
    ?.map((c) => c.description)
    .filter(Boolean)
    .join("; ");
  const detail = pref.message || pref.error || cause;
  return detail ? `Mercado Pago (${status}): ${detail}` : `Mercado Pago falhou: ${status}`;
}

/**
 * Cria uma compra (pending), monta itens, chama Mercado Pago para criar uma preferência
 * e retorna o init_point (URL de checkout).
 */
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");

    const { data: items, error } = await supabase
      .from("cart_items")
      .select("photo_id, photo:photo_id ( id, title, price_cents, preview_path )")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    if (!items || items.length === 0) throw new Error("Carrinho vazio");

    const photos = items
      .map(
        (i: {
          photo: { id: string; title: string; price_cents: number; preview_path: string } | null;
        }) => i.photo,
      )
      .filter(
        (p): p is { id: string; title: string; price_cents: number; preview_path: string } => !!p,
      );
    if (photos.length === 0) throw new Error("Não foi possível carregar os itens do carrinho");
    if (photos.some((p) => !p.price_cents || p.price_cents <= 0)) {
      throw new Error("Existem itens com preço inválido no carrinho");
    }

    const total = photos.reduce((s, p) => s + p.price_cents, 0);

    const { data: purchase, error: pErr } = await supabase
      .from("purchases")
      .insert({ user_id: userId, status: "pending", total_cents: total })
      .select()
      .single();
    if (pErr || !purchase) throw new Error(pErr?.message ?? "Falha ao criar pedido");

    const itemsRows = photos.map((p) => ({
      purchase_id: purchase.id,
      photo_id: p.id,
      price_cents: p.price_cents,
    }));
    const { error: piErr } = await supabase.from("purchase_items").insert(itemsRows);
    if (piErr) throw new Error(piErr.message);

    // Cria preferência no MP
    const mpItems = photos.map((p) => ({
      id: p.id,
      title: p.title.slice(0, 250),
      quantity: 1,
      currency_id: "BRL",
      unit_price: Number((p.price_cents / 100).toFixed(2)),
    }));

    const origin = resolveAppOrigin(data.origin);
    const prefBody: Record<string, unknown> = {
      items: mpItems,
      external_reference: purchase.id,
      back_urls: {
        success: `${origin}/checkout/sucesso?pid=${purchase.id}`,
        failure: `${origin}/checkout/erro?pid=${purchase.id}`,
        pending: `${origin}/checkout/pendente?pid=${purchase.id}`,
      },
    };

    // auto_return e webhook exigem URL pública HTTPS; localhost quebra a preferência no MP
    if (!isLocalOrigin(origin)) {
      prefBody.notification_url = `${origin}/api/public/mp-webhook`;
      try {
        if (new URL(origin).protocol === "https:") {
          prefBody.auto_return = "approved";
        }
      } catch {
        /* origin inválida — back_urls ainda são enviadas */
      }
    }

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(prefBody),
    });

    let pref: MpPreference;
    try {
      const text = await res.text();
      pref = JSON.parse(text);
    } catch (parseError) {
      console.error("Erro ao parsear resposta do MP:", res.status, parseError);
      throw new Error("Falha ao processar resposta do Mercado Pago");
    }
    if (!res.ok) {
      console.error("MP error", res.status, pref);
      throw new Error(mercadoPagoErrorMessage(pref, res.status));
    }

    const initPoint = resolveMercadoPagoCheckoutUrl(pref, token);
    if (!pref.id) {
      console.error("MP preference sem id", pref);
      throw new Error("Mercado Pago não retornou identificador da preferência");
    }

    await supabase.from("purchases").update({ mp_preference_id: pref.id }).eq("id", purchase.id);

    // Garantir que o retorno é totalmente serializável
    return {
      purchaseId: String(purchase.id),
      initPoint: String(initPoint),
    };
  });

/**
 * Gera URL assinada para baixar o original. Apenas se o usuário comprou e a compra está paga.
 */
export const getDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { photoId: string }) => z.object({ photoId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: owns, error: oErr } = await supabase.rpc("user_owns_photo", {
      _user_id: userId,
      _photo_id: data.photoId,
    });
    if (oErr) throw new Error(oErr.message);
    if (!owns) throw new Error("Você não comprou esta foto");

    const { data: photo, error: phErr } = await supabase
      .from("photos")
      .select("original_path, title")
      .eq("id", data.photoId)
      .single();
    if (phErr || !photo) throw new Error(phErr?.message ?? "Foto não encontrada");

    const { data: signed, error: sErr } = await supabase.storage
      .from("photos-original")
      .createSignedUrl(photo.original_path, 60 * 5, { download: photo.title });
    if (sErr || !signed) throw new Error(sErr?.message ?? "Falha ao gerar link");

    return { url: signed.signedUrl };
  });
