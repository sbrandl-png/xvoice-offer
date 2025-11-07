"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, Download, Mail, ShoppingCart, Copy, Eye, Trash2 } from "lucide-react";

/**
 * XVOICE OFFER BUILDER – Next.js App Router (Client Component)
 * - Rabatte pro Position mit Maximalgrenzen
 * - Auto XVPS Menge = XVPR + XVDV + XVMO
 * - Salutation Select, Vertriebssignatur
 * - Stabile Vorschau (neuer Tab), Download, Copy mit Fallback
 * - Sauberes E-Mail-HTML in CI
 */

// ===== BRAND / COMPANY =====
const BRAND = {
  name: "xVoice UC",
  primary: "#ff4e00",
  dark: "#111111",
  headerBg: "#000000",
  headerFg: "#ffffff",
  logoUrl:
    "https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x",
} as const;

const COMPANY = {
  legal: "xVoice UC UG (Haftungsbeschränkt)",
  street: "Peter-Müller-Straße 3",
  zip: "40468",
  city: "Düsseldorf",
  phone: "+49 211 955 861 0",
  email: "vertrieb@xvoice-uc.de",
  web: "www.xvoice-uc.de",
} as const;

// ===== PRODUCTS =====
const CATALOG = [
  {
    sku: "XVPR",
    name: "xVoice UC Premium",
    price: 8.95,
    unit: "/Monat",
    desc:
      "Voller Leistungsumfang inkl. Softphone & Smartphone, Teams Add-In, ACD, Warteschleifen, Callcenter, Fax2Mail.",
  },
  {
    sku: "XVDV",
    name: "xVoice UC Device Only",
    price: 3.85,
    unit: "/Monat",
    desc:
      "Für analoge Faxe, Türsprechstellen, Räume oder reine Tischtelefon-Nutzer.",
  },
  {
    sku: "XVMO",
    name: "xVoice UC Smartphone Only",
    price: 5.70,
    unit: "/Monat",
    desc:
      "Premium-Funktionsumfang, beschränkt auf mobile Nutzung (iOS/Android/macOS).",
  },
  {
    sku: "XVTE",
    name: "xVoice UC Teams Integration",
    price: 4.75,
    unit: "/Monat",
    desc:
      "Native MS Teams Integration (Phone Standard Lizenz von Microsoft erforderlich).",
  },
  {
    sku: "XVPS",
    name: "xVoice UC Premium Service 4h SLA (je Lizenz)",
    price: 1.35,
    unit: "/Monat",
    desc:
      "4h Reaktionszeit inkl. bevorzugtem Hardwaretausch & Konfigurationsänderungen.",
  },
  {
    sku: "XVCRM",
    name: "xVoice UC Software Integration Lizenz",
    price: 5.95,
    unit: "/Monat",
    desc:
      "Integration in CRM/Helpdesk (Salesforce, HubSpot, Zendesk, Dynamics u.a.).",
  },
  {
    sku: "XVF2M",
    name: "xVoice UC Fax2Mail Service",
    price: 0.99,
    unit: "/Monat",
    desc:
      "Eingehende Faxe bequem als PDF per E-Mail (virtuelle Fax-Nebenstellen).",
  },
] as const;

// Max. Rabattgrenzen pro SKU
const MAX_DISCOUNT: Record<string, number> = {
  XVPR: 40,
  XVDV: 40,
  XVMO: 40,
  XVTE: 20,
  XVCRM: 20,
  XVF2M: 100,
  XVPS: 0,
};

// ===== TYPES =====
type Customer = {
  salutation: "Herr" | "Frau" | "";
  company: string;
  contact: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  notes: string;
};

type Salesperson = {
  name: string;
  email: string;
  phone: string;
};

// ===== UTILS =====
function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str: string) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fullCustomerAddress(c: Customer) {
  const lines = [
    c.company || "",
    c.contact || "",
    c.street || "",
    [c.zip, c.city].filter(Boolean).join(" "),
  ].filter(Boolean);
  return lines.join("\n");
}

function greetingLine(customer: Customer) {
  const name = (customer.contact || "").trim();
  if (!name) return "Guten Tag,";
  return customer.salutation === "Frau"
    ? `Sehr geehrte Frau ${name},`
    : `Sehr geehrter Herr ${name},`;
}

// ===== EMAIL HTML BUILDER =====
function buildEmailHtml(params: {
  customer: Customer;
  salesperson: Salesperson;
  lineItems: Array<{
    sku: string;
    name: string;
    desc?: string;
    price: number;
    quantity: number;
    discountPct: number;
    total: number;
  }>;
  subtotal: number;
  vatRate: number;
}) {
  const { customer, salesperson, lineItems, subtotal, vatRate } = params;

  const s = {
    body:
      "margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111",
    container: "max-width:720px;margin:0 auto;padding:24px",
    card:
      "background:#ffffff;border-radius:14px;padding:0;border:1px solid #e9e9ef;overflow:hidden",
    header: `background:${BRAND.headerBg};color:${BRAND.headerFg};padding:16px 20px;`,
    headerTable: "width:100%;border-collapse:collapse",
    logo: "display:block;height:64px;object-fit:contain",
    accent: `height:3px;background:${BRAND.primary};`,
    inner: "padding:20px",
    h1: `margin:0 0 8px 0;font-size:22px;color:${BRAND.dark}`,
    h3: `margin:0 0 8px 0;font-size:16px;color:${BRAND.dark}`,
    p: "margin:0 0 10px 0;font-size:14px;color:#333;line-height:1.6",
    pSmall: "margin:0 0 8px 0;font-size:12px;color:#666;line-height:1.5",
    th:
      "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555",
    td:
      "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5;vertical-align:top",
    totalRow: "padding:8px 8px;font-size:13px",
    btn: `display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
    btnGhost:
      "display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold",
  } as const;

  const clientImage =
    "https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full";
  const ceoPhoto =
    "https://onecdn.io/media/10febcbf-6c57-4af7-a0c4-810500fea565/full";
  const ceoSign =
    "https://onecdn.io/media/b96f734e-465e-4679-ac1b-1c093a629530/full";

  const addressCustomer = fullCustomerAddress(customer);
  const net = Math.max(0, subtotal);
  const vat = net * vatRate;
  const gross = net + vat;

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charSet="utf-8"/></head>
<body style="${s.body}">
  <div style="${s.container}">
    <div style="${s.card}">
      <div style="${s.header}">
        <table style="${s.headerTable}"><tr>
          <td style="vertical-align:middle">
            <img src="${BRAND.logoUrl}" alt="xVoice Logo" style="${s.logo}" />
          </td>
          <td style="vertical-align:middle;text-align:right">
            <p style="${s.pSmall}">${COMPANY.web} · ${COMPANY.email} · ${COMPANY.phone}</p>
          </td>
        </tr></table>
      </div>
      <div style="${s.accent}"></div>
      <div style="${s.inner}">
        <h2 style="${s.h1}">Ihr individuelles Angebot</h2>
        ${
          customer.company
            ? `<p style="${s.p}"><strong>${escapeHtml(customer.company)}</strong></p>`
            : `<p style="${s.p}"><strong>Firma unbekannt</strong></p>`
        }
        ${
          addressCustomer
            ? `<div style="background:#f2f3f7;border-radius:6px;padding:10px 14px;margin:12px 0 18px 0;line-height:1.55;font-size:13px;color:#333;">
                 ${escapeHtml(addressCustomer).replace(/\n/g, "<br>")}
               </div>`
            : ""
        }

        <p style="${s.p}">${escapeHtml(greetingLine(customer))}</p>
        <p style="${s.p}">vielen Dank für Ihr Interesse an <strong>xVoice UC</strong>. Unsere cloudbasierte Kommunikationslösung verbindet moderne Telefonie mit Microsoft&nbsp;Teams und führenden CRM-Systemen – sicher, skalierbar und in deutschen Rechenzentren betrieben.</p>

        <!-- Warum xVoice (links) + Client (rechts) -->
        <table width="100%" style="border-collapse:collapse;margin:14px 0 12px 0">
          <tr>
            <td style="padding:0 18px 0 0;vertical-align:top">
              <div style="color:#222;font-size:15px;line-height:1.6;margin-bottom:8px"><strong>Warum xVoice UC?</strong></div>
              <ul style="margin:0;padding:0 0 0 18px;color:#333">
                <li style="margin:0 0 6px 0;font-size:14px;color:#333">Nahtlose Integration in <strong>Microsoft Teams</strong> & CRM/Helpdesk</li>
                <li style="margin:0 0 6px 0;font-size:14px;color:#333"><strong>Cloud in Deutschland</strong> · DSGVO-konform</li>
                <li style="margin:0 0 6px 0;font-size:14px;color:#333">Schnelle Bereitstellung, <strong>skalierbar</strong> je Nutzer</li>
                <li style="margin:0 0 6px 0;font-size:14px;color:#333">Optionale <strong>4h-SLA</strong> & priorisierter Support</li>
              </ul>
            </td>
            <td style="padding:0;vertical-align:bottom;width:280px">
              <img src="${clientImage}" alt="xVoice UC Client" style="display:block;max-width:280px;width:100%;border-radius:12px;border:1px solid #e5e7eb" />
            </td>
          </tr>
        </table>

        <!-- Positionen / Preise -->
        <table width="100%" style="border-collapse:collapse;margin-top:14px">
          <thead>
            <tr>
              <th style="${s.th}">Position</th>
              <th style="${s.th}">Menge</th>
              <th style="${s.th}">Einzel (netto)</th>
              <th style="${s.th}">Summe (netto)</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems
              .map(
                (li) => `
              <tr>
                <td style="${s.td}">
                  <strong>${escapeHtml(li.name)}</strong>
                  ${
                    li.desc
                      ? `<div style="${s.pSmall}">${escapeHtml(li.desc)}</div>`
                      : ""
                  }
                  ${
                    li.discountPct > 0
                      ? `<div style="${s.pSmall}">Rabatt −${li.discountPct}%</div>`
                      : ""
                  }
                </td>
                <td style="${s.td}">${li.quantity}</td>
                <td style="${s.td}">${formatMoney(li.price)}</td>
                <td style="${s.td}"><strong>${formatMoney(li.total)}</strong></td>
              </tr>`
              )
              .join("")}
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(net)}</strong></td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">zzgl. USt. (19%)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(vat)}</strong></td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}"><strong>Bruttosumme</strong></td>
              <td style="${s.totalRow}"><strong>${formatMoney(gross)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
          <a href="#" style="${s.btn}">Jetzt bestellen</a>
          <a href="https://calendly.com/s-brandl-xvoice-uc/ruckfragen-zum-angebot" target="_blank" rel="noopener" style="${s.btnGhost}">Rückfrage zum Angebot</a>
        </div>
        <p style="font-size:12px;color:#666;margin-top:16px">Alle Preise in EUR netto zzgl. gesetzlicher Umsatzsteuer. Änderungen und Irrtümer vorbehalten.</p>

        <!-- Gruß & Vertrieb -->
        <div style="margin-top:18px;border-top:1px solid #eee;padding-top:12px">
          <p style="${s.p}">Mit freundlichen Grüßen</p>
          ${
            salesperson.name
              ? `<p style="${s.p}"><strong>${escapeHtml(salesperson.name)}</strong></p>`
              : ""
          }
          ${salesperson.phone ? `<p style="${s.pSmall}">Tel. ${escapeHtml(salesperson.phone)}</p>` : ""}
          ${salesperson.email ? `<p style="${s.pSmall}">${escapeHtml(salesperson.email)}</p>` : ""}
        </div>

        <!-- CEO-Block -->
        <table width="100%" style="border-collapse:collapse;margin:8px 0 0 0">
          <tr>
            <td style="vertical-align:top;width:100px;padding:0 12px 0 0">
              <img src="${ceoPhoto}" alt="Sebastian Brandl" style="display:block;width:100px;height:100px;object-fit:cover;border:1px solid #eee;border-radius:0" />
            </td>
            <td style="vertical-align:top">
              <div style="font-size:14px;color:#222;line-height:1.55">
                „Unser Ziel ist es, Kommunikation für Ihr Team spürbar einfacher zu machen – ohne Kompromisse bei Sicherheit und Service.
                Gerne begleiten wir Sie von der Planung bis zum Go-Live.“
              </div>
              <div style="margin-top:8px">
                <img src="${ceoSign}" alt="Unterschrift Sebastian Brandl" style="display:block;max-width:160px;width:100%;opacity:0.9" />
                <div style="font-size:12px;color:#555;margin-top:2px"><strong>Sebastian Brandl</strong> · Geschäftsführer</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Firmenfooter -->
        <div style="margin-top:18px;padding-top:12px;border-top:1px solid #eee">
          <p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#111">${COMPANY.legal}</p>
          <p style="margin:0;font-size:12px;color:#444">${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}</p>
          <p style="margin:0;font-size:12px;color:#444">Tel. ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ===== SMALL UI PARTS =====
function Header() {
  return (
    <div
      className="flex items-center justify-between gap-4 p-6 rounded-2xl shadow-sm"
      style={{ background: BRAND.headerBg, color: BRAND.headerFg }}
    >
      <div className="flex items-center gap-6">
        <img
          src={BRAND.logoUrl}
          alt="xVoice Logo"
          className="h-20 w-20 object-contain"
        />
        <div className="text-sm opacity-80" style={{ color: BRAND.headerFg }}>
          Angebots- und Bestell-Konfigurator
        </div>
      </div>
      <div className="text-sm" style={{ color: "#d1d5db" }}>
        Stand {todayIso()}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: React.PropsWithChildren<{ title: string; action?: React.ReactNode }>) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: BRAND.dark }}>
            {title}
          </h2>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ProductRow({
  item,
  qty,
  onQty,
  discount,
  onDiscount,
  readOnly,
  helper,
  maxDiscount,
}: {
  item: typeof CATALOG[number];
  qty: number;
  onQty: (v: number) => void;
  discount: number;
  onDiscount: (v: number) => void;
  readOnly?: boolean;
  helper?: string;
  maxDiscount: number;
}) {
  const capped = Math.max(0, Math.min(maxDiscount, discount || 0));
  const total = item.price * (1 - capped / 100) * (qty || 0);
  const capHint = `Max. ${maxDiscount}%`;

  return (
    <div className="grid grid-cols-[minmax(260px,1fr)_100px_120px_120px_120px] items-start gap-4 py-3 border-b last:border-none">
      <div>
        <div className="font-medium">{item.name}</div>
        <div className="text-xs text-muted-foreground">
          {item.sku} · {item.desc}
        </div>
      </div>

      <div className="text-sm font-medium tabular-nums">
        {formatMoney(item.price)}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step={1}
          value={qty}
          onChange={(e) => onQty(Number(e.target.value || 0))}
          className="w-24"
          disabled={!!readOnly}
        />
        <span className="text-xs text-muted-foreground">{item.unit}</span>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={maxDiscount}
          step={1}
          value={capped}
          onChange={(e) =>
            onDiscount(
              Math.max(0, Math.min(maxDiscount, Number(e.target.value || 0)))
            )
          }
          className="w-24"
          disabled={maxDiscount === 0}
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>

      <div className="text-right font-semibold tabular-nums">
        {formatMoney(total)}
      </div>

      <div className="col-span-5 -mt-2 text-xs text-muted-foreground">
        {helper ? `${helper} · ${capHint}` : capHint}
      </div>
    </div>
  );
}

// ===== SAFE CLIPBOARD =====
async function safeCopyToClipboard(text: string): Promise<{ ok: boolean }> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
  } catch {
    // ignore and try fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(ta);
    return { ok: Boolean(copied) };
  } catch {
    return { ok: false };
  }
}

// ===== PAGE =====
export default function Page() {
  // Mengen pro SKU
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(CATALOG.map((p) => [p.sku, 0]))
  );

  // Rabatt % pro SKU (wird hart gekappt)
  const [discountBySku, setDiscountBySku] = useState<Record<string, number>>(
    Object.fromEntries(CATALOG.map((p) => [p.sku, 0]))
  );

  // Fixe USt.
  const [vatRate] = useState(0.19);

  // Kunde
  const [customer, setCustomer] = useState<Customer>({
    salutation: "",
    company: "",
    contact: "",
    email: "",
    phone: "",
    street: "",
    zip: "",
    city: "",
    notes: "",
  });

  // Vertrieb
  const [salesperson, setSalesperson] = useState<Salesperson>({
    name: "",
    email: "vertrieb@xvoice-uc.de",
    phone: "",
  });

  // Service-Lizenzen automatisch
  const serviceAutoQty = useMemo(
    () => (qty["XVPR"] || 0) + (qty["XVDV"] || 0) + (qty["XVMO"] || 0),
    [qty]
  );

  // Positionen mit Rabattkappung
  const lineItems = useMemo(() => {
    return CATALOG.filter((p) =>
      p.sku === "XVPS" ? serviceAutoQty > 0 : (qty[p.sku] || 0) > 0
    ).map((p) => {
      const q = p.sku === "XVPS" ? serviceAutoQty : (qty[p.sku] || 0);
      const cap = MAX_DISCOUNT[p.sku] ?? 0;
      const d = Math.max(0, Math.min(cap, discountBySku[p.sku] || 0));
      const total = p.price * (1 - d / 100) * q;
      return {
        ...p,
        quantity: q,
        discountPct: d,
        total,
      };
    });
  }, [qty, discountBySku, serviceAutoQty]);

  // Summen
  const subtotal = useMemo(
    () => lineItems.reduce((s, li) => s + li.total, 0),
    [lineItems]
  );

  const offerHtml = useMemo(
    () =>
      buildEmailHtml({
        customer,
        salesperson,
        lineItems,
        subtotal,
        vatRate,
      }),
    [customer, salesperson, lineItems, subtotal, vatRate]
  );

  // UI-State
  const [error, setError] = useState("");
  const [sendOk, setSendOk] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [copyError, setCopyError] = useState("");

  // Aktionen
  function openPreviewNewTab() {
    try {
      const blob = new Blob([offerHtml], {
        type: "text/html;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener");
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 5000);
      if (w) return;
    } catch {}
    try {
      const dataUrl =
        "data:text/html;charset=utf-8," + encodeURIComponent(offerHtml);
      window.open(dataUrl, "_blank", "noopener");
    } catch (err) {
      setError("Vorschau blockiert: " + String(err));
    }
  }

  function handleDownloadHtml() {
    try {
      const blob = new Blob([offerHtml], {
        type: "text/html;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xvoice_angebot_${todayIso()}.html`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 0);
      return;
    } catch {}
    try {
      const a = document.createElement("a");
      a.href = "data:text/html;charset=utf-8," + encodeURIComponent(offerHtml);
      a.download = `xvoice_angebot_${todayIso()}.html`;
      a.target = "_blank";
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError("Download blockiert: " + String(err));
    }
  }

  function resetAll() {
    setQty(Object.fromEntries(CATALOG.map((p) => [p.sku, 0])));
    setDiscountBySku(Object.fromEntries(CATALOG.map((p) => [p.sku, 0])));
    setCustomer({
      salutation: "",
      company: "",
      contact: "",
      email: "",
      phone: "",
      street: "",
      zip: "",
      city: "",
      notes: "",
    });
    setSalesperson({ name: "", email: "vertrieb@xvoice-uc.de", phone: "" });
    setSendOk(false);
    setError("");
    setCopyOk(false);
    setCopyError("");
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Header />

      <Section title="Produkte & Rabatte">
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[minmax(260px,1fr)_100px_120px_120px_120px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Preis</div>
            <div>Menge</div>
            <div>Rabatt %</div>
            <div className="text-right">Summe</div>
          </div>

          {CATALOG.map((item) => {
            const isService = item.sku === "XVPS";
            const q = isService ? serviceAutoQty : (qty[item.sku] || 0);
            const onQ = isService
              ? () => {}
              : (v: number) => setQty((prev) => ({ ...prev, [item.sku]: v }));
            const helper = isService
              ? "Anzahl = Summe aus Premium, Device & Smartphone (automatisch)"
              : undefined;
            const maxDisc = MAX_DISCOUNT[item.sku] ?? 0;
            const discValue = discountBySku[item.sku] || 0;
            const onDisc = (v: number) =>
              setDiscountBySku((prev) => ({ ...prev, [item.sku]: v }));

            return (
              <ProductRow
                key={item.sku}
                item={item}
                qty={q}
                onQty={onQ}
                discount={discValue}
                onDiscount={onDisc}
                readOnly={isService}
                helper={helper}
                maxDiscount={maxDisc}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-start justify-between gap-6">
          <div className="text-xs opacity-80">
            Alle Preise netto zzgl. der gültigen USt. Angaben ohne Gewähr.
            Änderungen vorbehalten.
          </div>
          <div className="space-y-1 text-sm">
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10">
              <span>Zwischensumme (netto)</span>
              <span className="tabular-nums text-right font-semibold">
                {formatMoney(subtotal)}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10">
              <span>zzgl. USt. (19%)</span>
              <span className="tabular-nums text-right">
                {formatMoney(subtotal * vatRate)}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10">
              <span className="font-semibold">Bruttosumme</span>
              <span className="tabular-nums text-right font-semibold">
                {formatMoney(subtotal * (1 + vatRate))}
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Kundendaten & Versand">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm w-20">Anrede</Label>
            <select
              className="border rounded-md h-10 px-3 text-sm"
              value={customer.salutation}
              onChange={(e) =>
                setCustomer({
                  ...customer,
                  salutation: e.target.value as Customer["salutation"],
                })
              }
            >
              <option value="">–</option>
              <option value="Herr">Herr</option>
              <option value="Frau">Frau</option>
            </select>
          </div>

          <Input
            placeholder="Ansprechpartner"
            value={customer.contact}
            onChange={(e) =>
              setCustomer({ ...customer, contact: e.target.value })
            }
          />
          <Input
            placeholder="Firma"
            value={customer.company}
            onChange={(e) =>
              setCustomer({ ...customer, company: e.target.value })
            }
          />
          <Input
            placeholder="E-Mail Kunde"
            type="email"
            value={customer.email}
            onChange={(e) =>
              setCustomer({ ...customer, email: e.target.value })
            }
          />
          <Input
            placeholder="Telefon"
            value={customer.phone}
            onChange={(e) =>
              setCustomer({ ...customer, phone: e.target.value })
            }
          />
          <Input
            placeholder="Straße & Nr."
            value={customer.street}
            onChange={(e) =>
              setCustomer({ ...customer, street: e.target.value })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="PLZ"
              value={customer.zip}
              onChange={(e) => setCustomer({ ...customer, zip: e.target.value })}
            />
            <Input
              placeholder="Ort"
              value={customer.city}
              onChange={(e) =>
                setCustomer({ ...customer, city: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-3">
            <Textarea
              placeholder="Interne Notizen (optional)"
              value={customer.notes}
              onChange={(e) =>
                setCustomer({ ...customer, notes: e.target.value })
              }
            />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="Name Vertriebsmitarbeiter"
              value={salesperson.name}
              onChange={(e) =>
                setSalesperson({ ...salesperson, name: e.target.value })
              }
            />
            <Input
              placeholder="E-Mail Vertrieb"
              type="email"
              value={salesperson.email}
              onChange={(e) =>
                setSalesperson({ ...salesperson, email: e.target.value })
              }
            />
            <Input
              placeholder="Telefon Vertrieb"
              value={salesperson.phone}
              onChange={(e) =>
                setSalesperson({ ...salesperson, phone: e.target.value })
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          <Button onClick={openPreviewNewTab} variant="secondary" className="gap-2">
            <Eye size={16} /> Vorschau (neuer Tab)
          </Button>

          <Button
            onClick={async () => {
              setCopyOk(false);
              setCopyError("");
              const r = await safeCopyToClipboard(offerHtml);
              if (r.ok) {
                setCopyOk(true);
              } else {
                setCopyError(
                  "Kopieren blockiert. HTML wird stattdessen heruntergeladen."
                );
                handleDownloadHtml();
              }
            }}
            className="gap-2"
            style={{ backgroundColor: BRAND.primary }}
          >
            <Copy size={16} /> HTML kopieren
          </Button>

          <Button onClick={handleDownloadHtml} className="gap-2" variant="outline">
            <Download size={16} /> HTML herunterladen
          </Button>

          <Button onClick={resetAll} variant="ghost" className="gap-2 text-red-600">
            <Trash2 size={16} /> Zurücksetzen
          </Button>
        </div>

        {sendOk && (
          <div className="mt-3 flex items-center gap-2 text-green-700 text-sm">
            <Check size={16} /> Erfolgreich übermittelt.
          </div>
        )}
        {!!error && (
          <div className="mt-3 text-red-600 text-sm">Fehler: {error}</div>
        )}
        {copyOk && (
          <div className="mt-3 text-green-700 text-sm">
            HTML in die Zwischenablage kopiert.
          </div>
        )}
        {!!copyError && (
          <div className="mt-3 text-amber-600 text-sm">{copyError}</div>
        )}
      </Section>

      <Section title="Live-Zusammenfassung">
        {lineItems.length === 0 ? (
          <div className="text-sm opacity-70">Noch keine Positionen gewählt.</div>
        ) : (
          <div className="space-y-2">
            {lineItems.map((li) => (
              <div key={li.sku} className="flex justify-between text-sm">
                <div>
                  {li.quantity}× {li.name} ({li.sku}
                  {li.discountPct > 0 ? `, −${li.discountPct}%` : ""})
                </div>
                <div className="tabular-nums">{formatMoney(li.total)}</div>
              </div>
            ))}
            <div className="pt-2 border-t">
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10 text-sm">
                <span>Zwischensumme (netto)</span>
                <span className="tabular-nums text-right font-semibold">
                  {formatMoney(subtotal)}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10 text-sm">
                <span>zzgl. USt. (19%)</span>
                <span className="tabular-nums text-right">
                  {formatMoney(subtotal * 0.19)}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10 text-sm">
                <span className="font-semibold">Bruttosumme</span>
                <span className="tabular-nums text-right font-semibold">
                  {formatMoney(subtotal * 1.19)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Section>

      <footer className="text-xs text-center opacity-70 pt-2">
        © {new Date().getFullYear()} xVoice UC · Angebotserstellung · Alle Angaben ohne Gewähr
      </footer>
    </div>
  );
}
