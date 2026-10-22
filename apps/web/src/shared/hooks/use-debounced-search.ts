import { useEffect, useState } from "react";

export function useDebouncedSearch(search: string) {
  const [value, setValue] = useState(search.trim());
  useEffect(() => {
    const timer = setTimeout(() => setValue(search.trim()), 1000);
    return () => clearTimeout(timer);
  }, [search]);
  return value;
}
