import { useMutation } from "@tanstack/react-query";
import { logout } from "../services/api";

export function useLogout(onUnauthorized: () => void) {
  return useMutation({ mutationFn: logout, onSuccess: onUnauthorized });
}
