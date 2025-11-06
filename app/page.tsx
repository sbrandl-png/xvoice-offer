"use client";
import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, Download, Mail, ShoppingCart, Copy, Eye, Trash2 } from "lucide-react";

/**
 * app/page.tsx – xVoice Offer Builder (deploy-ready)
 *
 * ✓ 19 % USt fix, Rabatt vor USt
 * ✓ XVPS Menge automatisch = XVPR + XVDV + XVMO (read-only)
 * ✓ Anredeauswahl (Herr/Frau) + Begrüßung in eigener Zeile
 * ✓ Kundenadresse direkt unter H1, jetzt exakt bündig mit dem Text
 * ✓ Artikeltexte unter der SKU in der Positionsliste
 * ✓ Mehr Luft: Intro ↔ Warum-Block ↔ Positionen
 * ✓ Header nur Logo (größer), Footer mit „xVoice UC UG (Haftungsbeschränkt)“
 * ✓ CTAs: Jetzt bestellen & Rückfrage zum Angebot
 * ✓ Sales-Signatur optional vor CEO-Block (CEO-Block am Ende)
 * ✓ Preview (neuer Tab), Download, Clipboard-Fallback
 * ✓ POST /api/send-offer & /api/place-order inkl. 405-Fallback (GET)
 */

// ====== TYPES ======
export type Customer = {
  salutation: "Herr" | "Frau";
  company: string;
  contact: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  notes: string;
};

type LineItem = {
  sku: string;
  name: string;
  price: number;
  unit?: string;
  desc?: string;
  quantity: number;
  total: number;
};

// ====== CI / BRAND ======
const BRAND = {
  primary: "#ff4e00",
  dark: "#43434a",
  headerBg: "#000000",
  headerFg: "#ffffff",
  logoUrl: "https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x",
} as const;

const COMPANY = {
  legalName: "xVoice UC UG (Haftungsbeschränkt)",
  street: "Peter-Müller-Straße 3",
  zip: "40468",
  city: "Düsseldorf",
  phone: "+49 211 955 861 0",
  email: "vertrieb@xvoice-uc.de",
  web: "www.xvoice-uc.de",
} as const;

const CEO = {
  name: "Sebastian Brandl",
  title: "Geschäftsführer",
  photoUrl: "https://onecdn.io/media/10febcbf-6c57-4af7-a0c4-810500fea565/full",
  signatureUrl: "https://onecdn.io/media/b96f734e-465e-4679-ac1b-1c093a629530/full",
} as const;

const PRODUCT_VISUAL = {
  ucClientUrl: "https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full",
} as const;

// ====== DATA (Seite 1 – Lizenzen mtl.) ======
const CATALOG = [
  { sku: "XVPR", name: "xVoice UC Premium", price: 8.95, unit: "/Monat", desc: "Voller Leistungsumfang inkl. Softphone & Smartphone, MS Teams, ACD, Callcenter, Fax2Mail." },
  { sku: "XVDV", name: "xVoice UC Device Only", price: 3.85, unit: "/Monat", desc: "Für analoge Faxe, Türsprechstellen, Räume oder reine Tischtelefon‑Nutzer." },
  { sku: "XVMO", name: "xVoice UC Smartphone Only", price: 5.70, unit: "/Monat", desc: "Premium‑Funktionen, beschränkt auf mobile Nutzung (iOS/Android/macOS)." },
  { sku: "XVTE", name: "xVoice UC Teams Integration", price: 4.75, unit: "/Monat", desc: "Native MS Teams Integration (Phone Standard Lizenz erforderlich)." },
  { sku: "XVPS", name: "xVoice UC Premium Service 4h SLA (je Lizenz)", price: 1.35, unit: "/Monat", desc: "4h Reaktionszeit inkl. bevorzugtem Hardwaretausch & Konfigurationsänderungen." },
  { sku: "XVCRM", name: "xVoice UC Software Integration Lizenz", price: 5.95, unit: "/Monat", desc: "Integration in CRM/Helpdesk (Salesforce, HubSpot, Zendesk, Dynamics u.a.)." },
  { sku: "XVF2M", name: "xVoice UC Fax2Mail Service", price: 0.99, unit: "/Monat", desc: "Eingehende Faxe als PDF per E‑Mail (virtuelle Fax‑Nebenstellen)." },
] as const;

const EMAIL_ENDPOINT = "/api/send-offer";
const ORDER_ENDPOINT = "/api/place-order";

// ====== UTILS ======
function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(str: string) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function greeting(customer: Customer) {
  const name = (customer.contact || "").trim();
  if (!name) return "Guten Tag";
  return customer.salutation === "Frau" ? `Sehr geehrte Frau ${name}` : `Sehr geehrter Herr ${name}`;
}

// ====== EMAIL HTML (array push, kein verschachteltes Template) ======
function buildEmailHtml(opts: {
  customer: Customer;
  lineItems: LineItem[];
  subtotal: number;
  vatRate: number; // 0.19
  discountPct: number; // 0..100
  sales?: { name?: string; email?: string; phone?: string };
}) {
  const { customer, lineItems, subtotal, vatRate, discountPct, sales } = opts;
  const discountPctClamped = Math.max(0, Math.min(100, discountPct || 0));
  const discountAmount = (discountPctClamped / 100) * subtotal;
  const net = Math.max(0, subtotal - discountAmount);
  const vat = net * vatRate;
  const gross = net + vat;
  const greet = greeting(customer);
  const address = [customer.street, `${customer.zip || ""} ${customer.city || ""}`.trim()].filter(Boolean).join(" · ");

  const s = {
    body: "margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111",
    container: "max-width:720px;margin:0 auto;padding:24px",
    card: "background:#ffffff;border-radius:14px;padding:0;border:1px solid #e9e9ef;overflow:hidden",
    header: "background:#000;color:#fff;padding:20px 22px;",
    headerTable: "width:100%;border-collapse:collapse",
    logo: "display:block;height:72px;object-fit:contain", // größer im E‑Mail Header
    subtitle: "margin:2px 0 0 0;font-size:12px;opacity:.85;color:#fff",
    accent: `height:3px;background:${BRAND.primary};`,
    inner: "padding:26px 28px 36px 28px",
    h1: `margin:0 0 12px 0;font-size:22px;color:${BRAND.dark}`,
    p: "margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#333",
    li: "margin:0 0 6px 0;font-size:14px;color:#333",
    small: "font-size:12px;color:#666",
    th: "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555",
    td: "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5",
    totalRow: "padding:8px 8px;font-size:13px",
    btn: `display:inline-block;background:${BRAND.primary};color:${BRAND.headerFg};text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
    btnGhost: "display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold",
    firmH: "margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#111",
    firm: "margin:0;font-size:12px;color:#444",
  } as const;

  const out: string[] = [];
  out.push("<!DOCTYPE html>");
  out.push('<html lang="de">');
  out.push("<head><meta charSet=\"utf-8\"/></head>");
  out.push(`<body style="${s.body}">`);
  out.push(`<div style="${s.container}">`);
  out.push(`<div style="${s.card}">`);

  // Header (nur Logo) + Kontakt rechts
  out.push(`<div style="${s.header}">`);
  out.push(`<table style="${s.headerTable}"><tr>`);
  out.push(`<td style="vertical-align:middle"><img src="${BRAND.logoUrl}" alt="xVoice Logo" style="${s.logo}" /></td>`);
  out.push(`<td style="vertical-align:middle;text-align:right"><p style="${s.subtitle}">${COMPANY.web} · ${COMPANY.email} · ${COMPANY.phone}</p></td>`);
  out.push("</tr></table>");
  out.push("</div>");
  out.push(`<div style="${s.accent}"></div>`);

  // Body
  out.push(`<div style="${s.inner}">`);
  out.push(`<h2 style="${s.h1}">Ihr individuelles Angebot</h2>`);

  // Kundenadresse direkt unter H1 – exakt bündig zum Text (kein zusätzliches linkes Padding)
  out.push(`<div style="background:#f9fafb;border:1px solid #eceff3;border-radius:10px;padding:12px 14px;margin:8px 0 18px 0">`);
  out.push(`<p style="${s.p};margin:0 0 4px 0"><strong>${escapeHtml(customer.company || "Firma unbekannt")}</strong></p>`);
  if (customer.contact) out.push(`<p style="${s.p};margin:0 0 4px 0">${escapeHtml(customer.salutation + " " + customer.contact)}</p>`);
  if (address) out.push(`<p style="${s.p};margin:0 0 4px 0">${escapeHtml(address)}</p>`);
  if (customer.email) out.push(`<p style="${s.p};margin:0">${escapeHtml(customer.email)}</p>`);
  out.push("</div>");

  // Begrüßung (eigene Zeile)
  out.push(`<p style="${s.p}"><strong>${escapeHtml(greet)},</strong></p>`);

  // Introtext – gut lesbarer Absatz
  out.push(`<p style="${s.p};margin-bottom:14px">vielen Dank für Ihr Interesse an <strong>xVoice UC</strong>. Unsere cloudbasierte Kommunikationslösung verbindet moderne Telefonie mit Microsoft&nbsp;Teams und führenden CRM‑Systemen – sicher, skalierbar und in deutschen Rechenzentren betrieben.</p>`);

  // Warum xVoice UC — großzügige Abstände
  out.push(`<table width="100%" style="border-collapse:collapse;margin:28px 0 24px 0;background:#f9fafb;border:1px solid #eceff3;border-radius:12px;overflow:hidden"><tr>`);
  out.push(`<td style="padding:22px;vertical-align:top"><div style="color:#222;font-size:15px;line-height:1.6;margin-bottom:10px"><strong>Warum xVoice UC?</strong></div><ul style="margin:0;padding:0 0 0 18px;color:#333"><li style="${s.li}">Nahtlose Integration in <strong>Microsoft Teams</strong> & CRM/Helpdesk</li><li style="${s.li}"><strong>Cloud in Deutschland</strong> · DSGVO‑konform</li><li style="${s.li}">Schnelle Bereitstellung, <strong>skalierbar</strong> je Nutzer</li><li style="${s.li}">Optionale <strong>4h‑SLA</strong> & priorisierter Support</li></ul></td>`);
  out.push(`<td style="padding:0 20px 0 0;vertical-align:bottom;width:280px"><img src="${PRODUCT_VISUAL.ucClientUrl}" alt="xVoice UC Client" style="display:block;max-width:280px;width:100%;border-radius:12px;border:1px solid #e5e7eb" /></td>`);
  out.push("</tr></table>");

  // Positionen — Luft davor
  out.push(`<table width="100%" style="border-collapse:collapse;margin-top:26px"><thead><tr><th style="${s.th}">Position</th><th style="${s.th}">Menge</th><th style="${s.th}">Einzel (netto)</th><th style="${s.th}">Summe (netto)</th></tr></thead><tbody>`);
  for (const li of lineItems) {
    const desc = li.desc ? ` · ${escapeHtml(li.desc)}` : "";
    out.push(`<tr><td style="${s.td}"><strong>${escapeHtml(li.name)}</strong><div style="${s.small}">${li.sku}${desc}</div></td><td style="${s.td}">${li.quantity}</td><td style="${s.td}">${formatMoney(li.price)}</td><td style="${s.td}"><strong>${formatMoney(li.total)}</strong></td></tr>`);
  }
  out.push(`<tr><td colspan="2"></td><td align="right" style="${s.totalRow}">Zwischensumme (netto)</td><td style="${s.totalRow}"><strong>${formatMoney(subtotal)}</strong></td></tr>`);
  if (discountAmount > 0) out.push(`<tr><td colspan="2"></td><td align="right" style="${s.totalRow}">Rabatt (${discountPctClamped}%)</td><td style="${s.totalRow}"><strong>−${formatMoney(discountAmount)}</strong></td></tr>`);
  out.push(`<tr><td colspan="2"></td><td align="right" style="${s.totalRow}">Zwischensumme nach Rabatt</td><td style="${s.totalRow}"><strong>${formatMoney(net)}</strong></td></tr>`);
  out.push(`<tr><td colspan="2"></td><td align="right" style="${s.totalRow}">zzgl. USt. (19%)</td><td style="${s.totalRow}"><strong>${formatMoney(vat)}</strong></td></tr>`);
  out.push(`<tr><td colspan="2"></td><td align="right" style="${s.totalRow}"><strong>Bruttosumme</strong></td><td style="${s.totalRow}"><strong>${formatMoney(gross)}</strong></td></tr>`);
  out.push("</tbody></table>");

  // CTAs
  out.push(`<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap"><a href="#" style="${s.btn}">Jetzt bestellen</a><a href="https://calendly.com/s-brandl-xvoice-uc/ruckfragen-zum-angebot" target="_blank" rel="noopener" style="${s.btnGhost}">Rückfrage zum Angebot</a></div>`);
  out.push(`<p style="${s.small};margin-top:16px">Alle Preise in EUR netto zzgl. gesetzlicher Umsatzsteuer. Änderungen und Irrtümer vorbehalten.</p>`);

  // Gruß + Sales-Signatur optional
  out.push(`<p style="${s.p};margin-top:14px">Mit freundlichen Grüßen</p>`);
  if (sales && (sales.name || sales.phone || sales.email)) {
    if (sales.name) out.push(`<p style="${s.p}"><strong>${escapeHtml(sales.name)}</strong></p>`);
    if (sales.phone) out.push(`<p style="${s.small}">Tel. ${escapeHtml(sales.phone)}</p>`);
    if (sales.email) out.push(`<p style="${s.small}">${escapeHtml(sales.email)}</p>`);
  }

  // Abstand zwischen Sales- und CEO-Block
  out.push('<div style="height:24px"></div>');

  // CEO Note am Ende
  out.push('<table width="100%" style="border-collapse:collapse;margin:6px 0 0 0"><tr>');
  out.push(`<td style="vertical-align:top;width:84px;padding:0 12px 0 0"><img src="${CEO.photoUrl}" alt="${CEO.name}" style="display:block;width:84px;height:84px;object-fit:cover;border:1px solid #eee;border-radius:0" /></td>`);
  out.push('<td style="vertical-align:top">');
  out.push('<div style="font-size:14px;color:#222;line-height:1.6">„Unser Ziel ist es, Kommunikation für Ihr Team spürbar einfacher zu machen – ohne Kompromisse bei Sicherheit und Service. Gerne begleiten wir Sie von der Planung bis zum Go‑Live.“</div>');
  out.push(`<div style="margin-top:10px"><img src="${CEO.signatureUrl}" alt="Unterschrift ${CEO.name}" style="display:block;max-width:170px;width:100%;opacity:0.9" /><div style="font-size:12px;color:#555;margin-top:2px"><strong>${CEO.name}</strong> · ${CEO.title}</div></div>`);
  out.push("</td></tr></table>");

  // Firmenfooter
  out.push(`<div style="margin-top:20px;padding-top:12px;border-top:1px solid #eee"><p style="font-size:12px;color:#555;margin:0 0 4px 0;font-weight:bold">${COMPANY.legalName}</p><p style="font-size:12px;color:#444;margin:0">${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}</p><p style="font-size:12px;color:#444;margin:0">Tel. ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}</p></div>`);

  out.push("</div>"); // inner
  out.push("</div>"); // card
  out.push("</div>"); // container
  out.push("</body></html>");
  return out.join("");
}

// ====== SMALL UI PARTS ======
function Header() {
  return (
    <div className="flex items-center justify-between gap-4 p-6 rounded-2xl shadow-sm" style={{ background: BRAND.headerBg, color: BRAND.headerFg }}>
      <div className="flex items-center gap-6">
        {/* größeres Logo in der App */}
        <img src={BRAND.logoUrl} alt="xVoice Logo" className="h-24 w-24 object-contain" />
      </div>
      <div className="text-sm" style={{ color: "#d1d5db" }}>Stand {todayIso()}</div>
    </div>
  );
}

function Section({ title, children, action }: React.PropsWithChildren<{ title: string; action?: React.ReactNode }>) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: BRAND.dark }}>{title}</h2>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ProductRow(
  { item, qty, onQty, readOnly, helper }:
  { item: typeof CATALOG[number]; qty: number; onQty: (v: number) => void; readOnly?: boolean; helper?: string; }
) {
  return (
    <div className="grid grid-cols-[minmax(220px,1fr)_120px_180px_120px] items-start gap-4 py-3 border-b last:border-none">
      <div>
        <div className="font-medium">{item.name}</div>
        <div className="text-xs text-muted-foreground">{item.sku} · {item.desc}</div>
      </div>
      <div className="text-sm font-medium tabular-nums">{formatMoney(item.price)}</div>
      <div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => onQty(Number(e.target.value || 0))}
            className="w-28"
            disabled={!!readOnly}
          />
          <span className="text-xs text-muted-foreground">{item.unit || "/Monat"}</span>
        </div>
        {helper && <div className="text-[11px] text-muted-foreground mt-1">{helper}</div>}
      </div>
      <div className="text-right font-semibold tabular-nums">{formatMoney(item.price * qty)}</div>
    </div>
  );
}

function Totals({ subtotal, discountAmount, vatRate }: { subtotal: number; discountAmount: number; vatRate: number; }) {
  const net = Math.max(0, subtotal - discountAmount);
  const vat = net * vatRate;
  const gross = net + vat;
  const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10">
      <span className={strong ? "font-semibold" : undefined}>{label}</span>
      <span className={("tabular-nums text-right ") + (strong ? "font-semibold" : "")}>{value}</span>
    </div>
  );
  return (
    <div className="space-y-1 text-sm">
      <Row label="Zwischensumme (netto)" value={formatMoney(subtotal)} />
      {discountAmount > 0 && <Row label="Rabatt" value={"−" + formatMoney(discountAmount)} />}
      <Row label="Zwischensumme nach Rabatt" value={formatMoney(net)} />
      <Row label={`zzgl. USt. (19%)`} value={formatMoney(vat)} />
      <Row label="Bruttosumme" value={formatMoney(gross)} strong />
    </div>
  );
}

// ====== PAGE ======
export default function Page() {
  // Mengen
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(CATALOG.map((p) => [p.sku, 0])));
  const serviceQty = useMemo(() => (qty["XVPR"] || 0) + (qty["XVDV"] || 0) + (qty["XVMO"] || 0), [qty]);

  // Rabatt & USt
  const [discountPct, setDiscountPct] = useState(0);
  const vatRate = 0.19;

  // Kunde
  const [customer, setCustomer] = useState<Customer>({ salutation: "Herr", company: "", contact: "", email: "", phone: "", street: "", zip: "", city: "", notes: "" });

  // Vertrieb / Versand
  const [salesName, setSalesName] = useState("");
  const [salesPhone, setSalesPhone] = useState("");
  const [salesEmail, setSalesEmail] = useState("vertrieb@xvoice-uc.de");
  const [subject, setSubject] = useState("Ihr individuelles xVoice UC Angebot");

  // Zeilen & Summen
  const lineItems: LineItem[] = useMemo(() => {
    return CATALOG
      .map((p) => {
        const quantity = p.sku === "XVPS" ? serviceQty : (qty[p.sku] || 0);
        return { sku: p.sku, name: p.name, price: p.price, unit: p.unit, desc: p.desc, quantity, total: p.price * quantity } as LineItem;
      })
      .filter((li) => li.quantity > 0);
  }, [qty, serviceQty]);

  const subtotal = useMemo(() => lineItems.reduce((s, li) => s + li.total, 0), [lineItems]);
  const discountAmount = Math.max(0, Math.min(100, discountPct)) / 100 * subtotal;
  const netAfterDiscount = Math.max(0, subtotal - discountAmount);
  const totals = { subtotal, discountPct, discountAmount, netAfterDiscount, vat: netAfterDiscount * vatRate, gross: netAfterDiscount * (1 + vatRate) } as const;

  const offerHtml = useMemo(
    () => buildEmailHtml({ customer, lineItems, subtotal, vatRate, discountPct, sales: { name: salesName, email: salesEmail, phone: salesPhone } }),
    [customer, lineItems, subtotal, vatRate, discountPct, salesName, salesEmail, salesPhone]
  );

  // UX State
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState(false);
  const [error, setError] = useState("");
  const [copyOk, setCopyOk] = useState(false);
  const [copyError, setCopyError] = useState("");

  // Helpers
  function openPreviewNewTab() {
    try {
      const blob = new Blob([offerHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener");
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 5000);
      if (w) return;
    } catch { /* ignore */ }
    try {
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(offerHtml);
      window.open(dataUrl, "_blank", "noopener");
    } catch (err) { setError("Vorschau blockiert: " + String(err)); }
  }

  function handleDownloadHtml() {
    try {
      const blob = new Blob([offerHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `xvoice_angebot_${todayIso()}.html`; a.style.display = "none";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 0);
      return;
    } catch { /* ignore */ }
    try {
      const a = document.createElement("a");
      a.href = "data:text/html;charset=utf-8," + encodeURIComponent(offerHtml);
      a.download = `xvoice_angebot_${todayIso()}.html`; a.target = "_blank"; a.rel = "noopener"; a.style.display = "none";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (err) { setError("Download blockiert: " + String(err)); }
  }

  async function safeCopyToClipboard(text: string) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return { ok: true as const }; } } catch { /* ignore */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return { ok: ok as boolean } as const;
    } catch { return { ok: false as const }; }
  }

  async function postJson(url: string, payload: any) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      return res.json().catch(() => ({}));
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (/UnsupportedHttpVerb|405|method not allowed/i.test(msg)) {
        const minimal = { subject: payload?.meta?.subject || "xVoice Angebot", to: (payload?.recipients || []).join(","), company: payload?.customer?.company || "" };
        const qs = new URLSearchParams({ data: JSON.stringify(minimal) }).toString();
        const res2 = await fetch(`${url}?${qs}`, { method: "GET" });
        if (!res2.ok) throw new Error(await res2.text());
        return res2.json().catch(() => ({}));
      }
      throw err;
    }
  }

  async function handleSendEmail() {
    setSending(true); setError(""); setSendOk(false);
    try {
      await postJson(EMAIL_ENDPOINT, { meta: { subject }, offerHtml, customer, lineItems, totals, recipients: [customer.email, salesEmail].filter(Boolean) });
      setSendOk(true);
    } catch (e: any) { setError(String(e?.message || e)); } finally { setSending(false); }
  }

  async function handleOrderNow() {
    setSending(true); setError(""); setSendOk(false);
    try {
      await postJson(ORDER_ENDPOINT, { orderIntent: true, offerHtml, customer, lineItems, totals });
      setSendOk(true);
    } catch (e: any) { setError(String(e?.message || e)); } finally { setSending(false); }
  }

  function resetAll() {
    setQty(Object.fromEntries(CATALOG.map((p) => [p.sku, 0])));
    setCustomer({ salutation: "Herr", company: "", contact: "", email: "", phone: "", street: "", zip: "", city: "", notes: "" });
    setSalesName(""); setSalesPhone(""); setSalesEmail("vertrieb@xvoice-uc.de");
    setSendOk(false); setError(""); setDiscountPct(0); setCopyOk(false); setCopyError("");
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Header />

      <Section
        title="Produkte auswählen"
        action={
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="discount">Rabatt %</Label>
              <Input id="discount" type="number" min={0} max={100} step={0.5} className="w-28" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value || 0))} />
            </div>
            <div className="text-xs opacity-70">USt. fest: 19%</div>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[minmax(220px,1fr)_120px_180px_120px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Preis</div>
            <div>Menge</div>
            <div className="text-right">Summe</div>
          </div>
          {CATALOG.map((item) => {
            const isService = item.sku === "XVPS";
            const q = isService ? serviceQty : (qty[item.sku] || 0);
            const onQ = isService ? (() => {}) : ((v: number) => setQty((prev) => ({ ...prev, [item.sku]: v })));
            const helper = isService ? "Anzahl = Summe aus Premium, Device & Smartphone (automatisch)" : undefined;
            return (
              <ProductRow key={item.sku} item={item} qty={q} onQty={onQ} readOnly={isService} helper={helper} />
            );
          })}
        </div>

        <div className="mt-4 flex items-start justify-between gap-6">
          <div className="text-xs opacity-80">Alle Preise netto zzgl. gesetzlicher USt. Angaben ohne Gewähr.</div>
          <Totals subtotal={subtotal} discountAmount={discountAmount} vatRate={vatRate} />
        </div>
      </Section>

      <Section title="Kundendaten & Versand">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <Label className="mb-1 block">Anrede</Label>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="salutation" value="Herr" checked={customer.salutation === "Herr"} onChange={(e) => e.target.checked && setCustomer({ ...customer, salutation: "Herr" })} />
                <span>Herr</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="salutation" value="Frau" checked={customer.salutation === "Frau"} onChange={(e) => e.target.checked && setCustomer({ ...customer, salutation: "Frau" })} />
                <span>Frau</span>
              </label>
            </div>
          </div>
          <Input placeholder="Firma" value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} />
          <Input placeholder="Ansprechpartner" value={customer.contact} onChange={(e) => setCustomer({ ...customer, contact: e.target.value })} />
          <Input placeholder="E‑Mail Kunde" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          <Input placeholder="Telefon" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          <Input placeholder="Straße & Nr." value={customer.street} onChange={(e) => setCustomer({ ...customer, street: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="PLZ" value={customer.zip} onChange={(e) => setCustomer({ ...customer, zip: e.target.value })} />
            <Input placeholder="Ort" value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <Textarea placeholder="Interne Notizen (optional)" value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mt-4">
          <Input placeholder="Vertrieb Name" value={salesName} onChange={(e) => setSalesName(e.target.value)} />
          <Input placeholder="Vertrieb Telefon" value={salesPhone} onChange={(e) => setSalesPhone(e.target.value)} />
          <div className="md:col-span-2 flex items-center gap-2">
            <Label className="text-sm">Vertrieb E‑Mail</Label>
            <Input placeholder="vertrieb@xvoice-uc.de" type="email" value={salesEmail} onChange={(e) => setSalesEmail(e.target.value)} />
          </div>
          <div className="md:col-span-4">
            <Input placeholder="Betreff" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          <Button onClick={openPreviewNewTab} variant="secondary" className="gap-2"><Eye size={16}/> Vorschau (neuer Tab)</Button>
          <Button onClick={async () => { setCopyOk(false); setCopyError(""); const r = await safeCopyToClipboard(offerHtml); if (r.ok) setCopyOk(true); else { setCopyError("Kopieren blockiert. HTML wird stattdessen heruntergeladen."); handleDownloadHtml(); } }} className="gap-2" style={{ backgroundColor: BRAND.primary }}><Copy size={16}/> HTML kopieren</Button>
          <Button onClick={handleDownloadHtml} className="gap-2" variant="outline"><Download size={16}/> HTML herunterladen</Button>
          <Button onClick={handleSendEmail} disabled={sending} className="gap-2" style={{ backgroundColor: BRAND.primary }}><Mail size={16}/> Angebot per Mail senden</Button>
          <Button onClick={handleOrderNow} disabled={sending} className="gap-2" variant="outline"><ShoppingCart size={16}/> Jetzt bestellen</Button>
          <Button onClick={resetAll} variant="ghost" className="gap-2 text-red-600"><Trash2 size={16}/> Zurücksetzen</Button>
        </div>

        {sendOk && (<div className="mt-3 flex items-center gap-2 text-green-700 text-sm"><Check size={16}/> Erfolgreich übermittelt.</div>)}
        {!!error && (<div className="mt-3 text-red-600 text-sm">Fehler: {error}</div>)}
        {copyOk && (<div className="mt-3 text-green-700 text-sm">HTML in die Zwischenablage kopiert.</div>)}
        {!!copyError && (<div className="mt-3 text-amber-600 text-sm">{copyError}</div>)}
      </Section>

      <Section title="Live‑Zusammenfassung">
        {lineItems.length === 0 ? (
          <div className="text-sm opacity-70">Noch keine Positionen gewählt.</div>
        ) : (
          <div className="space-y-2">
            {lineItems.map((li) => (
              <div key={li.sku} className="flex justify-between text-sm">
                <div>{li.quantity}× {li.name} ({li.sku})</div>
                <div className="tabular-nums">{formatMoney(li.total)}</div>
              </div>
            ))}
            <div className="pt-2 border-t">
              <Totals subtotal={subtotal} discountAmount={discountAmount} vatRate={vatRate} />
            </div>
          </div>
        )}
      </Section>

      <footer className="text-xs text-center opacity-70 pt-2">© {new Date().getFullYear()} xVoice UC · Angebotserstellung · Alle Angaben ohne Gewähr</footer>
    </div>
  );
}
