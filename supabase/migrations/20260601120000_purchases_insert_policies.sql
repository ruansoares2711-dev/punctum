-- Checkout: usuário autenticado cria/atualiza próprio pedido (sem service role no client)
CREATE POLICY "purchases owner insert" ON public.purchases
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "purchases owner update" ON public.purchases
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "purchase_items owner insert" ON public.purchase_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.id = purchase_id AND p.user_id = auth.uid()
    )
  );

-- Download: ler metadados de fotos que o usuário comprou
CREATE POLICY "photos buyer read owned" ON public.photos
  FOR SELECT TO authenticated
  USING (public.user_owns_photo(auth.uid(), id));

-- Download: ler arquivo original no storage se comprou a foto
CREATE POLICY "original buyer read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos-original'
    AND EXISTS (
      SELECT 1 FROM public.photos ph
      WHERE ph.original_path = name
        AND public.user_owns_photo(auth.uid(), ph.id)
    )
  );

GRANT EXECUTE ON FUNCTION public.user_owns_photo(uuid, uuid) TO authenticated;
