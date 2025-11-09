// app/order/page.tsx
"use client";

import React, { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyOrderToken } from "@/lib/orderToken";

// Verhindert statische Vor-Generierung dieser Seite
export const dynamic = "force-dynamic";

// Hilfsformatierung
function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

// Schlanke Typen (unabhängig von exakten Library-Union-Typen)
type OrderRowLite = { sku: string; name: string; quantity: number; unit: number; total: number };
type OrderPayloadLite = {
  offerId: string;
  customer: { company: string; contact: string; email: string; phone: string };
  monthlyRows: OrderRowLite[];
  oneTimeRows: OrderRowLite[];
  vatRate: number;
  createdAt: number;
};

function OrderPageInner() {
  const sp = useSearchParams();
  const rawToken = sp.get("token") || "";

  const result = useMemo(() => {
    const token = (() => {
      try { return decodeURIComponent(rawToken); } catch { return rawToken; }
    })();
    return verifyOrderToken(token);
  }, [rawToken]);

  if (!rawToken) {
    return <div className="max-w-3xl mx-auto p-6">Kein Token übergeben.</div>;
  }

  if (!result.ok) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="text-lg font-semibold">Ungültiger oder beschädigter Bestelllink</div>
            <div className="text-sm text-red-600">Fehler: {result.error}</div>
            <div className="text-sm text-muted-foreground">
              Bitte fordere das Angebot erneut an oder kontaktiere unseren Support.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const payload = result.payload as unknown as OrderPayloadLite;
  const isUnsigned = (result as any)?.unsigned === true; // optional vorhanden

  const mNet = payload.monthlyRows.reduce((a, r) => a + r.total, 0);
  const oNet = payload.oneTimeRows.reduce((a, r) => a + r.total, 0);
  const vatM = mNet * payload.vatRate;
  const vatO = oNet * payload.vatRate;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-2xl font-semibold">Bestellübersicht</div>

      {isUnsigned && (
        <div className="text-sm p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
          Hinweis: Dieser Link ist <strong>nicht</strong> kryptografisch signiert (ORDER_SECRET nicht gesetzt).
        </div>
      )}

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Angebotsnummer</div>
            <div className="font-medium">{payload.offerId}</div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Firma</div>
              <div className="font-medium">{payload.customer.company || "–"}</div>
              <div className="text-sm">{payload.customer.contact || "–"}</div>
              <div className="text-sm">{payload.customer.email || "–"}</div>
              <div className="text-sm">{payload.customer.phone || "–"}</div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Monatliche Positionen</div>
              {payload.monthlyRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">–</div>
              ) : (
                payload.monthlyRows.map((r, i) => (
                  <div key={`m-${i}`} className="flex justify-between text-sm">
                    <span>{r.quantity}× {r.name} ({r.sku})</span>
                    <span className="tabular-nums">{formatMoney(r.total)}</span>
                  </div>
                ))
              )}
              <div className="pt-2 border-t flex justify-between text-sm font-medium">
                <span>Summe mtl. (netto)</span>
                <span className="tabular-nums">{formatMoney(mNet)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>zzgl. USt.</span>
                <span className="tabular-nums">{formatMoney(vatM)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>mtl. Brutto</span>
                <span className="tabular-nums">{formatMoney(mNet + vatM)}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t space-y-1">
            <div className="text-sm font-medium">Einmalige Positionen</div>
            {payload.oneTimeRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">–</div>
            ) : (
              payload.oneTimeRows.map((r, i) => (
                <div key={`o-${i}`} className="flex justify-between text-sm">
                  <span>{r.quantity}× {r.name} ({r.sku})</span>
                  <span className="tabular-nums">{formatMoney(r.total)}</span>
                </div>
              ))
            )}
            <div className="pt-2 border-t flex justify-between text-sm font-medium">
              <span>Summe einmalig (netto)</span>
              <span className="tabular-nums">{formatMoney(oNet)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>zzgl. USt.</span>
              <span className="tabular-nums">{formatMoney(vatO)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>einmalig Brutto</span>
              <span className="tabular-nums">{formatMoney(oNet + vatO)}</span>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              onClick={async () => {
                await fetch("/api/place-order", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token: rawToken, confirm: true }),
                });
                alert("Bestellung ausgelöst. Vielen Dank!");
              }}
              style={{ backgroundColor: "#ff4e00" }}
            >
              Bestellung kostenpflichtig auslösen
            </Button>
            <Button variant="outline" onClick={() => history.back()}>Zurück</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto p-6">Lade Bestellseite…</div>}>
      <OrderPageInner />
    </Suspense>
  );
}
