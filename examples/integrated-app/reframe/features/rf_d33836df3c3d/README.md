# Apple MCP product card

Independent web product/configurator and local cart backend. Install via Reframe Projects in React + Vite. Run npm run reframe:dev, or build then npm run reframe:start. No added dependencies.

Sample catalog prices use integer minor units. The server validates variant IDs, stock and quantities, calculates totals and serializes atomic cart writes. Demo orders have durable request IDs and decrement local inventory. Cart and orders persist in .reframe/data/rf_d33836df3c3d.commerce.json and are excluded from clipboard exports. Existing record data uses a separate file and is preserved.

One local workspace and server process. Up to 48 variants, five units per variant, 200 demo orders and 10000 writes. No payment, shipment or Apple order is made. Before public commerce, add identity-scoped carts, a transactional database, authenticated HTTPS, tax/shipping rules, fulfillment and a real payment provider. Native product clients are not included.
