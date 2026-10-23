export function demoCatalog(name = 'Captured phone') {
  const variants = [];
  for (const model of ['Pro', 'Pro Max'])
    for (const finish of ['Burgundy', 'Black', 'Glacier'])
      for (const storage of ['256 GB', '512 GB']) {
        variants.push({
          id: `${model}-${finish}-${storage}`.toLowerCase().replaceAll(' ', '-'),
          name: `${model} · ${finish} · ${storage}`,
          options: { Model: model, Finish: finish, Storage: storage },
          priceCents:
            11990000 + (model === 'Pro Max' ? 2000000 : 0) + (storage === '512 GB' ? 2000000 : 0),
          initialStock: finish === 'Glacier' && storage === '512 GB' ? 0 : 8,
        });
      }
  return {
    product: {
      id: 'captured-phone',
      name,
      description: 'Choose your model, finish and storage without leaving this app.',
      currency: 'INR',
      details: [
        'An independently authored product configurator based on the captured card.',
        'Product options, prices and stock are sample demo data.',
        'Cart and demo orders are saved by this application’s own backend.',
      ],
      notice:
        'Demo catalog · sample pricing and stock. No payment, Apple order or shipment occurs.',
    },
    variants,
  };
}
