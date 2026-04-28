import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/checkout/sucesso")({
  validateSearch: (s: Record<string, unknown>) => ({ pid: (s.pid as string) || "" }),
  component: Success,
});

function Success() {
  const { pid } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("pending");

  useEffect(() => {
    if (!user || !pid) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from("purchases")
        .select("status")
        .eq("id", pid)
        .maybeSingle();
      if (data?.status === "paid") {
        setStatus("paid");
        // limpa carrinho
        await supabase.from("cart_items").delete().eq("user_id", user.id);
        clearInterval(interval);
      } else if (attempts > 20) {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [user, pid]);

  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      {status === "paid" ? (
        <>
          <CheckCircle2 className="mb-4 h-16 w-16 text-success" />
          <h1 className="font-display text-3xl font-semibold">Pagamento confirmado!</h1>
          <p className="mt-2 text-muted-foreground">Suas fotos já estão disponíveis para download.</p>
          <Button asChild className="mt-6">
            <Link to="/conta">Ir para minha conta</Link>
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="mb-4 h-16 w-16 animate-spin text-primary" />
          <h1 className="font-display text-3xl font-semibold">Aguardando confirmação</h1>
          <p className="mt-2 text-muted-foreground">
            Estamos confirmando seu pagamento. Isso pode levar alguns segundos.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/conta">Ver minhas compras</Link>
          </Button>
        </>
      )}
    </div>
  );
}
