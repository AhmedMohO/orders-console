import { useMutation } from "@tanstack/react-query";
import { deleteOrder } from "../services/api";

export function useDeleteOrder(onDeleted: () => void) {
  return useMutation({ mutationFn: deleteOrder, onSuccess: onDeleted });
}
