import React, { useEffect, useRef, useState } from 'react';

type Line = { variantId: string; name: string; quantity: number; priceCents: number; subtotalCents: number };
type Order = { id: string; createdAt: string; status: string; items: Line[]; totalCents: number; currency: string };
type Shop = {
  product: { name: string; description: string; details: string[]; notice: string; currency: string };
  variants: { id: string; name: string; color: string; priceCents: number; stock: number }[];
  version: number; cart: { items: Line[]; quantity: number; totalCents: number }; lastOrder: Order | null;
};
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
async function request(method = 'GET', route = '', body?: unknown): Promise<Shop> {
  const response = await fetch('/api/shop' + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

export default function App() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<'details' | 'configure' | null>(null);
  const [variantId, setVariantId] = useState('moss');
  const [quantity, setQuantity] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const cartHeading = useRef<HTMLHeadingElement>(null);
  const focusCart = useRef(false);
  const reservation = useRef<{ version: number; requestId: string } | null>(null);
  useEffect(() => {
    let current = true;
    request().then(data => { if (current) setShop(data); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (view && !dialog.current?.open) dialog.current?.showModal();
    if (!view && dialog.current?.open) dialog.current.close();
    if (view === 'configure') dialog.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [view]);
  async function mutate(method: string, route: string, body: unknown, success: string) {
    if (busy) return false;
    setBusy(true); setError(''); setMessage('');
    try { setShop(await request(method, route, body)); setMessage(success); return true; }
    catch (e) {
      setError((e as Error).message);
      // Refresh authoritative state after a stale cart or an uncertain network response.
      try { setShop(await request()); } catch { /* Keep the last confirmed state visible. */ }
      return false;
    } finally { setBusy(false); }
  }
  const variant = shop?.variants.find(v => v.id === variantId);
  const inCart = shop?.cart.items.find(i => i.variantId === variantId)?.quantity || 0;
  const available = variant ? Math.max(0, Math.min(5, variant.stock) - inCart) : 0;
  function configure() { setQuantity(1); setError(''); setView('configure'); }
  function handleReframeAction(action: string) {
    setError('');
    if (action === 'action1') setView('details');
    else if (action === 'action2') configure();
    else setError('This captured action has not been connected yet.');
  }
  async function addToCart(e: React.FormEvent) {
    e.preventDefault();
    if (!shop || !available) return;
    if (await mutate('PUT', '/cart', { variantId, quantity: inCart + quantity, version: shop.version }, 'Added to your cart. Review your reservation below.')) {
      focusCart.current = true;
      setView(null);
    }
  }
  async function reserve() {
    if (!shop) return;
    if (reservation.current?.version !== shop.version) reservation.current = { version: shop.version, requestId: crypto.randomUUID() };
    await mutate('POST', '/reservations', reservation.current, 'Reservation confirmed and saved on this computer.');
  }
  return <main>
    <header><a href="/">Fieldnotes<span> / a place to begin</span></a><a className="cart-link" href="#cart">Cart <span>{shop?.cart.quantity || 0}</span></a></header>
    <div className="welcome"><p className="eyebrow">CAPTURED IDEA. WORKING PRODUCT.</p><h1>Good ideas.<br/>Better on paper.</h1><p>Apple’s captured action pattern, connected to our own product, cart and reservation backend.</p></div>
    {!shop ? <section className="drop-zone" aria-live="polite">{error ? <><p role="alert">{error}</p><button onClick={() => location.reload()}>Try again</button></> : <p>Loading the collection…</p>}</section> : <>
      <div className="shop-layout">
        <section className="drop-zone product-card" aria-label="Integrated components">
          <div className="product-art" aria-hidden="true"><div className="notebook back"/><div className="notebook front"><span>FIELD<br/>NOTES</span><small>IDEAS LIVE HERE.</small></div><span className="art-caption">THE POCKET COLLECTION / 01</span></div>
          <div className="product-body"><p className="eyebrow">A LITTLE SPACE FOR WHAT’S NEXT</p><div className="product-title"><h2>{shop.product.name}</h2><span>From {money(Math.min(...shop.variants.map(v => v.priceCents)))}</span></div><p>{shop.product.description}</p>
            <ReframeAppleVerified onAction={handleReframeAction}/>
            <p className="fine-print">Three covers. One place for your ideas.</p>
          </div>
        </section>
        <aside className="cart-panel" id="cart" aria-label="Your cart">
          <p className="eyebrow">MAKE IT YOURS</p><h2 ref={cartHeading} tabIndex={-1}>Your cart <span className="count">{shop.cart.quantity}</span></h2>
          {shop.cart.items.length ? <><ul className="cart-items">{shop.cart.items.map(item => <li key={item.variantId}><div className="line-title"><strong>Pocket Set · {item.name}</strong><span>{money(item.subtotalCents)}</span></div><div className="line-controls"><label>Quantity<select aria-label={`${item.name} quantity`} value={item.quantity} disabled={busy} onChange={e => void mutate('PUT', '/cart', { variantId: item.variantId, quantity: Number(e.target.value), version: shop.version }, 'Cart updated.')}>{Array.from({ length: Math.min(5, shop.variants.find(v => v.id === item.variantId)!.stock) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><button className="text-button" disabled={busy} onClick={() => void mutate('PUT', '/cart', { variantId: item.variantId, quantity: 0, version: shop.version }, 'Item removed.')}>Remove {item.name}</button></div></li>)}</ul><div className="cart-total"><span>Reservation value</span><strong>{money(shop.cart.totalCents)}</strong></div><button className="reserve-button" disabled={busy} onClick={() => void reserve()}>{busy ? 'Saving…' : 'Confirm local reservation'}</button><p className="fine-print">No payment. No shipment. Stock is reserved only when you confirm.</p></> : <div className="empty-cart"><p>A little room for something good.</p><p className="fine-print">Choose Pre-order to select a cover and add your first set.</p></div>}
          <p className="activity" role="status">{busy ? 'Saving your changes…' : message || 'Your cart is saved on this computer.'}</p>
          {error && !view && <p className="error" role="alert">{error}</p>}
          {shop.lastOrder && <section className="receipt" aria-label="Latest reservation"><p className="eyebrow">RESERVATION CONFIRMED</p><h3>We kept your place.</h3><p className="receipt-id">Reference <strong>{shop.lastOrder.id.slice(0, 8).toUpperCase()}</strong></p><ul>{shop.lastOrder.items.map(item => <li key={item.variantId}>{item.quantity} × {item.name} Pocket Set <span>{money(item.subtotalCents)}</span></li>)}</ul><p><strong>{money(shop.lastOrder.totalCents)}</strong> · {new Date(shop.lastOrder.createdAt).toLocaleDateString()}</p><small>Saved locally · no charge made</small></section>}
        </aside>
      </div>
      <dialog ref={dialog} aria-labelledby="product-dialog-title" onClose={() => { setView(null); if (focusCart.current) { focusCart.current = false; cartHeading.current?.focus(); } }} onCancel={e => { if (busy) e.preventDefault(); }}>
        <button className="dialog-close" aria-label="Close product details" disabled={busy} onClick={() => setView(null)}>×</button>
        <p className="eyebrow">THE POCKET COLLECTION</p><h2 id="product-dialog-title">{view === 'details' ? 'Small pages. Big possibilities.' : 'Choose your Pocket Set'}</h2>
        {view === 'details' ? <><p>{shop.product.description}</p><ul className="product-details">{shop.product.details.map(detail => <li key={detail}>{detail}</li>)}</ul><p className="fine-print">{shop.product.notice}</p><button onClick={configure}>Choose a cover</button></> : <form onSubmit={e => void addToCart(e)}><fieldset disabled={busy}><legend>Cover color</legend><div className="variant-options">{shop.variants.map(v => <label key={v.id} className={variantId === v.id ? 'chosen' : ''}><input type="radio" name="cover" value={v.id} checked={variantId === v.id} onChange={() => { setVariantId(v.id); setQuantity(1); }}/><span className="swatch" style={{ background: v.color }}/><strong>{v.name}</strong><small>{money(v.priceCents)} · {v.stock} left</small></label>)}</div><label className="quantity-field">Sets to add<select value={quantity} disabled={!available || busy} onChange={e => setQuantity(Number(e.target.value))}>{Array.from({ length: available || 1 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><p>{available ? `${available} available to add${inCart ? ` · ${inCart} already in your cart` : ''}.` : variant?.stock ? 'This cover is already at the cart limit. Choose another cover.' : 'This cover is sold out. Choose another cover.'}</p><button className="reserve-button" disabled={!available || quantity > available || busy} type="submit">{busy ? 'Adding…' : `Add to cart · ${money((variant?.priceCents || 0) * quantity)}`}</button></fieldset></form>}
        {error && view && <p className="error" role="alert">{error}</p>}
      </dialog>
    </>}
    <footer>Original demo catalog and backend · local workspace · no affiliation with Apple</footer>
  </main>;
}

// Captured Apple action group; behavior and destination product are our own implementation.
function ReframeAppleVerified({ onAction }: { onAction: (action: string) => void }) {
  return <div className="captured-actions"><button onClick={() => onAction('action1')} className="secondary">Learn more</button><button onClick={() => onAction('action2')}>Pre-order</button></div>;
}
