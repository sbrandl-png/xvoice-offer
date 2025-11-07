"use client";
import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Eye, Download, Mail, ShoppingCart, Trash2, Check } from "lucide-react";

// ===== Brand & Company =====
const BRAND = {
  primary: "#ff4e00",
  dark: "#111",
  headerBg: "#000000",
  headerFg: "#ffffff",
  logoUrl: "https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x",
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

// Toggle for CTA links in E-Mail
const SHOW_FEEDBACK_BTN = false; // "Rückmeldung vereinbaren"
const SHOW_INQUIRY_BTN = true;  // "Rückfrage zum Angebot"

// ===== Data (Seite 1 – Lizenzen mtl.) =====
const CATALOG = [
  { sku: "XVPR", name: "xVoice UC Premium", price: 8.95, unit: "/Monat", desc: "Voller Leistungsumfang inkl. Softphone & Smartphone, Teams Add-In, ACD, Warteschleifen, Callcenter, Fax2Mail." },
  { sku: "XVDV", name: "xVoice UC Device Only", price: 3.85, unit: "/Monat", desc: "Lizenz für einfache Endgeräte: analoge Faxe, Türsprechstellen, Räume oder reine Tischtelefon-Nutzer." },
  { sku: "XVMO", name: "xVoice UC Smartphone Only", price: 5.70, unit: "/Monat", desc: "Premium-Funktionsumfang, beschränkt auf mobile Nutzung (iOS/Android/macOS)." },
  { sku: "XVTE", name: "xVoice UC Teams Integration", price: 4.75, unit: "/Monat", desc: "Native MS Teams Integration (Phone Standard Lizenz von Microsoft erforderlich)." },
  { sku: "XVPS", name: "xVoice UC Premium Service 4h SLA (je Lizenz)", price: 1.35, unit: "/Monat", desc: "Upgrade auf 4h Reaktionszeit inkl. bevorzugtem Hardwaretausch & Konfigurationsänderungen." },
  { sku: "XVCRM", name: "xVoice UC Software Integration Lizenz", price: 5.95, unit: "/Monat", desc: "Nahtlose Integration in CRM/Helpdesk & Business-Tools (Salesforce, HubSpot, Zendesk, Dynamics u.a.)." },
  { sku: "XVF2M", name: "xVoice UC Fax2Mail Service", price: 0.99, unit: "/Monat", desc: "Eingehende Faxe bequem als PDF per E-Mail (virtuelle Fax-Nebenstellen)." },
] as const;

type CatalogItem = typeof CATALOG[number];

type Customer = {
  company: string;
  salutation: "Herr" | "Frau" | "Guten Tag";
  contact: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  notes: string;
};

type Salesperson = { name: string; email: string; phone: string };

const EMAIL_ENDPOINT = "/api/send-offer";
const ORDER_ENDPOINT = "/api/place-order";

// ===== Utils =====
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
function fullCustomerAddress(c: Customer) {
  const parts = [c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean);
  return parts.join(", ");
}
function greetingLine(c: Customer) {
  const name = (c.contact || "").trim();
  if (!name) return "Guten Tag,";
  return c.salutation === "Frau" ? `Sehr geehrte Frau ${name},` : c.salutation === "Herr" ? `Sehr geehrter Herr ${name},` : `Guten Tag ${name},`;
}

// ===== Email HTML Builder (matches requested layout) =====
function buildEmailHtml(params: {
  customer: Customer;
  salesperson: Salesperson;
  lineItems: Array<{ sku: string; name: string; desc?: string; price: number; quantity: number; total: number }>;
  subtotal: number;
  vatRate: number;
  discountPct: number;
}) {
  const { customer, salesperson, lineItems, subtotal, vatRate, discountPct } = params;

  const discountAmount = Math.max(0, Math.min(100, discountPct || 0)) / 100 * subtotal;
  const net = Math.max(0, subtotal - discountAmount);
  const vat = net * vatRate;
  const gross = net + vat;

  const s = {
    body: "margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111",
    container: "max-width:720px;margin:0 auto;padding:24px",
    card: "background:#ffffff;border-radius:14px;padding:0;border:1px solid #e9e9ef;overflow:hidden",
    header: `background:${BRAND.headerBg};color:${BRAND.headerFg};padding:16px 20px;`,
    headerTable: "width:100%;border-collapse:collapse",
    logo: "display:block;height:64px;object-fit:contain",
    accent: `height:3px;background:${BRAND.primary};`,
    inner: "padding:20px",
    h1: `margin:0 0 8px 0;font-size:22px;color:${BRAND.dark}`,
    h3: `margin:0 0 8px 0;font-size:16px;color:${BRAND.dark}`,
    p: "margin:0 0 10px 0;font-size:14px;color:#333;line-height:1.6",
    pSmall: "margin:0 0 8px 0;font-size:12px;color:#666",
    li: "margin:0 0 4px 0;font-size:14px;color:#333",
    th: "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555",
    td: "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5;vertical-align:top",
    totalRow: "padding:8px 8px;font-size:13px",
    btn: `display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
  } as const;

  const addressCustomer = fullCustomerAddress(customer);
  const clientImage = "https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full";
  const ceoPhoto = "https://onecdn.io/media/10febcbf-6c57-4af7-a0c4-810500fea565/full";
  const ceoSign = "https://onecdn.io/media/b96f734e-465e-4679-ac1b-1c093a629530/full";

  const feedbackUrl = "https://calendly.com/s-brandl-xvoice-uc/ruckfragen-zum-angebot";

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charSet="utf-8"/></head>
<body style="${s.body}">
  <div style="${s.container}">
    <div style="${s.card}">
      <div style="${s.header}">
        <table style="${s.headerTable}">
          <tr>
            <td style="vertical-align:middle"><img src="${BRAND.logoUrl}" alt="xVoice Logo" style="${s.logo}" /></td>
            <td style="vertical-align:middle;text-align:right">
              <p style="${s.pSmall}">${COMPANY.web} · ${COMPANY.email} · ${COMPANY.phone}</p>
            </td>
          </tr>
        </table>
      </div>
      <div style="${s.accent}"></div>
      <div style="${s.inner}">
        <h2 style="${s.h1}">Ihr individuelles Angebot</h2>
        <p style="${s.p}">${escapeHtml(customer.company || "Firma unbekannt")}</p>

        <p style="${s.p}">${escapeHtml(greetingLine(customer))}</p>

        <p style="${s.p}">vielen Dank für Ihr Interesse an xVoice UC. Unsere cloudbasierte Kommunikationslösung verbindet moderne Telefonie mit Microsoft&nbsp;Teams und führenden CRM‑Systemen – sicher, skalierbar und in deutschen Rechenzentren betrieben.</p>
        <p style="${s.p}">Unsere Lösung bietet Ihnen nicht nur höchste Flexibilität und Ausfallsicherheit, sondern lässt sich auch vollständig in Ihre bestehende Umgebung integrieren. Auf Wunsch übernehmen wir gerne die gesamte Koordination der Umstellung, sodass Sie sich um nichts kümmern müssen.</p>
        <p style="${s.p}">Gerne bespreche ich die nächsten Schritte gemeinsam mit Ihnen – telefonisch oder per Teams‑Call, ganz wie es Ihnen am besten passt.</p>

        ${SHOW_FEEDBACK_BTN ? `<div style="margin:6px 0 16px 0"><a href="${feedbackUrl}" style="${s.btn}" target="_blank" rel="noopener">Rückmeldung vereinbaren</a></div>` : ""}

        <p style="${s.p}">Ich freue mich auf Ihre Rückmeldung und auf die Möglichkeit, Sie bald als neuen xVoice UC Kunden zu begrüßen.</p>

        <div style="margin:18px 0 8px 0">
          <h3 style="${s.h3}">Warum xVoice UC?</h3>
          <ul style="padding-left:18px;margin:8px 0 12px 0">
            <li style="${s.li}">Nahtlose Integration in Microsoft Teams & CRM/Helpdesk</li>
            <li style="${s.li}">Cloud in Deutschland · DSGVO‑konform</li>
            <li style="${s.li}">Schnelle Bereitstellung, skalierbar je Nutzer</li>
            <li style="${s.li}">Optionale 4h‑SLA & priorisierter Support</li>
          </ul>
        </div>

        <div style="margin:8px 0 12px 0">
          <img src="${clientImage}" alt="xVoice UC Client" style="width:100%;max-width:700px;border-radius:10px;border:1px solid #eee;display:block" />
        </div>

        <table width="100%" style="border-collapse:collapse;margin-top:10px">
          <thead>
            <tr>
              <th style="${s.th}">Position</th>
              <th style="${s.th}">Menge</th>
              <th style="${s.th}">Einzel (netto)</th>
              <th style="${s.th}">Summe (netto)</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map(li => `
              <tr>
                <td style="${s.td}"><strong>${escapeHtml(li.name)}</strong><div style="font-size:11px;color:#777">${li.sku}${li.desc ? ` · ${escapeHtml(li.desc)}` : ""}</div></td>
                <td style="${s.td}">${li.quantity}</td>
                <td style="${s.td}">${formatMoney(li.price)}</td>
                <td style="${s.td}"><strong>${formatMoney(li.total)}</strong></td>
              </tr>
            `).join("")}
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(subtotal)}</strong></td>
            </tr>
            ${discountAmount > 0 ? `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme nach Rabatt</td>
              <td style="${s.totalRow}"><strong>${formatMoney(net)}</strong></td>
            </tr>` : ""}
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
          ${SHOW_INQUIRY_BTN ? `<a href="${feedbackUrl}" style="${s.btn}" target="_blank" rel="noopener">Rückfrage zum Angebot</a>` : ""}
        </div>

        <p style="${s.pSmall};margin-top:16px">Alle Preise in EUR netto zzgl. gesetzlicher Umsatzsteuer. Änderungen und Irrtümer vorbehalten.</p>

        <div style="margin-top:18px">
          <p style="${s.p}">Mit freundlichen Grüßen</p>
          <p style="${s.p}">${salesperson.name ? `<strong>${escapeHtml(salesperson.name)}</strong><br/>` : ""}${escapeHtml(salesperson.email || COMPANY.email)}${salesperson.phone ? ` · ${escapeHtml(salesperson.phone)}` : ""}</p>
        </div>

        <div style="margin-top:20px;border-top:1px solid #eee;padding-top:16px;text-align:center">
          <img src="${ceoPhoto}" alt="Sebastian Brandl" style="width:120px;margin-bottom:10px;display:inline-block;border-radius:10px" />
          <p style="${s.p}"><em>„Unser Ziel ist es, Kommunikation für Ihr Team spürbar einfacher zu machen – ohne Kompromisse bei Sicherheit und Service. Gerne begleiten wir Sie von der Planung bis zum Go‑Live.“</em></p>
          <img src="${ceoSign}" alt="Unterschrift Sebastian Brandl" style="width:160px;margin-top:6px;display:inline-block" />
          <p style="${s.p}"><strong>Sebastian Brandl</strong> · Geschäftsführer</p>
        </div>

        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">
          <p style="${s.pSmall}">${COMPANY.legal}</p>
          <p style="${s.pSmall}">${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}</p>
          <p style="${s.pSmall}">Tel. ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}</p>
          <p style="${s.pSmall}">© ${new Date().getFullYear()} xVoice UC · Impressum & Datenschutz auf xvoice-uc.de</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ===== Small UI Parts =====
function Header() {
  return (
    <div className="flex items-center justify-between gap-4 p-6 rounded-2xl shadow-sm" style={{ background: BRAND.headerBg, color: BRAND.headerFg }}>
      <div className="flex items-center gap-6">
        <img src={BRAND.logoUrl} alt="xVoice Logo" className="h-20 w-20 object-contain" />
        <div>
          <div className="text-sm opacity-80" style={{ color: BRAND.headerFg }}>Stand {todayIso()}</div>
        </div>
      </div>
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

function ProductRow({ item, qty, onQty, readOnly, helper }: { item: CatalogItem; qty: number; onQty: (v: number) => void; readOnly?: boolean; helper?: string }) {
  return (
    <div className="grid grid-cols-[minmax(180px,1fr)_80px_120px_100px] items-start gap-4 py-3 border-b last:border-none">
      <div>
        <div className="font-medium">{item.name}</div>
        <div className="text-xs text-muted-foreground">{item.sku} · {item.desc}</div>
      </div>
      <div className="text-sm font-medium tabular-nums">{formatMoney(item.price)}</div>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} step={1} value={qty} onChange={(e) => onQty(Number(e.target.value || 0))} className="w-24" disabled={readOnly} />
        <span className="text-xs text-muted-foreground">{item.unit}</span>
      </div>
      <div className="text-right font-semibold tabular-nums">{formatMoney(item.price * qty)}</div>
      {helper ? <div className="col-span-4 text-xs text-muted-foreground -mt-2">{helper}</div> : null}
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
      <span className={"tabular-nums text-right " + (strong ? "font-semibold" : "")}>{value}</span>
    </div>
  );
  return (
    <div className="space-y-1 text-sm">
      <Row label="Zwischensumme (netto)" value={formatMoney(subtotal)} />
      {discountAmount > 0 && <Row label="Zwischensumme nach Rabatt" value={formatMoney(subtotal - discountAmount)} />}
      <Row label={`zzgl. USt. (19%)`} value={formatMoney(vat)} />
      <Row label="Bruttosumme" value={formatMoney(gross)} strong />
    </div>
  );
}

// ===== Page =====
export default function Page() {
  // quantities
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(CATALOG.map(p => [p.sku, 0])));
  const [vatRate] = useState(0.19);
  const [discountPct, setDiscountPct] = useState(0);

  // auto-quantity for Premium Service (XVPS) = sum of XVPR + XVDV + XVMO
  const serviceQty = (qty["XVPR"] || 0) + (qty["XVDV"] || 0) + (qty["XVMO"] || 0);

  // customer
  const [customer, setCustomer] = useState<Customer>({
    company: "",
    salutation: "Guten Tag",
    contact: "",
    email: "",
    phone: "",
    street: "",
    zip: "",
    city: "",
    notes: "",
  });

  // salesperson signature
  const [sales, setSales] = useState<Salesperson>({ name: "", email: "", phone: "" });
  const [salesEmail, setSalesEmail] = useState("vertrieb@xvoice-uc.de");
  const [subject, setSubject] = useState("Ihr individuelles xVoice UC Angebot");

  // derived lines
  const lineItems = useMemo(() => {
    return CATALOG.map((p) => {
      const baseQty = p.sku === "XVPS" ? serviceQty : (qty[p.sku] || 0);
      return { ...p, quantity: baseQty, total: p.price * baseQty };
    }).filter(li => li.quantity > 0);
  }, [qty, serviceQty]);

  const subtotal = useMemo(() => lineItems.reduce((s, li) => s + li.total, 0), [lineItems]);
  const discountAmount = Math.max(0, Math.min(100, discountPct)) / 100 * subtotal;
  const totals = { subtotal, discountPct, discountAmount, vat: (subtotal - discountAmount) * vatRate, gross: (subtotal - discountAmount) * (1 + vatRate) } as const;

  const offerHtml = useMemo(() => buildEmailHtml({ customer, salesperson: sales, lineItems, subtotal, vatRate, discountPct }), [customer, sales, lineItems, subtotal, vatRate, discountPct]);

  // UX state
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState(false);
  const [error, setError] = useState("");

  function openPreviewNewTab() {
    try {
      const blob = new Blob([offerHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener");
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 5000);
      if (w) return;
    } catch {}
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
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 0);
      return;
    } catch {}
    try {
      const a = document.createElement("a");
      a.href = "data:text/html;charset=utf-8," + encodeURIComponent(offerHtml);
      a.download = `xvoice_angebot_${todayIso()}.html`;
      a.target = "_blank"; a.rel = "noopener"; a.style.display = "none";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (err) { setError("Download blockiert: " + String(err)); }
  }

  async function postJson(url: string, payload: any) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(await res.text());
    return res.json().catch(() => ({}));
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
    setCustomer({ company: "", salutation: "Guten Tag", contact: "", email: "", phone: "", street: "", zip: "", city: "", notes: "" });
    setSales({ name: "", email: "", phone: "" });
    setSendOk(false); setError(""); setDiscountPct(0);
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
          <div className="grid grid-cols-[minmax(180px,1fr)_80px_120px_100px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Preis</div>
            <div>Menge</div>
            <div className="text-right">Summe</div>
          </div>
          {CATALOG.map((item) => {
            const isService = item.sku === "XVPS";
            const q = isService ? serviceQty : (qty[item.sku] || 0);
            const onQ = isService ? () => {} : (v: number) => setQty((prev) => ({ ...prev, [item.sku]: v }));
            const helper = isService ? "Anzahl = Summe aus Premium, Device & Smartphone (automatisch)" : undefined;
            return (
              <ProductRow key={item.sku} item={item} qty={q} onQty={onQ} readOnly={isService} helper={helper} />
            );
          })}
        </div>

        <div className="mt-5 flex items-start justify-between gap-6">
          <div className="text-xs opacity-80">Alle Preise netto zzgl. der gültigen USt. Angaben ohne Gewähr. Änderungen vorbehalten.</div>
          <Totals subtotal={subtotal} discountAmount={discountAmount} vatRate={0.19} />
        </div>
      </Section>

      <Section title="Kundendaten & Versand">
        <div className="grid md:grid-cols-3 gap-4">
          <Input placeholder="Firma" value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} />
          <select className="border rounded px-3 py-2 text-sm" value={customer.salutation} onChange={(e) => setCustomer({ ...customer, salutation: e.target.value as Customer["salutation"] })}>
            <option>Guten Tag</option>
            <option>Herr</option>
            <option>Frau</option>
          </select>
          <Input placeholder="Ansprechpartner" value={customer.contact} onChange={(e) => setCustomer({ ...customer, contact: e.target.value })} />
          <Input placeholder="E-Mail Kunde" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
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

        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <div className="md:col-span-2 grid grid-cols-3 gap-2 items-center">
            <Input placeholder="Vertrieb – Name" value={sales.name} onChange={(e) => setSales({ ...sales, name: e.target.value })} />
            <Input placeholder="Vertrieb – E-Mail" type="email" value={sales.email} onChange={(e) => setSales({ ...sales, email: e.target.value })} />
            <Input placeholder="Vertrieb – Telefon" value={sales.phone} onChange={(e) => setSales({ ...sales, phone: e.target.value })} />
          </div>
          <Input placeholder="Betreff" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          <Button onClick={openPreviewNewTab} variant="secondary" className="gap-2"><Eye size={16}/> Vorschau (neuer Tab)</Button>
          <Button onClick={handleDownloadHtml} className="gap-2" variant="outline"><Download size={16}/> HTML herunterladen</Button>
          <Button onClick={handleSendEmail} disabled={sending} className="gap-2" style={{ backgroundColor: BRAND.primary }}><Mail size={16}/> Angebot per Mail senden</Button>
          <Button onClick={handleOrderNow} disabled={sending} className="gap-2" variant="outline"><ShoppingCart size={16}/> Jetzt bestellen</Button>
          <Button onClick={resetAll} variant="ghost" className="gap-2 text-red-600"><Trash2 size={16}/> Zurücksetzen</Button>
        </div>

        {sendOk && (<div className="mt-3 flex items-center gap-2 text-green-700 text-sm"><Check size={16}/> Erfolgreich übermittelt.</div>)}
        {!!error && (<div className="mt-3 text-red-600 text-sm">Fehler: {error}</div>)}
      </Section>

      <Section title="Live-Zusammenfassung">
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
              <Totals subtotal={subtotal} discountAmount={discountAmount} vatRate={0.19} />
            </div>
          </div>
        )}
      </Section>

      <footer className="text-xs text-center opacity-70 pt-2">© {new Date().getFullYear()} xVoice UC · Angebotserstellung · Alle Angaben ohne Gewähr</footer>
    </div>
  );
}
