import { PurchaseRepository } from "@/repository/PurchaseRepository";

/** Operações de checkout no client (Supabase). Server functions: importar em @/payments.functions */
export const CheckoutService = {
  getPurchaseStatus: (id: string) => PurchaseRepository.getStatus(id),
  listPurchases: (userId: string) => PurchaseRepository.listForUser(userId),
  userOwnsPhoto: (userId: string, photoId: string) =>
    PurchaseRepository.userOwnsPhoto(userId, photoId),
};
