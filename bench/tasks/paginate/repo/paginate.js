// Returns one page of items. Pages are 1-based.
export function paginate(items, page, perPage) {
  const start = page * perPage;
  const end = start + perPage;
  return {
    items: items.slice(start, end),
    page,
    totalPages: Math.floor(items.length / perPage),
  };
}
