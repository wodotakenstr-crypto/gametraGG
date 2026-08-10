const assert = require("node:assert/strict");
const { assignFoundingSeller, creditSellerForOrder, foundingSellerLimit, foundingSellerFreeSales } = require("../server");

const store = { accounts: [], orders: [], wallets: [] };

for (let index = 0; index < foundingSellerLimit; index += 1) {
  const seller = { id: `seller-${index}` };
  assert.equal(assignFoundingSeller(store, seller), true);
  assert.equal(seller.foundingSeller, true);
}

assert.equal(assignFoundingSeller(store, { id: "seller-over-limit" }), false);
assert.equal(store.foundingSellerIds.length, foundingSellerLimit);

const sellerId = "seller-0";
for (let index = 0; index < foundingSellerFreeSales + 1; index += 1) {
  const order = {
    id: `order-${index}`,
    sellerId,
    paymentConfirmedAt: new Date().toISOString(),
    paymentAmountCents: 10000,
    commissionRate: 0.05,
    foundingSeller: true
  };
  store.orders.push(order);
  const result = creditSellerForOrder(store, order, new Date().toISOString());
  assert.equal(result.error, undefined);
  assert.equal(order.commissionCents, index < foundingSellerFreeSales ? 0 : 500);
  order.status = "completed";
}

const wallet = store.wallets.find(item => item.sellerId === sellerId);
assert.equal(wallet.availableCents, 39500);
console.log("Founding seller campaign passed: 20 slots, 3 commission-free sales, then 5%.");
