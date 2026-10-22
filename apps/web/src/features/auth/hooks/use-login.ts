import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { login } from "../services/api";

export function useLogin() {
  const client = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      client.setQueryData(["session"], user);
      router.replace("/");
      router.refresh();
    },
  });
}
