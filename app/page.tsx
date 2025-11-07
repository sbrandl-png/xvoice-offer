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
 * - 19% USt
 * - XVPS Menge = XVPR + XVDV + XVMO (read-only)
 * - Setup-Pauschale (einmalig) per Tier abhängig von Summe (XVPR+XVDV+XVMO)
 * - Hardware (einmalig) mit max. 10% Rabatt
 * - Lizenzen (mtl.) mit individuellen Rabatt-Caps
 * - E-Mail-HTML trennt Monats- und Einmalkosten und zeigt Listen vs. Angebotspreise
 */

// ===== BRAND / COMPANY =====
const BRAND = {
  name: "xVoice UC",
  primary: "#ff4e00",
  dark: "#111111",
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
  register: "Amtsgericht Siegburg, HRB 19078",
} as const;

// ===== TYPES =====
type CatalogItem = {
  sku: string;
  name: string;
  price: number;
  unit: "/Monat" | "einmalig";
  desc?: string;
  kind: "monthly" | "hardware" | "setup" | "service";
};

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

// ===== MASTER DATA (FIX IM CODE) =====

// Lizenzen / monatlich
const LICENSES: CatalogItem[] = [
  {
    sku: "XVPR",
    name: "xVoice UC Premium",
    price: 8.95,
    unit: "/Monat",
    desc:
      "Voller Leistungsumfang inkl. Softphone & Smartphone, Teams Add-In, ACD, Warteschleifen, Callcenter, Fax2Mail.",
    kind: "monthly",
  },
  {
    sku: "XVDV",
    name: "xVoice UC Device Only",
    price: 3.85,
    unit: "/Monat",
    desc: "Für analoge Faxe, Türsprechstellen, Räume oder reine Tischtelefon-Nutzer.",
    kind: "monthly",
  },
  {
    sku: "XVMO",
    name: "xVoice UC Smartphone Only",
    price: 5.70,
    unit: "/Monat",
    desc: "Premium-Funktionsumfang, beschränkt auf mobile Nutzung (iOS/Android/macOS).",
    kind: "monthly",
  },
  {
    sku: "XVTE",
    name: "xVoice UC Teams Integration",
    price: 4.75,
    unit: "/Monat",
    desc: "Native MS Teams Integration (Phone Standard Lizenz erforderlich).",
    kind: "monthly",
  },
  {
    sku: "XVPS",
    name: "xVoice UC Premium Service 4h SLA (je Lizenz)",
    price: 1.35,
    unit: "/Monat",
    desc: "4h Reaktionszeit inkl. bevorzugtem Hardwaretausch & Konfigurationsänderungen.",
    kind: "service",
  },
  {
    sku: "XVCRM",
    name: "xVoice UC Software Integration Lizenz",
    price: 5.95,
    unit: "/Monat",
    desc: "Integration in CRM/Helpdesk (Salesforce, HubSpot, Zendesk, Dynamics u.a.).",
    kind: "monthly",
  },
  {
    sku: "XVF2M",
    name: "xVoice UC Fax2Mail Service",
    price: 0.99,
    unit: "/Monat",
    desc: "Eingehende Faxe als PDF per E-Mail (virtuelle Fax-Nebenstellen).",
    kind: "monthly",
  },
];

// Rabattobergrenzen für Lizenzen (in %)
const DISCOUNT_CAP_LICENSE: Record<string, number> = {
  XVPR: 40,
  XVDV: 40,
  XVMO: 40,
  XVTE: 20,
  XVCRM: 20,
  XVF2M: 100,
  XVPS: 0, // Service qty auto, kein Rabatt
};

// Hardware / einmalig (Beispiele – bei Bedarf anpassen)
const HARDWARE: CatalogItem[] = [
  {
    sku: "HW-YEA-T54W",
    name: "Yealink T54W Tischtelefon",
    price: 139.0,
    unit: "einmalig",
    desc: "Business-IP-Telefon mit Farbdisplay, GigE, Bluetooth/Wi-Fi.",
    kind: "hardware",
  },
  {
    sku: "HW-SNOM-D785",
    name: "Snom D785 Tischtelefon",
    price: 159.0,
    unit: "einmalig",
    desc: "High-End IP-Phone mit großem Farbdisplay.",
    kind: "hardware",
  },
  {
    sku: "HW-JAB-ENG65S",
    name: "Jabra Engage 65 Stereo Headset",
    price: 199.0,
    unit: "einmalig",
    desc: "Schnurlos, DECT, Stereo – Callcenter-tauglich.",
    kind: "hardware",
  },
  {
    sku: "HW-GIG-N510",
    name: "Gigaset N510 IP PRO DECT-Basis",
    price: 79.0,
    unit: "einmalig",
    desc: "Professionelle DECT-Basisstation für IP-Telefonie.",
    kind: "hardware",
  },
];

// Hardware Rabattobergrenze (global)
const DISCOUNT_CAP_HARDWARE = 10;

// Setup-Pauschalen (einmalig) abhängig von Summe XVPR+XVDV+XVMO
// >>> Bitte bei Bedarf exakt anpassen <<<
const SETUP_TIERS: Array<{ min: number; max: number; sku: string; name: string; price: number }> = [
  { min: 1,  max: 5,   sku: "SETUP-T1", name: "Installations- & Konfigurationspauschale (bis 5 Nutzer)",  price: 149.0 },
  { min: 6,  max: 10,  sku: "SETUP-T2", name: "Installations- & Konfigurationspauschale (6–10 Nutzer)",  price: 249.0 },
  { min: 11, max: 20,  sku: "SETUP-T3", name: "Installations- & Konfigurationspauschale (11–20 Nutzer)", price: 399.0 },
  { min: 21, max: 50,  sku: "SETUP-T4", name: "Installations- & Konfigurationspauschale (21–50 Nutzer)", price: 699.0 },
  { min: 51, max: 100, sku: "SETUP-T5", name: "Installations- & Konfigurationspauschale (51–100 Nutzer)",price: 1199.0 },
];

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
    c.company ? c.company : "",
    c.contact ? c.contact : "",
    c.street ? c.street : "",
    [c.zip, c.city].filter(Boolean).join(" "),
    c.email ? c.email : "",
    c.phone ? c.phone : "",
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

// ===== EMAIL HTML BUILDER (trennt monatlich / einmalig) =====
function buildEmailHtml(params: {
  customer: Customer;
  salesperson: Salesperson;
  monthlyItems: Array<{ sku: string; name: string; desc?: string; listUnit: number; offerUnit: number; quantity: number; listTotal: number; offerTotal: number; pct: number }>;
  oneTimeItems: Array<{ sku: string; name: string; desc?: string; listUnit: number; offerUnit: number; quantity: number; listTotal: number; offerTotal: number; pct: number }>;
  monthlySubtotal: number;
  oneTimeSubtotal: number;
  vatRate: number;
}) {
  const { customer, salesperson, monthlyItems, oneTimeItems, monthlySubtotal, oneTimeSubtotal, vatRate } = params;

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
    pSmall: "margin:0 0 8px 0;font-size:12px;color:#666;line-height:1.5",
    li: "margin:0 0 4px 0;font-size:14px;color:#333",
    th: "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap",
    td: "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5;vertical-align:top",
    totalRow: "padding:10px 8px;font-size:13px;white-space:nowrap",
    priceList: "display:inline-block;text-decoration:line-through;opacity:.6;margin-right:8px",
    priceOffer: `display:inline-block;color:${BRAND.primary};font-weight:bold`,
    badge: `display:inline-block;background:${BRAND.primary};color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;margin-left:8px;vertical-align:middle`,
    btn: `display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
    btnGhost: "display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold",
    totalsBox: "margin-top:12px;background:#f9fafb;border:1px solid #eceff3;border-radius:10px;padding:12px",
  } as const;

  const clientImage = "https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full";
  const ceoPhoto   = "https://onecdn.io/media/10febcbf-6c57-4af7-a0c4-810500fea565/full";
  const ceoSign    = "https://onecdn.io/media/b96f734e-465e-4679-ac1b-1c093a629530/full";

  const addressCustomer = fullCustomerAddress(customer);

  const monthlyListSubtotal = monthlyItems.reduce((s, r) => s + r.listTotal, 0);
  const oneTimeListSubtotal = oneTimeItems.reduce((s, r) => s + r.listTotal, 0);
  const monthlyDiscount = Math.max(0, monthlyListSubtotal - monthlySubtotal);
  const oneTimeDiscount = Math.max(0, oneTimeListSubtotal - oneTimeSubtotal);

  const net = monthlySubtotal + oneTimeSubtotal;
  const vat = net * vatRate;
  const gross = net + vat;

  const renderItems = (items: typeof monthlyItems) =>
    items.map((li) => {
      const priceCell =
        li.pct > 0
          ? `<span style="${s.priceList}">${formatMoney(li.listUnit)}</span>
             <span style="${s.priceOffer}">${formatMoney(li.offerUnit)}</span>
             <span style="${s.badge}">-${li.pct}%</span>`
          : `<span>${formatMoney(li.offerUnit)}</span>`;
      const totalCell =
        li.pct > 0
          ? `<span style="${s.priceList}">${formatMoney(li.listTotal)}</span>
             <strong>${formatMoney(li.offerTotal)}</strong>`
          : `<strong>${formatMoney(li.offerTotal)}</strong>`;

      return `
        <tr>
          <td style="${s.td}">
            <strong>${escapeHtml(li.name)}</strong>
            ${li.desc ? `<div style="${s.pSmall}">${escapeHtml(li.desc)}</div>` : ""}
            <div style="${s.pSmall}">${li.sku}</div>
          </td>
          <td style="${s.td}">${li.quantity}</td>
          <td style="${s.td};white-space:nowrap">${priceCell}</td>
          <td style="${s.td};white-space:nowrap">${totalCell}</td>
        </tr>
      `;
    }).join("");

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charSet="utf-8"/></head>
<body style="${s.body}">
  <div style="${s.container}">
    <div style="${s.card}">
      <div style="${s.header}">
        <table style="${s.headerTable}">
          <tr>
            <td><img src="${BRAND.logoUrl}" alt="xVoice Logo" style="${s.logo}" /></td>
            <td style="text-align:right">
              <p style="${s.pSmall}">${COMPANY.web} · ${COMPANY.email} · ${COMPANY.phone}</p>
            </td>
          </tr>
        </table>
      </div>
      <div style="${s.accent}"></div>
      <div style="${s.inner}">
        <h2 style="${s.h1}">Ihr individuelles Angebot</h2>
        ${customer.company ? `<p style="${s.p}"><strong>${escapeHtml(customer.company)}</strong></p>` : `<p style="${s.p}"><strong>Firma unbekannt</strong></p>`}
        ${
          addressCustomer
            ? `<div style="background:#f2f3f7;border-radius:6px;padding:10px 14px;margin-top:12px;margin-bottom:18px;line-height:1.55;font-size:13px;color:#333;">${escapeHtml(addressCustomer).replace(/\n/g, "<br>")}</div>`
            : ""
        }
        <p style="${s.p}">${escapeHtml(greetingLine(customer))}</p>
        <p style="${s.p}">vielen Dank für Ihr Interesse an xVoice UC. Unsere cloudbasierte Kommunikationslösung verbindet moderne Telefonie mit Microsoft Teams und führenden CRM-Systemen – sicher, skalierbar und in deutschen Rechenzentren betrieben.</p>
        <p style="${s.p}">Unsere Lösung bietet Ihnen nicht nur höchste Flexibilität und Ausfallsicherheit, sondern lässt sich auch vollständig in Ihre bestehende Umgebung integrieren. Auf Wunsch übernehmen wir gerne die gesamte Koordination der Umstellung, sodass Sie sich um nichts kümmern müssen.</p>
        <p style="${s.p}">Gerne bespreche ich die nächsten Schritte gemeinsam mit Ihnen – telefonisch oder per Teams-Call, ganz wie es Ihnen am besten passt.</p>
        <p style="${s.p}">Ich freue mich auf Ihre Rückmeldung und auf die Möglichkeit, Sie bald als neuen xVoice UC Kunden zu begrüßen.</p>

        <!-- Warum xVoice -->
        <table width="100%" style="margin:26px 0 26px 0;border-collapse:collapse">
          <tr>
            <td style="vertical-align:top;width:55%;padding-right:20px">
              <h3 style="${s.h3}">Warum xVoice UC?</h3>
              <ul style="padding-left:18px;margin:8px 0 12px 0">
                <li style="${s.li}">Nahtlose Integration in Microsoft Teams & CRM/Helpdesk</li>
                <li style="${s.li}">Cloud in Deutschland · DSGVO-konform</li>
                <li style="${s.li}">Schnelle Bereitstellung, skalierbar je Nutzer</li>
                <li style="${s.li}">Optionale 4h-SLA & priorisierter Support</li>
              </ul>
            </td>
            <td style="vertical-align:top;width:45%">
              <img src="${clientImage}" alt="xVoice UC Client" style="width:100%;border-radius:10px;border:1px solid #eee;display:block" />
            </td>
          </tr>
        </table>

        <!-- MONATLICHE LEISTUNGEN -->
        <h3 style="${s.h3}">Monatliche Leistungen</h3>
        <table width="100%" style="border-collapse:collapse;margin-top:6px">
          <thead>
            <tr>
              <th style="${s.th}">Position</th>
              <th style="${s.th}">Menge</th>
              <th style="${s.th}">Einzelpreis</th>
              <th style="${s.th}">Summe</th>
            </tr>
          </thead>
          <tbody>
            ${renderItems(monthlyItems)}
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Listen-Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(monthlyListSubtotal)}</strong></td>
            </tr>
            ${
              monthlyDiscount > 0
                ? `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Rabatt gesamt</td>
              <td style="${s.totalRow}"><strong>−${formatMoney(monthlyDiscount)}</strong></td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme nach Rabatt (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(monthlySubtotal)}</strong></td>
            </tr>`
                : `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(monthlySubtotal)}</strong></td>
            </tr>`
            }
          </tbody>
        </table>

        <!-- EINMALIGE KOSTEN -->
        <h3 style="${s.h3};margin-top:16px">Einmalige Kosten</h3>
        <table width="100%" style="border-collapse:collapse;margin-top:6px">
          <thead>
            <tr>
              <th style="${s.th}">Position</th>
              <th style="${s.th}">Menge</th>
              <th style="${s.th}">Einzelpreis</th>
              <th style="${s.th}">Summe</th>
            </tr>
          </thead>
          <tbody>
            ${renderItems(oneTimeItems)}
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Listen-Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(oneTimeListSubtotal)}</strong></td>
            </tr>
            ${
              oneTimeDiscount > 0
                ? `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Rabatt gesamt</td>
              <td style="${s.totalRow}"><strong>−${formatMoney(oneTimeDiscount)}</strong></td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme nach Rabatt (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(oneTimeSubtotal)}</strong></td>
            </tr>`
                : `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(oneTimeSubtotal)}</strong></td>
            </tr>`
            }
          </tbody>
        </table>

        <!-- Gesamt -->
        <div style="${s.totalsBox}">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <div>Gesamtsumme netto (monatlich + einmalig)</div>
            <div><strong>${formatMoney(net)}</strong></div>
          </div>
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <div>zzgl. USt. (19%)</div>
            <div><strong>${formatMoney(vat)}</strong></div>
          </div>
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <div><strong>Bruttosumme</strong></div>
            <div><strong>${formatMoney(gross)}</strong></div>
          </div>
        </div>

        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <a href="#" style="${s.btn}">Jetzt bestellen</a>
          <a href="https://calendly.com/s-brandl-xvoice-uc/ruckfragen-zum-angebot" target="_blank" rel="noopener" style="${s.btnGhost}">Rückfrage zum Angebot</a>
        </div>

        <!-- Vertriebsgruß -->
        <div style="margin-top:18px;border-top:1px solid #eee;padding-top:12px">
          <p style="${s.p}">Mit freundlichen Grüßen</p>
          ${salesperson.name ? `<p style="${s.p}"><strong>${escapeHtml(salesperson.name)}</strong></p>` : ""}
          ${salesperson.phone ? `<p style="${s.pSmall}">Tel. ${escapeHtml(salesperson.phone)}</p>` : ""}
          ${salesperson.email ? `<p style="${s.pSmall}">${escapeHtml(salesperson.email)}</p>` : ""}
        </div>

        <!-- ORANGER TRENNSTREIFEN -->
        <div style="height:3px;background:${BRAND.primary};margin:12px 0 18px 0;"></div>

        <!-- CEO-Block -->
        <div style="margin-top:0;border-top:1px solid #eee;padding-top:14px;">
          <table width="100%" style="border-collapse:collapse">
            <tr>
              <td style="width:120px;vertical-align:top">
                <img src="${ceoPhoto}" alt="Sebastian Brandl" style="width:100%;max-width:120px;border:1px solid #eee;border-radius:0;display:block" />
              </td>
              <td style="vertical-align:top;padding-left:20px">
                <p style="${s.p}"><em>„Unser Ziel ist es, Kommunikation für Ihr Team spürbar einfacher zu machen – ohne Kompromisse bei Sicherheit und Service. Gerne begleiten wir Sie von der Planung bis zum Go-Live.“</em></p>
                <img src="${ceoSign}" alt="Unterschrift Sebastian Brandl" style="width:160px;margin-top:8px;display:block" />
                <p style="${s.p}"><strong>Sebastian Brandl</strong> · Geschäftsführer</p>
              </td>
            </tr>
          </table>
        </div>

        <p style="${s.pSmall};margin-top:16px">Alle Preise in EUR netto zzgl. gesetzlicher Umsatzsteuer. Änderungen und Irrtümer vorbehalten.</p>

        <!-- Firmen-Footer -->
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">
          <p style="${s.pSmall}">${COMPANY.legal}</p>
          <p style="${s.pSmall}">${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}</p>
          <p style="${s.pSmall}">Tel. ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}</p>
          <p style="${s.pSmall}">${COMPANY.register}</p>
          <p style="${s.pSmall}">© ${new Date().getFullYear()} xVoice UC · Impressum & Datenschutz auf xvoice-uc.de</p>
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
        <img src={BRAND.logoUrl} alt="xVoice Logo" className="h-20 w-20 object-contain" />
        <div>
          <div className="text-2xl font-semibold" style={{ color: BRAND.headerFg }} />
          <div className="text-sm opacity-80" style={{ color: BRAND.headerFg }}>
            Angebots- und Bestell-Konfigurator
          </div>
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
  discountPct,
  onDiscountPct,
  readOnly,
  helper,
  cap,
}: {
  item: CatalogItem;
  qty: number;
  onQty: (v: number) => void;
  discountPct: number;
  onDiscountPct: (v: number) => void;
  readOnly?: boolean;
  helper?: string;
  cap: number; // max Rabatt in %
}) {
  const capped = Math.max(0, Math.min(cap, isFinite(discountPct) ? discountPct : 0));
  const priceAfter = item.price * (1 - capped / 100);

  return (
    <div className="grid grid-cols-[minmax(220px,1fr)_110px_minmax(260px,1fr)_120px] items-start gap-4 py-3 border-b last:border-none">
      <div>
        <div className="font-medium">{item.name}</div>
        <div className="text-xs text-muted-foreground">
          {item.sku} · {item.desc}
        </div>
      </div>

      <div className="text-sm font-medium tabular-nums">
        {formatMoney(item.price)}
        {capped > 0 && (
          <div className="text-xs">
            <span className="line-through opacity-60 mr-1">{formatMoney(item.price)}</span>
            <span className="font-semibold" style={{ color: BRAND.primary }}>
              {formatMoney(priceAfter)}
            </span>
            <span className="ml-2 px-2 py-[2px] rounded-full text-[11px] text-white" style={{ background: BRAND.primary }}>
              -{capped}%
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={0}
          step={1}
          value={qty}
          onChange={(e) => onQty(Math.max(0, Math.floor(Number(e.target.value || 0))))}
          className="w-28"
          disabled={!!readOnly}
        />
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={cap}
            step={0.5}
            value={capped}
            onChange={(e) => onDiscountPct(Math.max(0, Math.min(cap, Number(e.target.value || 0)) ))}
            className="w-28"
            disabled={cap === 0}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">max {cap}%</span>
        </div>
      </div>

      <div className="text-right font-semibold tabular-nums">
        {formatMoney(priceAfter * qty)}
      </div>

      {helper ? (
        <div className="col-span-4 -mt-2 text-xs text-muted-foreground">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function TotalsBox({
  monthlySubtotal,
  oneTimeSubtotal,
  vatRate,
  listMonthlySubtotal,
  listOneTimeSubtotal,
}: {
  monthlySubtotal: number;
  oneTimeSubtotal: number;
  vatRate: number;
  listMonthlySubtotal: number;
  listOneTimeSubtotal: number;
}) {
  const discountMonthly = Math.max(0, listMonthlySubtotal - monthlySubtotal);
  const discountOneTime = Math.max(0, listOneTimeSubtotal - oneTimeSubtotal);
  const net = monthlySubtotal + oneTimeSubtotal;
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
      <Row label="Listen-Zwischensumme monatlich" value={formatMoney(listMonthlySubtotal)} />
      {discountMonthly > 0 && <Row label="Rabatt monatlich" value={"−" + formatMoney(discountMonthly)} />}
      <Row label="Zwischensumme monatlich (netto)" value={formatMoney(monthlySubtotal)} />

      <div className="h-2" />

      <Row label="Listen-Zwischensumme einmalig" value={formatMoney(listOneTimeSubtotal)} />
      {discountOneTime > 0 && <Row label="Rabatt einmalig" value={"−" + formatMoney(discountOneTime)} />}
      <Row label="Zwischensumme einmalig (netto)" value={formatMoney(oneTimeSubtotal)} />

      <div className="h-2" />

      <Row label="Gesamtsumme netto" value={formatMoney(net)} />
      <Row label={`zzgl. USt. (19%)`} value={formatMoney(vat)} />
      <Row label="Bruttosumme" value={formatMoney(gross)} strong />
    </div>
  );
}

// ===== PAGE =====
export default function Page() {
  // Mengen
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries([...LICENSES, ...HARDWARE].map((p) => [p.sku, 0]))
  );

  // Per-Item Discounts
  const [discPct, setDiscPct] = useState<Record<string, number>>(
    Object.fromEntries([...LICENSES, ...HARDWARE].map((p) => [p.sku, 0]))
  );

  const [vatRate] = useState(0.19);

  // Customer
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

  // Salesperson
  const [salesperson, setSalesperson] = useState<Salesperson>({
    name: "",
    email: "vertrieb@xvoice-uc.de",
    phone: "",
  });

  const [salesEmail, setSalesEmail] = useState("vertrieb@xvoice-uc.de");
  const [subject, setSubject] = useState("Ihr individuelles xVoice UC Angebot");

  // Auto-Menge Service (XVPS)
  const serviceAutoQty = useMemo(
    () => (qty["XVPR"] || 0) + (qty["XVDV"] || 0) + (qty["XVMO"] || 0),
    [qty]
  );

  // Setup-Tier ermitteln
  const setupTier = useMemo(() => {
    const n = serviceAutoQty;
    return SETUP_TIERS.find(t => n >= t.min && n <= t.max) || null;
  }, [serviceAutoQty]);

  // MONATLICH: line items (mit Rabatt-Caps)
  const monthlyItems = useMemo(() => {
    const items: Array<{ sku: string; name: string; desc?: string; listUnit: number; offerUnit: number; quantity: number; listTotal: number; offerTotal: number; pct: number }> = [];

    for (const p of LICENSES) {
      const isService = p.sku === "XVPS";
      const q = isService ? serviceAutoQty : (qty[p.sku] || 0);
      if (q <= 0) continue;

      const cap = DISCOUNT_CAP_LICENSE[p.sku] ?? 0;
      const pct = Math.max(0, Math.min(cap, discPct[p.sku] || 0));
      const listUnit = p.price;
      const offerUnit = p.price * (1 - pct / 100);
      const listTotal = listUnit * q;
      const offerTotal = offerUnit * q;
      const savingPct = listUnit > 0 ? Math.round((1 - offerUnit / listUnit) * 100) : 0;

      items.push({
        sku: p.sku,
        name: p.name,
        desc: p.desc,
        listUnit,
        offerUnit,
        quantity: q,
        listTotal,
        offerTotal,
        pct: Math.max(0, Math.min(100, savingPct)),
      });
    }
    return items;
  }, [qty, discPct, serviceAutoQty]);

  // EINMALIG: Hardware + Setup
  const oneTimeItems = useMemo(() => {
    const rows: Array<{ sku: string; name: string; desc?: string; listUnit: number; offerUnit: number; quantity: number; listTotal: number; offerTotal: number; pct: number }> = [];

    // Hardware
    for (const p of HARDWARE) {
      const q = qty[p.sku] || 0;
      if (q <= 0) continue;
      const cap = DISCOUNT_CAP_HARDWARE;
      const pct = Math.max(0, Math.min(cap, discPct[p.sku] || 0));
      const listUnit = p.price;
      const offerUnit = p.price * (1 - pct / 100);
      const listTotal = listUnit * q;
      const offerTotal = offerUnit * q;
      const savingPct = listUnit > 0 ? Math.round((1 - offerUnit / listUnit) * 100) : 0;

      rows.push({
        sku: p.sku,
        name: p.name,
        desc: p.desc,
        listUnit,
        offerUnit,
        quantity: q,
        listTotal,
        offerTotal,
        pct: Math.max(0, Math.min(100, savingPct)),
      });
    }

    // Setup-Tier (eine Position)
    if (setupTier) {
      rows.push({
        sku: setupTier.sku,
        name: setupTier.name,
        desc:
          "Mit der xVoice UC Installations- & Konfigurationspauschale richten wir Ihre Umgebung vollständig ein (Benutzer, Rufnummern, Routing, Devices, Client-Profile). Die Einrichtung erfolgt remote.",
        listUnit: setupTier.price,
        offerUnit: setupTier.price,
        quantity: 1,
        listTotal: setupTier.price,
        offerTotal: setupTier.price,
        pct: 0,
      });
    }

    return rows;
  }, [qty, discPct, setupTier]);

  // Subtotals
  const monthlySubtotal = useMemo(() => monthlyItems.reduce((s, r) => s + r.offerTotal, 0), [monthlyItems]);
  const listMonthlySubtotal = useMemo(() => monthlyItems.reduce((s, r) => s + r.listTotal, 0), [monthlyItems]);

  const oneTimeSubtotal = useMemo(() => oneTimeItems.reduce((s, r) => s + r.offerTotal, 0), [oneTimeItems]);
  const listOneTimeSubtotal = useMemo(() => oneTimeItems.reduce((s, r) => s + r.listTotal, 0), [oneTimeItems]);

  // EMAIL HTML
  const offerHtml = useMemo(
    () =>
      buildEmailHtml({
        customer,
        salesperson,
        monthlyItems,
        oneTimeItems,
        monthlySubtotal,
        oneTimeSubtotal,
        vatRate,
      }),
    [customer, salesperson, monthlyItems, oneTimeItems, monthlySubtotal, oneTimeSubtotal, vatRate]
  );

  // UX state
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
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch {}
      }, 5000);
      if (w) return;
    } catch {}
    try {
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(offerHtml);
      window.open(dataUrl, "_blank", "noopener");
    } catch (err) {
      setError("Vorschau blockiert: " + String(err));
    }
  }

  function handleDownloadHtml() {
    try {
      const blob = new Blob([offerHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xvoice_angebot_${todayIso()}.html`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 0);
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

  async function safeCopyToClipboard(text: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return { ok: true as const, via: "clipboard" as const };
      }
    } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return { ok: !!ok as const, via: "execCommand" as const };
    } catch (error) {
      return { ok: false as const, via: "blocked" as const, error };
    }
  }

  // Dummy endpoints (anpassbar)
  const EMAIL_ENDPOINT = "/api/send-offer";
  const ORDER_ENDPOINT = "/api/place-order";

  async function postJson(url: string, payload: any) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json().catch(() => ({}));
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (/UnsupportedHttpVerb|405|method not allowed/i.test(msg)) {
        const minimal = {
          subject: payload?.meta?.subject || "xVoice Angebot",
          to: (payload?.recipients || []).join(","),
          company: payload?.customer?.company || "",
        };
        const qs = new URLSearchParams({ data: JSON.stringify(minimal) }).toString();
        const res2 = await fetch(`${url}?${qs}`, { method: "GET" });
        if (!res2.ok) throw new Error(await res2.text());
        return res2.json().catch(() => ({}));
      }
      throw err;
    }
  }

  async function handleSendEmail() {
    setSending(true);
    setError("");
    setSendOk(false);
    try {
      await postJson(EMAIL_ENDPOINT, {
        meta: { subject },
        offerHtml,
        customer,
        monthlyItems,
        oneTimeItems,
        totals: {
          monthlySubtotal,
          oneTimeSubtotal,
          vat: (monthlySubtotal + oneTimeSubtotal) * vatRate,
          gross: (monthlySubtotal + oneTimeSubtotal) * (1 + vatRate),
        },
        salesperson,
        recipients: [customer.email, salesEmail].filter(Boolean),
      });
      setSendOk(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  async function handleOrderNow() {
    setSending(true);
    setError("");
    setSendOk(false);
    try {
      await postJson(ORDER_ENDPOINT, {
        orderIntent: true,
        offerHtml,
        customer,
        monthlyItems,
        oneTimeItems,
        totals: {
          monthlySubtotal,
          oneTimeSubtotal,
          vat: (monthlySubtotal + oneTimeSubtotal) * vatRate,
          gross: (monthlySubtotal + oneTimeSubtotal) * (1 + vatRate),
        },
      });
      setSendOk(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  function resetAll() {
    setQty(Object.fromEntries([...LICENSES, ...HARDWARE].map((p) => [p.sku, 0])));
    setDiscPct(Object.fromEntries([...LICENSES, ...HARDWARE].map((p) => [p.sku, 0])));
    setCustomer({ salutation: "", company: "", contact: "", email: "", phone: "", street: "", zip: "", city: "", notes: "" });
    setSalesperson({ name: "", email: "vertrieb@xvoice-uc.de", phone: "" });
    setSendOk(false);
    setError("");
    setCopyOk(false);
    setCopyError("");
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Header />

      {/* Lizenzen (monatlich) */}
      <Section title="1) Lizenzen (monatlich)" action={<div className="text-xs opacity-70">USt. fest: 19%</div>}>
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[minmax(220px,1fr)_110px_minmax(260px,1fr)_120px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Listenpreis</div>
            <div>Menge & Rabatt</div>
            <div className="text-right">Summe</div>
          </div>

          {LICENSES.map((item) => {
            const isService = item.sku === "XVPS";
            const q = isService ? serviceAutoQty : (qty[item.sku] || 0);
            const onQ = isService
              ? () => {}
              : (v: number) => setQty((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.floor(v)) }));
            const cap = DISCOUNT_CAP_LICENSE[item.sku] ?? 0;
            const onD = (v: number) => setDiscPct((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.min(cap, v)) }));
            const helper = isService ? "Anzahl = Summe aus Premium, Device & Smartphone (automatisch)" : undefined;

            return (
              <ProductRow
                key={item.sku}
                item={item}
                qty={q}
                onQty={onQ}
                discountPct={discPct[item.sku] || 0}
                onDiscountPct={onD}
                readOnly={isService}
                helper={helper}
                cap={cap}
              />
            );
          })}
        </div>
      </Section>

      {/* Hardware (einmalig) */}
      <Section title="2) Hardware (einmalig)">
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[minmax(220px,1fr)_110px_minmax(260px,1fr)_120px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Listenpreis</div>
            <div>Menge & Rabatt</div>
            <div className="text-right">Summe</div>
          </div>

          {HARDWARE.map((item) => {
            const q = qty[item.sku] || 0;
            const onQ = (v: number) => setQty((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.floor(v)) }));
            const cap = DISCOUNT_CAP_HARDWARE;
            const onD = (v: number) => setDiscPct((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.min(cap, v)) }));

            return (
              <ProductRow
                key={item.sku}
                item={item}
                qty={q}
                onQty={onQ}
                discountPct={discPct[item.sku] || 0}
                onDiscountPct={onD}
                readOnly={false}
                cap={cap}
              />
            );
          })}
        </div>
      </Section>

      {/* Setup (einmalig, auto) */}
      <Section title="3) Setup-Pauschale (einmalig)">
        <div className="text-sm">
          {setupTier ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{setupTier.name}</div>
                <div className="text-xs text-muted-foreground">{setupTier.sku} · automatisch anhand der Nutzeranzahl gewählt</div>
              </div>
              <div className="tabular-nums font-semibold">{formatMoney(setupTier.price)}</div>
            </div>
          ) : (
            <div className="text-muted-foreground">Wird automatisch gesetzt, sobald mindestens eine Lizenz aus Premium/Device/Smartphone gewählt wurde.</div>
          )}
        </div>
      </Section>

      {/* Zusammenfassung & Aktionen */}
      <Section title="Zusammenfassung & Versand">
        {/* Live Summaries */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="font-semibold mb-2">Monatlich</div>
            {monthlyItems.length === 0 ? (
              <div className="text-sm opacity-70">Keine monatlichen Positionen.</div>
            ) : (
              <div className="space-y-1 text-sm">
                {monthlyItems.map((li) => (
                  <div key={li.sku} className="flex justify-between">
                    <div>{li.quantity}× {li.name}</div>
                    <div className="tabular-nums">{formatMoney(li.offerTotal)}</div>
                  </div>
                ))}
                <div className="pt-2 border-t" />
              </div>
            )}
          </div>

          <div>
            <div className="font-semibold mb-2">Einmalig</div>
            {oneTimeItems.length === 0 ? (
              <div className="text-sm opacity-70">Keine einmaligen Positionen.</div>
            ) : (
              <div className="space-y-1 text-sm">
                {oneTimeItems.map((li) => (
                  <div key={li.sku} className="flex justify-between">
                    <div>{li.quantity}× {li.name}</div>
                    <div className="tabular-nums">{formatMoney(li.offerTotal)}</div>
                  </div>
                ))}
                <div className="pt-2 border-t" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <TotalsBox
            monthlySubtotal={monthlySubtotal}
            oneTimeSubtotal={oneTimeSubtotal}
            vatRate={vatRate}
            listMonthlySubtotal={listMonthlySubtotal}
            listOneTimeSubtotal={listOneTimeSubtotal}
          />
        </div>

        {/* Kundendaten */}
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm w-20">Anrede</Label>
            <select
              className="border rounded-md h-10 px-3 text-sm"
              value={customer.salutation}
              onChange={(e) =>
                setCustomer({ ...customer, salutation: e.target.value as Customer["salutation"] })
              }
            >
              <option value="">–</option>
              <option value="Herr">Herr</option>
              <option value="Frau">Frau</option>
            </select>
          </div>
          <Input placeholder="Ansprechpartner" value={customer.contact} onChange={(e) => setCustomer({ ...customer, contact: e.target.value })} />
          <Input placeholder="Firma" value={customer.company} onChange={(e) => setCustomer({ ...customer, company: e.target.value })} />
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

        {/* Vertrieb & Versand */}
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Name Vertriebsmitarbeiter" value={salesperson.name} onChange={(e) => setSalesperson({ ...salesperson, name: e.target.value })} />
            <Input placeholder="E-Mail Vertrieb" type="email" value={salesperson.email} onChange={(e) => setSalesperson({ ...salesperson, email: e.target.value })} />
            <Input placeholder="Telefon Vertrieb" value={salesperson.phone} onChange={(e) => setSalesperson({ ...salesperson, phone: e.target.value })} />
          </div>
          <Input placeholder="Betreff" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <div className="md:col-span-2 flex items-center gap-2">
            <Label className="text-sm">Vertrieb E-Mail (Kopie)</Label>
            <Input placeholder="vertrieb@xvoice-uc.de" type="email" value={salesEmail} onChange={(e) => setSalesEmail(e.target.value)} />
          </div>
        </div>

        {/* Aktionen */}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <Button onClick={openPreviewNewTab} variant="secondary" className="gap-2">
            <Eye size={16} /> Vorschau (neuer Tab)
          </Button>
          <Button
            onClick={async () => {
              setCopyOk(false);
              setCopyError("");
              const r = await safeCopyToClipboard(offerHtml);
              if (r.ok) setCopyOk(true);
              else {
                setCopyError("Kopieren blockiert. HTML wird stattdessen heruntergeladen.");
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
          <Button onClick={handleSendEmail} disabled={sending} className="gap-2" style={{ backgroundColor: BRAND.primary }}>
            <Mail size={16} /> Angebot per Mail senden
          </Button>
          <Button onClick={handleOrderNow} disabled={sending} className="gap-2" variant="outline">
            <ShoppingCart size={16} /> Jetzt bestellen
          </Button>
          <Button onClick={resetAll} variant="ghost" className="gap-2 text-red-600">
            <Trash2 size={16} /> Zurücksetzen
          </Button>
        </div>

        {sendOk && <div className="mt-3 flex items-center gap-2 text-green-700 text-sm"><Check size={16} /> Erfolgreich übermittelt.</div>}
        {!!error && <div className="mt-3 text-red-600 text-sm">Fehler: {error}</div>}
        {copyOk && <div className="mt-3 text-green-700 text-sm">HTML in die Zwischenablage kopiert.</div>}
        {!!copyError && <div className="mt-3 text-amber-600 text-sm">{copyError}</div>}
      </Section>

      <footer className="text-xs text-center opacity-70 pt-2">
        © {new Date().getFullYear()} xVoice UC · Angebotserstellung · Alle Angaben ohne Gewähr
      </footer>
    </div>
  );
}
