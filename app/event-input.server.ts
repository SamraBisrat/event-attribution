export function eventInput(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  if (location.length > 300) throw new Error("Location must be 300 characters or fewer.");
  const eventType = String(form.get("eventType") ?? "").trim();
  const startAt = new Date(String(form.get("startAt") ?? ""));
  const endValue = String(form.get("endAt") ?? "");
  const endAt = endValue ? new Date(endValue) : null;
  const cost = Number(form.get("cost") || 0);
  const discountCodes = [...new Set(String(form.get("codes") ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (!name || !eventType) throw new Error("Event name and type are required.");
  if (Number.isNaN(startAt.getTime()) || (endAt && Number.isNaN(endAt.getTime()))) throw new Error("Enter valid event dates.");
  if (endAt && endAt < startAt) throw new Error("End must be after the start.");
  if (!Number.isFinite(cost) || cost < 0) throw new Error("Cost must be a non-negative number.");
  if (discountCodes.length > 20 || discountCodes.some((code) => code.length > 100)) throw new Error("Use up to 20 discount codes, each at most 100 characters.");
  return { name, location: location || null, eventType, startAt, endAt, cost, discountCodes: JSON.stringify(discountCodes), description: String(form.get("description") ?? "").trim() || null };
}
