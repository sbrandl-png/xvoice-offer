"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, Download, Mail, ShoppingCart, Copy, Eye, Trash2 } from "lucide-react";

/**
 * XVOICE OFFER BUILDER – Next.js App Router (Client Component)
 * - 19% USt. fix
 * - Lizenzen (monatl.) mit positionsbezogenem Rabatt (Caps)
 * - Hardware (einmalig) aus CSV, Rabatt max. 10%
 * - Automatische Konfigurationspauschale (einmalig) aus CSV, abhängig von Summe (XVPR+XVDV+XVMO)
 * - Einheitliche Feldbreite für Menge und Rabatt (6.5rem)
 * - HTML-E-Mail: Monatlich vs. Einmalig getrennt; Listen- vs. Angebotspreise sichtbar
 * - Orange Volltrenner vor CEO-Block; Footer mit Amtsgericht
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

// ===== KATALOG (monatl.) =====
const CATALOG = [
  {
    sku: "XVPR",
    name: "xVoice UC Premium",
    price: 8.95,
    unit: "/Monat",
    desc:
      "Voller Leistungsumfang inkl. Softphone & Smartphone, beliebige Hardphones, Teams Add-In, ACD, Warteschleifen, Callcenter, Fax2Mail.",
  },
  {
    sku: "XVDV",
    name: "xVoice UC Device Only",
    price: 3.85,
    unit: "/Monat",
    desc: "Lizenz für einfache Endgeräte: analoge Faxe, Türsprechstellen, Räume oder reine Tischtelefon-Nutzer.",
  },
  {
    sku: "XVMO",
    name: "xVoice UC Smartphone Only",
    price: 5.70,
    unit: "/Monat",
    desc: "Premium-Funktionsumfang, beschränkt auf mobile Nutzung (iOS/Android/macOS).",
  },
  {
    sku: "XVTE",
    name: "xVoice UC Teams Integration",
    price: 4.75,
    unit: "/Monat",
    desc: "Native MS Teams Integration (Phone Standard Lizenz von Microsoft erforderlich).",
  },
  {
    sku: "XVPS",
    name: "xVoice UC Premium Service 4h SLA (je Lizenz)",
    price: 1.35,
    unit: "/Monat",
    desc: "Upgrade auf 4h Reaktionszeit inkl. bevorzugtem Hardwaretausch & Konfigurationsänderungen.",
  },
  {
    sku: "XVCRM",
    name: "xVoice UC Software Integration Lizenz",
    price: 5.95,
    unit: "/Monat",
    desc: "Nahtlose Integration in CRM/Helpdesk & Business-Tools (Salesforce, HubSpot, Zendesk, Dynamics u.a.).",
  },
  {
    sku: "XVF2M",
    name: "xVoice UC Fax2Mail Service",
    price: 0.99,
    unit: "/Monat",
    desc: "Eingehende Faxe bequem als PDF per E-Mail (virtuelle Fax-Nebenstellen).",
  },
] as const;

// Rabattobergrenzen (in %)
const DISCOUNT_CAP: Record<string, number> = {
  XVPR: 40,
  XVDV: 40,
  XVMO: 40,
  XVTE: 20,
  XVCRM: 20,
  XVF2M: 100,
  XVPS: 0, // auto-qty, nicht rabattierbar
};

// Hardware: Rabatt fix max. 10 %
const DISCOUNT_CAP_HARDWARE = 10;

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

type HardwareRow = {
  sku: string;
  name: string;
  price: number;     // Listenpreis
  unit: string;      // z.B. "/einmalig"
  desc: string;
};

type SetupTier = {
  min: number;
  max: number | null;
  sku: string;
  name: string;
  price: number;
};

// HTML Versand
const EMAIL_ENDPOINT = "/api/send-offer";
const ORDER_ENDPOINT = "/api/place-order";

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
function safeParseNumber(inp: string) {
  // akzeptiert "1.234,56" oder "1234.56" etc.
  const s = (inp || "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

// CSV Loader (Hardware & Setup-Tiers)
async function loadCsv<T = any>(path: string): Promise<string[][]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  const delim = text.indexOf(";") !== -1 ? ";" : ",";
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) =>
      l
        .split(delim)
        .map((t) => t.replace(/^["']|["']$/g, "").trim())
    );
  return rows;
}

async function loadHardware(): Promise<HardwareRow[]> {
  try {
    const rows = await loadCsv("/hardware.csv");
    if (rows.length <= 1) return [];
    const hdr = rows[0].map((h) => h.toLowerCase());
    const idx = (re: RegExp) => hdr.findIndex((h) => re.test(h));
    const iSku = idx(/^sku|artikelnummer|artnr$/);
    const iName = idx(/^name|bezeichnung$/);
    const iPreis = idx(/^preis|vk|vk.*netto$/);
    const iEinheit = idx(/^einheit|unit$/);
    const iDesc = idx(/^beschreibung|desc$/);
    if (iSku < 0 || iName < 0 || iPreis < 0) return [];
    const out: HardwareRow[] = [];
    for (let r = 1; r < rows.length; r++) {
      const c = rows[r];
      const price = safeParseNumber(c[iPreis] || "");
      if (!isFinite(price)) continue;
      out.push({
        sku: c[iSku] || "",
        name: c[iName] || "",
        price,
        unit: iEinheit >= 0 ? c[iEinheit] || "/einmalig" : "/einmalig",
        desc: iDesc >= 0 ? c[iDesc] || "" : "",
      });
    }
    return out.filter((h) => h.sku && h.name);
  } catch {
    return [];
  }
}

async function loadSetupTiers(): Promise<SetupTier[]> {
  try {
    const rows = await loadCsv("/setup_tiers.csv");
    if (rows.length <= 1) return [];
    const hdr = rows[0].map((h) => h.toLowerCase());
    const idx = (re: RegExp) => hdr.findIndex((h) => re.test(h));
    const iMin = idx(/^min$/);
    const iMax = idx(/^max$/);
    const iSku = idx(/^sku|artikelnummer|artnr$/);
    const iName = idx(/^bezeichnung|name$/);
    const iPreis = idx(/^preis|vk|vk.*netto$/);
    if (iMin < 0 || iSku < 0 || iName < 0 || iPreis < 0) return [];
    const out: SetupTier[] = [];
    for (let r = 1; r < rows.length; r++) {
      const c = rows[r];
      const min = Number(c[iMin] || "0");
      const max = c[iMax] ? Number(c[iMax]) : null;
      const price = safeParseNumber(c[iPreis] || "");
      if (!isFinite(min) || !isFinite(price)) continue;
      out.push({
        min,
        max: isFinite(Number(max)) ? Number(max) : null,
        sku: c[iSku] || "",
        name: c[iName] || "",
        price,
      });
    }
    out.sort((a, b) => a.min - b.min);
    return out;
  } catch {
    return [];
  }
}

// ===== EMAIL HTML (Monatlich + Einmalig getrennt; Listen vs Angebot) =====
function buildEmailHtml(params: {
  customer: Customer;
  salesperson: Salesperson;
  monthly: Array<{
    sku: string;
    name: string;
    desc?: string;
    listUnit: number;
    offerUnit: number;
    quantity: number;
    listTotal: number;
    offerTotal: number;
    pct: number;
  }>;
  oneTime: Array<{
    sku: string;
    name: string;
    desc?: string;
    listUnit: number;
    offerUnit: number;
    quantity: number;
    listTotal: number;
    offerTotal: number;
    pct: number;
    unit?: string;
  }>;
  vatRate: number;
}) {
  const { customer, salesperson, monthly, oneTime, vatRate } = params;

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
    h2: `margin:14px 0 8px 0;font-size:16px;color:${BRAND.dark}`,
    h3: `margin:0 0 8px 0;font-size:16px;color:${BRAND.dark}`,
    p: "margin:0 0 10px 0;font-size:14px;color:#333;line-height:1.6",
    pSmall: "margin:0 0 8px 0;font-size:12px;color:#666;line-height:1.5",
    li: "margin:0 0 4px 0;font-size:14px;color:#333",
    th:
      "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555",
    td:
      "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5;vertical-align:top",
    totalRow: "padding:8px 8px;font-size:13px;white-space:nowrap",
    priceList:
      "display:inline-block;text-decoration:line-through;opacity:.6;margin-right:8px;white-space:nowrap",
    priceOffer: `display:inline-block;color:${BRAND.primary};font-weight:bold;white-space:nowrap`,
    badge: `display:inline-block;background:${BRAND.primary};color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;margin-left:8px;vertical-align:middle`,
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

  // Summen getrennt
  const listSubtotalMonthly = monthly.reduce((s, r) => s + r.listTotal, 0);
  const offerSubtotalMonthly = monthly.reduce((s, r) => s + r.offerTotal, 0);
  const listSubtotalOne = oneTime.reduce((s, r) => s + r.listTotal, 0);
  const offerSubtotalOne = oneTime.reduce((s, r) => s + r.offerTotal, 0);

  const listSubtotalTotal = listSubtotalMonthly + listSubtotalOne;
  const offerSubtotalTotal = offerSubtotalMonthly + offerSubtotalOne;

  const vat = offerSubtotalTotal * vatRate;
  const gross = offerSubtotalTotal + vat;

  const sectionTable = (title: string, rows: typeof monthly) => `
        <h3 style="${s.h2}">${title}</h3>
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
            ${rows
              .map(
                (li) => `
              <tr>
                <td style="${s.td}">
                  <strong>${escapeHtml(li.name)}</strong>
                  ${li.desc ? `<div style="${s.pSmall}">${escapeHtml(li.desc)}</div>` : ""}
                  <div style="${s.pSmall}">${li.sku}</div>
                </td>
                <td style="${s.td}">${li.quantity}</td>
                <td style="${s.td}">
                  ${
                    li.pct > 0
                      ? `<span style="${s.priceList}">${formatMoney(li.listUnit)}</span>
                         <span style="${s.priceOffer}">${formatMoney(li.offerUnit)}</span>
                         <span style="${s.badge}">-${li.pct}%</span>`
                      : `<span>${formatMoney(li.offerUnit)}</span>`
                  }
                </td>
                <td style="${s.td}">
                  ${
                    li.pct > 0
                      ? `<span style="${s.priceList}">${formatMoney(li.listTotal)}</span>
                         <strong>${formatMoney(li.offerTotal)}</strong>`
                      : `<strong>${formatMoney(li.offerTotal)}</strong>`
                  }
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
  `;

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
            <td style="text-align:right"><p style="${s.pSmall}">${COMPANY.web} · ${COMPANY.email} · ${COMPANY.phone}</p></td>
          </tr>
        </table>
      </div>
      <div style="${s.accent}"></div>
      <div style="${s.inner}">
        <h2 style="${s.h1}">Ihr individuelles Angebot</h2>
        ${customer.company ? `<p style="${s.p}"><strong>${escapeHtml(customer.company)}</strong></p>` : `<p style="${s.p}"><strong>Firma unbekannt</strong></p>`}
        ${
          addressCustomer
            ? `<div style="background:#f2f3f7;border-radius:6px;padding:10px 14px;margin-top:12px;margin-bottom:18px;line-height:1.55;font-size:13px;color:#333;">${escapeHtml(
                addressCustomer
              ).replace(/\n/g, "<br>")}</div>`
            : ""
        }
        <p style="${s.p}">${escapeHtml(greetingLine(customer))}</p>

        <p style="${s.p}">vielen Dank für Ihr Interesse an xVoice UC. Unsere cloudbasierte Kommunikationslösung verbindet moderne Telefonie mit Microsoft Teams und führenden CRM-Systemen – sicher, skalierbar und in deutschen Rechenzentren betrieben.</p>
        <p style="${s.p}">Unsere Lösung bietet Ihnen nicht nur höchste Flexibilität und Ausfallsicherheit, sondern lässt sich auch vollständig in Ihre bestehende Umgebung integrieren. Auf Wunsch übernehmen wir gerne die gesamte Koordination der Umstellung, sodass Sie sich um nichts kümmern müssen.</p>
        <p style="${s.p}">Gerne bespreche ich die nächsten Schritte gemeinsam mit Ihnen – telefonisch oder per Teams-Call, ganz wie es Ihnen am besten passt.</p>
        <p style="${s.p}">Ich freue mich auf Ihre Rückmeldung und auf die Möglichkeit, Sie bald als neuen xVoice UC Kunden zu begrüßen.</p>

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
              <img src="https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full" alt="xVoice UC Client" style="width:100%;border-radius:10px;border:1px solid #eee;display:block" />
            </td>
          </tr>
        </table>

        ${monthly.length ? sectionTable("Monatliche Kosten", monthly) : ""}

        ${oneTime.length ? sectionTable("Einmalige Kosten", oneTime) : ""}

        <table width="100%" style="border-collapse:collapse;margin-top:10px">
          <tbody>
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Listen-Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(listSubtotalTotal)}</strong></td>
            </tr>
            ${
              listSubtotalTotal > offerSubtotalTotal
                ? `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Rabatt gesamt</td>
              <td style="${s.totalRow}"><strong>−${formatMoney(listSubtotalTotal - offerSubtotalTotal)}</strong></td>
            </tr>` : ""
            }
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme nach Rabatt</td>
              <td style="${s.totalRow}"><strong>${formatMoney(offerSubtotalTotal)}</strong></td>
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

        <!-- Orange Volltrenner -->
        <div style="height:3px;background:${BRAND.primary};margin:16px 0"></div>

        <!-- CEO-Block -->
        <div style="border-top:1px solid #eee;padding-top:14px;">
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
        <img
          src={BRAND.logoUrl}
          alt="xVoice Logo"
          className="h-20 w-20 object-contain"
        />
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
  item: typeof CATALOG[number];
  qty: number;
  onQty: (v: number) => void;
  discountPct: number;
  onDiscountPct: (v: number) => void;
  readOnly?: boolean;
  helper?: string;
  cap: number;
}) {
  const capped = Math.max(0, Math.min(cap, isFinite(discountPct) ? discountPct : 0));
  const priceAfter = item.price * (1 - capped / 100);

  // feste, gleiche Breite (6.5rem) für Menge & Rabatt
  const fieldStyle: React.CSSProperties = { width: "6.5rem" };

  return (
    <div className="grid grid-cols-[minmax(220px,1fr)_110px_240px_120px] items-start gap-4 py-3 border-b last:border-none">
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
            <span
              className="ml-2 px-2 py-[2px] rounded-full text-[11px] text-white"
              style={{ background: BRAND.primary }}
            >
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
          className="shrink-0"
          style={fieldStyle}
          disabled={!!readOnly}
        />
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={cap}
            step={0.5}
            value={capped}
            onChange={(e) =>
              onDiscountPct(Math.max(0, Math.min(cap, Number(e.target.value || 0))))
            }
            className="shrink-0"
            style={fieldStyle}
            disabled={cap === 0}
          />
          <span className="text-xs text-muted-foreground">max {cap}%</span>
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

function Totals({
  subtotal,
  vatRate,
  listSubtotal,
}: {
  subtotal: number;       // Angebot netto
  listSubtotal: number;  // Liste netto
  vatRate: number;
}) {
  const discount = Math.max(0, listSubtotal - subtotal);
  const vat = subtotal * vatRate;
  const gross = subtotal + vat;

  const Row = ({
    label,
    value,
    strong = false,
  }: {
    label: string;
    value: string;
    strong?: boolean;
  }) => (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-10">
      <span className={strong ? "font-semibold" : undefined}>{label}</span>
      <span className={"tabular-nums text-right " + (strong ? "font-semibold" : "")}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="space-y-1 text-sm">
      <Row label="Listen-Zwischensumme (netto)" value={formatMoney(listSubtotal)} />
      {discount > 0 && <Row label="Rabatt gesamt" value={"−" + formatMoney(discount)} />}
      <Row label="Zwischensumme nach Rabatt" value={formatMoney(subtotal)} />
      <Row label={`zzgl. USt. (19%)`} value={formatMoney(vat)} />
      <Row label="Bruttosumme" value={formatMoney(gross)} strong />
    </div>
  );
}

// ===== PAGE =====
export default function Page() {
  // ===== MONATLICH =====
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(CATALOG.map((p) => [p.sku, 0]))
  );
  const [discPct, setDiscPct] = useState<Record<string, number>>(
    Object.fromEntries(CATALOG.map((p) => [p.sku, 0]))
  );
  const [vatRate] = useState(0.19);

  // ===== HARDWARE (einmalig) =====
  const [hardware, setHardware] = useState<HardwareRow[]>([]);
  const [qtyHw, setQtyHw] = useState<Record<string, number>>({});
  const [discHw, setDiscHw] = useState<Record<string, number>>({});

  useEffect(() => {
    loadHardware().then(setHardware).catch(() => setHardware([]));
  }, []);

  // ===== SETUP-TIERS =====
  const [setupTiers, setSetupTiers] = useState<SetupTier[]>([]);
  useEffect(() => {
    loadSetupTiers().then(setSetupTiers).catch(() => setSetupTiers([]));
  }, []);

  // ===== Kunde / Vertrieb =====
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
  const [salesperson, setSalesperson] = useState<Salesperson>({
    name: "",
    email: "vertrieb@xvoice-uc.de",
    phone: "",
  });
  const [salesEmail, setSalesEmail] = useState("vertrieb@xvoice-uc.de");
  const [subject, setSubject] = useState("Ihr individuelles xVoice UC Angebot");

  // ===== Ableitungen =====
  const serviceAutoQty = useMemo(
    () => (qty["XVPR"] || 0) + (qty["XVDV"] || 0) + (qty["XVMO"] || 0),
    [qty]
  );

  // Monatlich: Zeilen (mit Caps)
  const monthlyRows = useMemo(() => {
    return CATALOG.filter((p) => {
      if (p.sku === "XVPS") return serviceAutoQty > 0;
      return (qty[p.sku] || 0) > 0;
    }).map((p) => {
      const q = p.sku === "XVPS" ? serviceAutoQty : (qty[p.sku] || 0);
      const cap = DISCOUNT_CAP[p.sku] ?? 0;
      const pct = Math.max(0, Math.min(cap, discPct[p.sku] || 0));
      const listUnit = p.price;
      const offerUnit = p.price * (1 - pct / 100);
      return {
        sku: p.sku as string,
        name: p.name,
        desc: p.desc,
        listUnit,
        offerUnit,
        quantity: q,
        listTotal: listUnit * q,
        offerTotal: offerUnit * q,
        pct,
      };
    });
  }, [qty, discPct, serviceAutoQty]);

  const listSubtotalMonthly = useMemo(
    () => monthlyRows.reduce((s, r) => s + r.listTotal, 0),
    [monthlyRows]
  );
  const offerSubtotalMonthly = useMemo(
    () => monthlyRows.reduce((s, r) => s + r.offerTotal, 0),
    [monthlyRows]
  );

  // Setup-Tier anhand Summe XVPR+XVDV+XVMO
  const setupTier = useMemo(() => {
    const n = serviceAutoQty;
    if (!n || setupTiers.length === 0) return null;
    const t = setupTiers.find((x) => n >= x.min && (x.max == null || n <= x.max));
    return t || null;
  }, [serviceAutoQty, setupTiers]);

  // Hardware (einmalig) + Setup-Pauschale
  const oneTimeRows = useMemo(() => {
    const rows =
      hardware
        .filter((h) => (qtyHw[h.sku] || 0) > 0)
        .map((h) => {
          const q = Math.max(0, Math.floor(qtyHw[h.sku] || 0));
          const pct = Math.max(0, Math.min(DISCOUNT_CAP_HARDWARE, discHw[h.sku] || 0));
          const listUnit = h.price;
          const offerUnit = h.price * (1 - pct / 100);
          return {
            sku: h.sku,
            name: h.name,
            desc: h.desc,
            listUnit,
            offerUnit,
            quantity: q,
            listTotal: listUnit * q,
            offerTotal: offerUnit * q,
            pct,
            unit: h.unit || "/einmalig",
          };
        });

    if (setupTier) {
      rows.push({
        sku: setupTier.sku,
        name: setupTier.name,
        desc: "Installations- & Konfigurationspauschale gemäß Lizenzsumme (Pos. 1–3).",
        listUnit: setupTier.price,
        offerUnit: setupTier.price,
        quantity: 1,
        listTotal: setupTier.price,
        offerTotal: setupTier.price,
        pct: 0,
        unit: "/einmalig",
      });
    }

    return rows;
  }, [hardware, qtyHw, discHw, setupTier]);

  const listSubtotalOne = useMemo(
    () => oneTimeRows.reduce((s, r) => s + r.listTotal, 0),
    [oneTimeRows]
  );
  const offerSubtotalOne = useMemo(
    () => oneTimeRows.reduce((s, r) => s + r.offerTotal, 0),
    [oneTimeRows]
  );

  const listSubtotalTotal = listSubtotalMonthly + listSubtotalOne;
  const offerSubtotalTotal = offerSubtotalMonthly + offerSubtotalOne;

  // ===== EMAIL HTML =====
  const offerHtml = useMemo(
    () =>
      buildEmailHtml({
        customer,
        salesperson,
        monthly: monthlyRows,
        oneTime: oneTimeRows,
        vatRate,
      }),
    [customer, salesperson, monthlyRows, oneTimeRows, vatRate]
  );

  // ===== UX State =====
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState(false);
  const [error, setError] = useState("");
  const [copyOk, setCopyOk] = useState(false);
  const [copyError, setCopyError] = useState("");

  function openPreviewNewTab() {
    try {
      const blob = new Blob([offerHtml], { type: "text/html;charset=utf-8" });
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

  async function safeCopyToClipboard(text: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return { ok: true, via: "clipboard" as const };
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
      return { ok: !!ok, via: "execCommand" as const };
    } catch (error) {
      return { ok: false, via: "blocked" as const, error };
    }
  }

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
        monthlyRows,
        oneTimeRows,
        totals: {
          listSubtotalMonthly,
          offerSubtotalMonthly,
          listSubtotalOne,
          offerSubtotalOne,
          listSubtotalTotal,
          offerSubtotalTotal,
          vat: offerSubtotalTotal * vatRate,
          gross: offerSubtotalTotal * (1 + vatRate),
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
        monthlyRows,
        oneTimeRows,
        totals: {
          listSubtotalMonthly,
          offerSubtotalMonthly,
          listSubtotalOne,
          offerSubtotalOne,
          listSubtotalTotal,
          offerSubtotalTotal,
          vat: offerSubtotalTotal * vatRate,
          gross: offerSubtotalTotal * (1 + vatRate),
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
    setQty(Object.fromEntries(CATALOG.map((p) => [p.sku, 0])));
    setDiscPct(Object.fromEntries(CATALOG.map((p) => [p.sku, 0])));
    setQtyHw({});
    setDiscHw({});
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

  // ===== RENDER =====
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Header />

      {/* Abschnitt 1: Lizenzen (monatl.) */}
      <Section
        title="1) Lizenzen (monatlich)"
        action={<div className="text-xs opacity-70">USt. fest: 19%</div>}
      >
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[minmax(220px,1fr)_110px_240px_120px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Listenpreis</div>
            <div>Menge & Rabatt</div>
            <div className="text-right">Summe</div>
          </div>

          {CATALOG.map((item) => {
            const isService = item.sku === "XVPS";
            const q = isService ? serviceAutoQty : (qty[item.sku] || 0);
            const onQ = isService
              ? () => {}
              : (v: number) =>
                  setQty((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.floor(v)) }));
            const cap = DISCOUNT_CAP[item.sku] ?? 0;
            const onD = (v: number) =>
              setDiscPct((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.min(cap, v)) }));
            const helper = isService
              ? "Anzahl = Summe aus Premium, Device & Smartphone (automatisch)"
              : undefined;

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

        <div className="mt-4 flex items-start justify-between gap-6">
          <div className="text-xs opacity-80">
            Alle Preise netto zzgl. der gültigen USt. Angaben ohne Gewähr. Änderungen vorbehalten.
          </div>
          <Totals
            subtotal={offerSubtotalMonthly}
            listSubtotal={listSubtotalMonthly}
            vatRate={vatRate}
          />
        </div>
      </Section>

      {/* Abschnitt 2: Hardware (einmalig) */}
      <Section title="2) Hardware (einmalig)">
        {hardware.length === 0 ? (
          <div className="text-sm opacity-70">
            Keine Hardwaredaten gefunden. Lege <code>hardware.csv</code> im <code>/public</code>-Ordner ab.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-[minmax(220px,1fr)_110px_240px_120px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
                <div>Artikel</div>
                <div>Listenpreis</div>
                <div>Menge & Rabatt (max. 10%)</div>
                <div className="text-right">Summe</div>
              </div>

              {hardware.map((h) => {
                const q = Math.max(0, Math.floor(qtyHw[h.sku] || 0));
                const pct = Math.max(0, Math.min(DISCOUNT_CAP_HARDWARE, discHw[h.sku] || 0));
                const listUnit = h.price;
                const offerUnit = h.price * (1 - pct / 100);
                const sum = offerUnit * q;

                const fieldStyle: React.CSSProperties = { width: "6.5rem" };

                return (
                  <div
                    key={h.sku}
                    className="grid grid-cols-[minmax(220px,1fr)_110px_240px_120px] items-start gap-4 py-3 border-b last:border-none"
                  >
                    <div>
                      <div className="font-medium">{h.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {h.sku} · {h.desc}
                      </div>
                    </div>

                    <div className="text-sm font-medium tabular-nums">
                      {formatMoney(listUnit)}
                      {pct > 0 && (
                        <div className="text-xs">
                          <span className="line-through opacity-60 mr-1">
                            {formatMoney(listUnit)}
                          </span>
                          <span className="font-semibold" style={{ color: BRAND.primary }}>
                            {formatMoney(offerUnit)}
                          </span>
                          <span
                            className="ml-2 px-2 py-[2px] rounded-full text-[11px] text-white"
                            style={{ background: BRAND.primary }}
                          >
                            -{pct}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={q}
                        onChange={(e) =>
                          setQtyHw((prev) => ({ ...prev, [h.sku]: Math.max(0, Math.floor(Number(e.target.value || 0))) }))
                        }
                        className="shrink-0"
                        style={fieldStyle}
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={DISCOUNT_CAP_HARDWARE}
                          step={0.5}
                          value={pct}
                          onChange={(e) =>
                            setDiscHw((prev) => ({
                              ...prev,
                              [h.sku]: Math.max(0, Math.min(DISCOUNT_CAP_HARDWARE, Number(e.target.value || 0))),
                            }))
                          }
                          className="shrink-0"
                          style={fieldStyle}
                        />
                        <span className="text-xs text-muted-foreground">max 10%</span>
                      </div>
                    </div>

                    <div className="text-right font-semibold tabular-nums">
                      {formatMoney(sum)}
                    </div>
                  </div>
                );
              })}
            </div>

            {setupTier && (
              <div className="mt-3 text-sm">
                <span className="inline-block px-2 py-1 rounded bg-neutral-100 border">
                  Automatisch ausgewählte Konfigurationspauschale: <strong>{setupTier.name}</strong> ({formatMoney(setupTier.price)}) – basierend auf {serviceAutoQty} Lizenzen (Pos. 1–3).
                </span>
              </div>
            )}

            <div className="mt-4 flex items-start justify-between gap-6">
              <div className="text-xs opacity-80">
                Einmalige Kosten (Hardware & Setup) – netto zzgl. USt.
              </div>
              <Totals
                subtotal={offerSubtotalOne}
                listSubtotal={listSubtotalOne}
                vatRate={vatRate}
              />
            </div>
          </>
        )}
      </Section>

      {/* Versand / Kunde / Vertrieb */}
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
            onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
          />
          <Input
            placeholder="Telefon"
            value={customer.phone}
            onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
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
              onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
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
          <Input
            placeholder="Betreff"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <div className="md:col-span-2 flex items-center gap-2">
            <Label className="text-sm">Vertrieb E-Mail (Kopie)</Label>
            <Input
              placeholder="vertrieb@xvoice-uc.de"
              type="email"
              value={salesEmail}
              onChange={(e) => setSalesEmail(e.target.value)}
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
          <Button
            onClick={handleSendEmail}
            disabled={sending}
            className="gap-2"
            style={{ backgroundColor: BRAND.primary }}
          >
            <Mail size={16} /> Angebot per Mail senden
          </Button>
          <Button onClick={handleOrderNow} disabled={sending} className="gap-2" variant="outline">
            <ShoppingCart size={16} /> Jetzt bestellen
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
        {!!error && <div className="mt-3 text-red-600 text-sm">Fehler: {error}</div>}
        {copyOk && <div className="mt-3 text-green-700 text-sm">HTML in die Zwischenablage kopiert.</div>}
        {!!copyError && <div className="mt-3 text-amber-600 text-sm">{copyError}</div>}
      </Section>

      {/* Gesamtsummen-Überblick */}
      <Section title="Live-Zusammenfassung">
        <div className="space-y-3 text-sm">
          <div className="font-semibold">Monatlich</div>
          {monthlyRows.length === 0 ? (
            <div className="opacity-70">Keine Positionen.</div>
          ) : (
            monthlyRows.map((li) => (
              <div key={`m-${li.sku}`} className="flex justify-between">
                <div>{li.quantity}× {li.name} ({li.sku})</div>
                <div className="tabular-nums">{formatMoney(li.offerTotal)}</div>
              </div>
            ))
          )}

          <div className="font-semibold mt-2">Einmalig</div>
          {oneTimeRows.length === 0 ? (
            <div className="opacity-70">Keine Positionen.</div>
          ) : (
            oneTimeRows.map((li) => (
              <div key={`o-${li.sku}`} className="flex justify-between">
                <div>{li.quantity}× {li.name} ({li.sku})</div>
                <div className="tabular-nums">{formatMoney(li.offerTotal)}</div>
              </div>
            ))
          )}

          <div className="pt-2 border-t">
            <Totals
              subtotal={offerSubtotalTotal}
              listSubtotal={listSubtotalTotal}
              vatRate={vatRate}
            />
          </div>
        </div>
      </Section>

      <footer className="text-xs text-center opacity-70 pt-2">
        © {new Date().getFullYear()} xVoice UC · Angebotserstellung · Alle Angaben ohne Gewähr
      </footer>
    </div>
  );
}
