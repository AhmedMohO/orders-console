const money = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
});

export const formatMoney = (cents: number) => money.format(cents / 100);
