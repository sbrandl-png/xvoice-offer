"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ===== BRAND / COMPANY =====
const BRAND = {
  name: "xVoice UC",
  primary: "#ff4e00",
  dark: "#111111",
  headerBg: "#000000",
  headerFg: "#ffffff",
  logoUrl: "https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x",
};

const COMPANY = {
  legal: "xVoice UC UG (Haftungsbeschränkt)",
  street: "Peter-Müller-Straße 3",
  zip: "40468",
  city: "Düsseldorf",
  phone: "+49 211 955 861 0",
  email: "vertrieb@xvoice-uc.de",
  web: "www.xvoice-uc.de",
  register: "Amtsgericht Siegburg, HRB 19078",
};

// ===== ENDPOINTS =====
const ORDER_ENDPOINT = "/api/place-order";

// ===== TYPES =====
type OrderRow = { sku: string; name: string; quantity: number; unit: number; total: number };
type OrderPayload = {
  offerId: string;
  customer: { company: string; contact: string; email: string; phone?: string };
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;
  createdAt: number;
};

// ===== UTILS =====
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}
function b64urlToUtf8(b64url: string) {
  // base64url -> base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  if (typeof window !== "undefined" && "atob" in window) {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(b64), (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  }
  // Fallback (Node) – sollte clientseitig nicht benötigt werden
  return Buffer.from(b64, "base64").toString("utf-8");
}
function safeDecodeJwtPayload<T = any>(token: string): { ok: true; payload: T } | { ok: false; error: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "Token-Format ungültig" };
    const json = b64urlToUtf8(parts[1] || "");
    const obj = JSON.parse(json);
    return { ok: true, payload: obj as T };
  } catch (e: any) {
    return { ok: false, error: "Token nicht lesbar" };
  }
}
function fullAddress(c: OrderPayload["customer"]) {
  const a: string[] = [];
  if (c.company) a.push(c.company);
  if (c.contact) a.push(c.contact);
  return a.join(" · ");
}

function Header() {
  return (
    <div
      className="rounded-2xl shadow-sm overflow-hidden"
      style={{ background: BRAND.headerBg, color: BRAND.headerFg }}
    >
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <img src={BRAND.logoUrl} alt="xVoice Logo" className="h-14 w-14 object-contain" />
          <div className="leading-tight">
            <div className="text-sm opacity-80">Bestellübersicht</div>
            <div className="text-xl font-semibold">{BRAND.name}</div>
          </div>
        </div>
        <div className="text-sm opacity-80">Stand {todayIso()}</div>
      </div>
      {/* Orange Akzentlinie wie in der Mail */}
      <div style={{ height: 3, background: BRAND.primary }} />
    </div>
  );
}

function Totals({ rows, vatRate, title }: { rows: OrderRow[]; vatRate: number; title: string }) {
  const netList = rows.reduce((a, r) => a + r.unit * r.quantity, 0); // „Listenpreis“ ist hier identisch zu unit
  const netOffer = rows.reduce((a, r) => a + r.total, 0);
  const discount = Math.max(0, netList - netOffer);
  const vat = netOffer * vatRate;
  const gross = netOffer + vat;

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-8">
      <span className={strong ? "font-semibold" : undefined}>{label}</span>
      <span className={"tabular-nums text-right " + (strong ? "font-semibold" : "")}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-1 text-sm">
      <div className="text-sm font-medium mb-1">{title}</div>
      <Row label="Listen-Zwischensumme (netto)" value={formatMoney(netList)} />
      {discount > 0 && <Row label="Rabatt gesamt" value={"−" + formatMoney(discount)} />}
      <Row label={discount > 0 ? "Zwischensumme nach Rabatt" : "Zwischensumme (netto)"} value={formatMoney(netOffer)} />
      <Row label={`zzgl. USt. (${Math.round(vatRate * 100)}%)`} value={formatMoney(vat)} />
      <Row label="Bruttosumme" value={formatMoney(gross)} strong />
    </div>
  );
}

function OrderClient() {
  const search = useSearchParams();
  const token = (search.get("token") || "").trim();

  const decoded = useMemo(() => safeDecodeJwtPayload<OrderPayload>(token), [token]);

  const [accept, setAccept] = useState(false);
  const [signer, setSigner] = useState<{ name: string; email: string; phone?: string }>({
    name: "",
    email: "",
    phone: "",
  });
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  const payload = decoded.ok ? decoded.payload : null;

  const monthlyRows = payload?.monthlyRows || [];
  const oneTimeRows = payload?.oneTimeRows || [];
  const vatRate = payload?.vatRate ?? 0.19;

  async function submit() {
    try {
      if (!token) throw new Error("Fehlender Token.");
      if (!accept) throw new Error("Bitte bestätigen Sie AGB & Widerrufsbelehrung.");
      if (!signer.name || !signer.email) throw new Error("Bitte Name und E-Mail des Unterzeichners angeben.");

      setSending(true);
      setError("");
      setOk(false);

      const res = await fetch(ORDER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit: true,
          token,
          accept: true,
          signer,
          context: {
            customer: payload?.customer,
            monthlyRows,
            oneTimeRows,
            vatRate,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json().catch(() => ({}));
      setOk(true);
      // Optional: Redirect auf Danke-Seite
      // router.push(`/order/success?orderId=${encodeURIComponent(data.orderId || "")}`)
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Header />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          {!token ? (
            <div className="text-red-600 text-sm">
              Ungültiger oder beschädigter Bestelllink<br />
              <span className="opacity-75">Fehler: Kein Token gefunden</span>
            </div>
          ) : !decoded.ok ? (
            <div className="text-red-600 text-sm">
              Ungültiger oder beschädigter Bestelllink<br />
              <span className="opacity-75">Fehler: {decoded.error}</span>
              <div className="mt-2 text-xs opacity-60">Token-Fingerprint: {token.slice(0, 12)}…</div>
            </div>
          ) : (
            <>
              {/* Adresskasten */}
              <div className="rounded-xl border p-4 bg-[#f6f7fb]">
                <div className="text-sm text-muted-foreground">Bestellnummer</div>
                <div className="text-lg font-semibold">{payload?.offerId || "—"}</div>
                <div className="mt-3 text-sm">
                  <div className="font-medium">Kunde</div>
                  <div>{fullAddress(payload!.customer)}</div>
                  {payload!.customer.email && <div className="opacity-75">{payload!.customer.email}</div>}
                  {payload!.customer.phone && <div className="opacity-75">{payload!.customer.phone}</div>}
                </div>
              </div>

              {/* Monatliche Positionen */}
              <div className="mt-6">
                <div className="text-lg font-semibold mb-2">Monatliche Positionen</div>
                {monthlyRows.length === 0 ? (
                  <div className="text-sm opacity-70">Keine monatlichen Positionen.</div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[minmax(240px,1fr)_100px_120px_120px] gap-3 text-xs uppercase text-muted-foreground pb-2 border-b">
                      <div>Position</div>
                      <div>Menge</div>
                      <div>Einzelpreis</div>
                      <div className="text-right">Summe</div>
                    </div>
                    {monthlyRows.map((r) => (
                      <div key={`m-${r.sku}`} className="grid grid-cols-[minmax(240px,1fr)_100px_120px_120px] gap-3 py-2 border-b last:border-none">
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.sku}</div>
                        </div>
                        <div className="tabular-nums">{r.quantity}</div>
                        <div className="tabular-nums">{formatMoney(r.unit)}</div>
                        <div className="tabular-nums text-right font-semibold">{formatMoney(r.total)}</div>
                      </div>
                    ))}
                    <div className="pt-2">
                      <Totals rows={monthlyRows} vatRate={vatRate} title="Summe (monatlich)" />
                    </div>
                  </div>
                )}
              </div>

              {/* Einmalige Positionen */}
              <div className="mt-6">
                <div className="text-lg font-semibold mb-2">Einmalige Positionen</div>
                {oneTimeRows.length === 0 ? (
                  <div className="text-sm opacity-70">Keine einmaligen Positionen.</div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[minmax(240px,1fr)_100px_120px_120px] gap-3 text-xs uppercase text-muted-foreground pb-2 border-b">
                      <div>Position</div>
                      <div>Menge</div>
                      <div>Einzelpreis</div>
                      <div className="text-right">Summe</div>
                    </div>
                    {oneTimeRows.map((r) => (
                      <div key={`o-${r.sku}`} className="grid grid-cols-[minmax(240px,1fr)_100px_120px_120px] gap-3 py-2 border-b last:border-none">
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.sku}</div>
                        </div>
                        <div className="tabular-nums">{r.quantity}</div>
                        <div className="tabular-nums">{formatMoney(r.unit)}</div>
                        <div className="tabular-nums text-right font-semibold">{formatMoney(r.total)}</div>
                      </div>
                    ))}
                    <div className="pt-2">
                      <Totals rows={oneTimeRows} vatRate={vatRate} title="Summe (einmalig)" />
                    </div>
                  </div>
                )}
              </div>

              {/* AGB/Widerruf + Signer + Submit */}
              <div className="mt-8 grid gap-4">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-[3px]"
                    checked={accept}
                    onChange={(e) => setAccept(e.target.checked)}
                  />
                  <span>
                    Ich bestätige die{" "}
                    <a href="/agb" target="_blank" rel="noopener" className="underline">AGB</a>,{" "}
                    <a href="/widerruf" target="_blank" rel="noopener" className="underline">Widerrufsbelehrung</a>{" "}
                    und die{" "}
                    <a href="/datenschutz" target="_blank" rel="noopener" className="underline">Datenschutzhinweise</a>.
                  </span>
                </label>

                <div className="grid md:grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-sm">Unterzeichner – Name</Label>
                    <Input
                      placeholder="Vor- und Nachname"
                      value={signer.name}
                      onChange={(e) => setSigner({ ...signer, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-sm">Unterzeichner – E-Mail</Label>
                    <Input
                      type="email"
                      placeholder="name@firma.de"
                      value={signer.email}
                      onChange={(e) => setSigner({ ...signer, email: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-sm">Telefon (optional)</Label>
                    <Input
                      placeholder="+49 ..."
                      value={signer.phone || ""}
                      onChange={(e) => setSigner({ ...signer, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Button
                    onClick={submit}
                    disabled={sending || !accept || !signer.name || !signer.email}
                    className="gap-2"
                    style={{ backgroundColor: BRAND.primary }}
                  >
                    <ShoppingCart size={16} /> Jetzt verbindlich bestellen
                  </Button>
                  {ok && (
                    <div className="mt-3 flex items-center gap-2 text-green-700 text-sm">
                      <Check size={16} /> Bestellung übermittelt.
                    </div>
                  )}
                  {!!error && <div className="mt-3 text-red-600 text-sm">Fehler: {error}</div>}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* FOOTER mit rechtlichen Angaben */}
      <footer className="text-xs text-center opacity-70 pt-2">
        <div>{COMPANY.legal}</div>
        <div>
          {COMPANY.street}, {COMPANY.zip} {COMPANY.city} · Tel. {COMPANY.phone} · {COMPANY.email} · {COMPANY.web}
        </div>
        <div>{COMPANY.register}</div>
        <div>© {new Date().getFullYear()} xVoice UC</div>
      </footer>
    </div>
  );
}

// Suspense-Wrapper, damit useSearchParams in Next App Router sauber läuft
export default function Page() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto p-6">Lade…</div>}>
      <OrderClient />
    </Suspense>
  );
}
