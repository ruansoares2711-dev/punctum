-- Políticas RLS usam has_role() no USING; sem EXECUTE o Postgres retorna 42501 no checkout.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
