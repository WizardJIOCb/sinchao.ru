export type MenuFilters = { query: string; category: string };

export function readMenuFilters(search: string): MenuFilters {
  const params = new URLSearchParams(search);
  return {
    query: params.get("q") ?? "",
    category: params.get("category") || "all",
  };
}

export function menuFilterSearch(filters: MenuFilters, search = "") {
  const params = new URLSearchParams(search);
  if (filters.query) params.set("q", filters.query);
  else params.delete("q");
  if (filters.category !== "all") params.set("category", filters.category);
  else params.delete("category");
  const value = params.toString();
  return value ? "?" + value : "";
}

// Public links never carry a QR table token, visit or unrelated URL parameters.
export const menuResultsPath = (filters: MenuFilters) =>
  "/menu" + menuFilterSearch(filters);
