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
 * - Per-Item-Rabatte mit Caps (Monatlich: XVPR/XVDV/XVMO 40%, XVTE 20%, XVCRM 20%, XVF2M 100%, XVPS 0)
 * - XVPS-Menge = XVPR + XVDV + XVMO (read-only)
 * - Setup-Pauschale (einmalig) abhängig von Anzahl Kernlizenzen (XVPR+XVDV+XVMO), aus CSV (optional) oder Fallback
 * - Hardware (einmalig) aus CSV (optional) oder Fallback, max. 10% Rabatt
 * - Angebots-HTML: klare Trennung monatlich vs. einmalig, Listen- vs. Angebotspreis, orange Trennlinie über CEO-Block
 * - Gleich breite Eingabefelder für Menge & Rabatt
 * - Stabile Preview/Download/Copy
 */

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

// ===== TYPES =====
type CatalogItem = {
  sku: string;
  name: string;
  price: number; // Listenpreis netto
  unit?: string; // "/Monat" | "Stück" | ...
  desc?: string;
  billing: "monthly" | "one-time";
  maxDiscountPct?: number; // Cap je Position
};

type SetupTier = {
  minLicenses: number;
  maxLicenses: number; // inkl.; letzte Stufe Infinity
  sku: string;
  name: string;
  price: number; // einmalig netto
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

// ===== MONATLICHER KATALOG =====
const MONTHLY: CatalogItem[] = [
  {
    sku: "XVPR",
    name: "xVoice UC Premium",
    price: 8.95,
    unit: "/Monat",
    billing: "monthly",
    desc:
      "Voller Leistungsumfang inkl. Softphone & Smartphone, beliebige Hardphones, Teams Add-In, ACD, Warteschleifen, Callcenter, Fax2Mail.",
    maxDiscountPct: 40,
  },
  {
    sku: "XVDV",
    name: "xVoice UC Device Only",
    price: 3.85,
    unit: "/Monat",
    billing: "monthly",
    desc: "Lizenz für analoge Faxe, Türsprechstellen, Räume oder reine Tischtelefon-Nutzer.",
    maxDiscountPct: 40,
  },
  {
    sku: "XVMO",
    name: "xVoice UC Smartphone Only",
    price: 5.70,
    unit: "/Monat",
    billing: "monthly",
    desc: "Premium-Funktionsumfang, beschränkt auf mobile Nutzung (iOS/Android/macOS).",
    maxDiscountPct: 40,
  },
  {
    sku: "XVTE",
    name: "xVoice UC Teams Integration",
    price: 4.75,
    unit: "/Monat",
    billing: "monthly",
    desc: "Native MS Teams Integration (Phone Standard Lizenz von Microsoft erforderlich).",
    maxDiscountPct: 20,
  },
  {
    sku: "XVPS",
    name: "xVoice UC Premium Service 4h SLA (je Lizenz)",
    price: 1.35,
    unit: "/Monat",
    billing: "monthly",
    desc: "4h Reaktionszeit inkl. bevorzugtem Hardwaretausch & Konfigurationsänderungen.",
    maxDiscountPct: 0, // kein Rabatt
  },
  {
    sku: "XVCRM",
    name: "xVoice UC Software Integration Lizenz",
    price: 5.95,
    unit: "/Monat",
    billing: "monthly",
    desc: "Nahtlose Integration in CRM/Helpdesk (Salesforce, HubSpot, Zendesk, Dynamics u.a.).",
    maxDiscountPct: 20,
  },
  {
    sku: "XVF2M",
    name: "xVoice UC Fax2Mail Service",
    price: 0.99,
    unit: "/Monat",
    billing: "monthly",
    desc: "Eingehende Faxe bequem als PDF per E-Mail (virtuelle Fax-Nebenstellen).",
    maxDiscountPct: 100,
  },
];

// ===== SETUP-TIERS: Fallback (falls keine /setup_tiers.csv) =====
// CSV-Format (optional, im public/ ablegen):
// minLicenses,maxLicenses,sku,name,price
const SETUP_TIERS_FALLBACK: SetupTier[] = [
  { minLicenses: 1,  maxLicenses: 10,  sku: "XVIKS10",  name: "Installations- & Konfigurationspauschale bis 10 User",  price: 299.0 },
  { minLicenses: 11, maxLicenses: 20, sku: "XVIKS20",  name: "Installations- & Konfigurationspauschale bis 20 User",  price: 399.0 },
  { minLicenses: 21, maxLicenses: 50, sku: "XVIKS50",  name: "Installations- & Konfigurationspauschale bis 50 User",  price: 899.0 },
  { minLicenses: 51, maxLicenses: 100, sku: "XVIKS100",  name: "Installations- & Konfigurationspauschale bis 100 User",  price: 1299.0 },
  { minLicenses: 101, maxLicenses: 200, sku: "XVIKS200",  name: "Installations- & Konfigurationspauschale bis 200 User",  price: 1699.0 },
  { minLicenses: 201, maxLicenses: 500, sku: "XVIKS500",  name: "Installations- & Konfigurationspauschale bis 500 User",  price: 1999.0 },
  { minLicenses: 501, maxLicenses: 1000, sku: "XVIKS1000",  name: "Installations- & Konfigurationspauschale bis 1000 User",  price: 2999.0 },
  { minLicenses: 1001, maxLicenses: Number.POSITIVE_INFINITY, sku: "XVIKS_XXL", name: "Installations- & Konfigurationspauschale (XXL)", price: 4999.0 },
];

// ===== HARDWARE: Fallback (falls keine /hardware.csv) =====
// CSV-Format (optional, im public/ ablegen):
// sku,name,price,unit,desc,maxDiscountPct
const HARDWARE_MAX_DEFAULT = 10;
const HARDWARE_FALLBACK: CatalogItem[] = [
{ sku: "YEA-T54W", name: "Yealink T54W IP-Telefon", price: 149.0, billing: "one-time", unit: "Stück", desc: "GigE, USB, BT, Wi-Fi", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-T57W", name: "Yealink T57W IP-Telefon", price: 229.0, billing: "one-time", unit: "Stück", desc: "GigE, USB, BT, Wi-Fi", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-T58W", name: "Yealink T58W IP-Telefon", price: 259.0, billing: "one-time", unit: "Stück", desc: "GigE, USB, BT, Wi-Fi", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-T58W-PRO", name: "Yealink T58W Pro IP-Telefon", price: 289.0, billing: "one-time", unit: "Stück", desc: "GigE, USB, BT, Wi-Fi, schnurloser Hörer", maxDiscountPct: HARDWARE_MAX_DEFAULT },

  { sku: "YEA-W73P", name: "Yealink W73P DECT-Basis + Hörer", price: 109.0, billing: "one-time", unit: "Set", desc: "Mobilteil inkl. Basis", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-W74P", name: "Yealink W74P DECT-Basis + Hörer", price: 129.0, billing: "one-time", unit: "Set", desc: "Mobilteil inkl. Basis", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-W78P", name: "Yealink W78P DECT-Basis + Hörer", price: 149.0, billing: "one-time", unit: "Set", desc: "Mobilteil inkl. Basis", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-W73H", name: "Yealink W73H Handset", price: 69.0, billing: "one-time", unit: "Stück", desc: "Mobilteil inkl. Ladeschale", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-W74H", name: "Yealink W74H Handset", price: 89.0, billing: "one-time", unit: "Stück", desc: "Mobilteil inkl. Ladeschale", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-W78H", name: "Yealink W78H Handset", price: 99.0, billing: "one-time", unit: "Stück", desc: "Mobilteil inkl. Ladeschale", maxDiscountPct: HARDWARE_MAX_DEFAULT },

  { sku: "YEA-W90DM", name: "Yealink W90 DECT Manager", price: 249.0, billing: "one-time", unit: "Stück", desc: "DECT-Multizellen-Manager für größere DECT-Umgebungen", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-W90B", name: "Yealink W90 DECT Base Station", price: 249.0, billing: "one-time", unit: "Stück", desc: "DECT-Multizellen-Basisstation; erfordert bei Ersteinrichtung einen DECT-Manager", maxDiscountPct: HARDWARE_MAX_DEFAULT },

  { sku: "YEA-WH64M", name: "Yealink WH64 mono Headset", price: 149.0, billing: "one-time", unit: "Stück", desc: "Monaurales Business-Headset", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-WH64D", name: "Yealink WH64 duo Headset", price: 159.0, billing: "one-time", unit: "Stück", desc: "Biaurales Business-Headset", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "YEA-WH68D", name: "Yealink WH68 duo hybrid Headset", price: 159.0, billing: "one-time", unit: "Stück", desc: "Biaurales Premium-Business-Headset", maxDiscountPct: HARDWARE_MAX_DEFAULT },

  { sku: "GIG-D810", name: "Gigaset D810 IP Pro", price: 99.0, billing: "one-time", unit: "Stück", desc: "Professionelles IP-Tischtelefon mit 3,36″ TFT-Display", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "GIG-D820", name: "Gigaset D820 IP Pro", price: 119.0, billing: "one-time", unit: "Stück", desc: "Professionelles IP-Tischtelefon mit 5″ TFT-Display", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "GIG-D825", name: "Gigaset D825 IP Pro", price: 129.0, billing: "one-time", unit: "Stück", desc: "Professionelles IP-Tischtelefon mit 5″ TFT-Display", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "GIG-D850W", name: "Gigaset D850W IP Pro", price: 139.0, billing: "one-time", unit: "Stück", desc: "Professionelles IP-Tischtelefon mit 5″ TFT-Display und WLAN", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "GIG-D855BW", name: "Gigaset D855BW IP Pro", price: 159.0, billing: "one-time", unit: "Stück", desc: "Professionelles IP-Tischtelefon mit 5″ TFT-Display, Bluetooth und WLAN", maxDiscountPct: HARDWARE_MAX_DEFAULT },
  { sku: "GIG-P800KP", name: "Gigaset P800 Key Pro Tastenmodul", price: 119.0, billing: "one-time", unit: "Stück", desc: "Erweiterungsmodul für IP-Tischtelefone mit 20 physischen Tasten", maxDiscountPct: HARDWARE_MAX_DEFAULT },
];

// ===== ENDPOINTS =====
const EMAIL_ENDPOINT = "/api/send-offer";
const ORDER_ENDPOINT = "/api/place-order";

// ===== UTILS =====
function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function escapeHtml(str: string) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function fullCustomerAddress(c: Customer) {
  const lines = [c.company || "", c.contact || "", c.street || "", [c.zip, c.city].filter(Boolean).join(" "), c.email || "", c.phone || ""].filter(Boolean);
  return lines.join("\n");
}
function greetingLine(c: Customer) {
  const name = (c.contact || "").trim();
  if (!name) return "Guten Tag,";
  return c.salutation === "Frau" ? `Sehr geehrte Frau ${name},` : `Sehr geehrter Herr ${name},`;
}
function detectDelimiter(headerLine: string) {
  // simple heuristic
  if (headerLine.includes(";") && !headerLine.includes(",")) return ";";
  return ","; // default
}
function parseCsvLines(csv: string): string[][] {
  // basic parser for unquoted/ simply quoted fields; handles ; or , based on header
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delim = detectDelimiter(lines[0]);
  return lines.map(line => {
    // very light parser: split by delim; trim quotes
    return line.split(delim).map(cell => {
      const t = cell.trim();
      const m = t.match(/^"(.*)"$/);
      return m ? m[1].replace(/""/g, '"') : t;
    });
  });
}

// ===== EMAIL HTML =====
type BuiltRow = {
  sku: string;
  name: string;
  desc?: string;
  quantity: number;
  listUnit: number;
  offerUnit: number;
  listTotal: number;
  offerTotal: number;
  badgePct: number;
};
function buildEmailHtml(params: {
  customer: Customer;
  salesperson: Salesperson;
  monthlyRows: BuiltRow[];
  oneTimeRows: BuiltRow[];
  vatRate: number;
}) {
  const { customer, salesperson, monthlyRows, oneTimeRows, vatRate } = params;

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
    th: "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap",
    td: "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5;vertical-align:top",
    totalLabel: "padding:8px 8px;font-size:13px;white-space:nowrap;width:260px;text-align:right",
    totalValue: "padding:8px 8px;font-size:13px",
    priceList: "display:inline-block;text-decoration:line-through;opacity:.6;margin-right:8px",
    priceOffer: `display:inline-block;color:${BRAND.primary};font-weight:bold`,
    badge: `display:inline-block;background:${BRAND.primary};color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;margin-left:8px;vertical-align:middle`,
    btn: `display:inline-block;background:${BRAND.primary};color:${BRAND.headerFg};text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
    btnGhost: "display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold",
    hrOrange: `height:3px;background:${BRAND.primary};border:none;margin:16px 0`,
    addressBox: "background:#f2f3f7;border-radius:6px;padding:10px 14px;margin-top:12px;margin-bottom:18px;line-height:1.55;font-size:13px;color:#333;",
  };

  const clientImage = "https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full";
  const ceoPhoto = "https://onecdn.io/media/10febcbf-6c57-4af7-a0c4-810500fea565/full";
  const ceoSign = "https://onecdn.io/media/b96f734e-465e-4679-ac1b-1c093a629530/full";

  function rowsHtml(rows: BuiltRow[]) {
    return rows
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
            li.badgePct > 0
              ? `<span style="${s.priceList}">${formatMoney(li.listUnit)}</span>
                 <span style="${s.priceOffer}">${formatMoney(li.offerUnit)}</span>
                 <span style="${s.badge}">-${li.badgePct}%</span>`
              : `<span>${formatMoney(li.offerUnit)}</span>`
          }
        </td>
        <td style="${s.td}">
          ${
            li.badgePct > 0
              ? `<span style="${s.priceList}">${formatMoney(li.listTotal)}</span>
                 <strong>${formatMoney(li.offerTotal)}</strong>`
              : `<strong>${formatMoney(li.offerTotal)}</strong>`
          }
        </td>
      </tr>`
      )
      .join("");
  }

  function totalsSection(rows: BuiltRow[]) {
    const listSubtotal = rows.reduce((a, r) => a + r.listTotal, 0);
    const offerSubtotal = rows.reduce((a, r) => a + r.offerTotal, 0);
    const discount = Math.max(0, listSubtotal - offerSubtotal);
    const vat = offerSubtotal * vatRate;
    const gross = offerSubtotal + vat;
    return `
      <tr>
        <td colspan="2"></td>
        <td style="${s.totalLabel}">Listen-Zwischensumme (netto)</td>
        <td style="${s.totalValue}"><strong>${formatMoney(listSubtotal)}</strong></td>
      </tr>
      ${
        discount > 0
          ? `
      <tr>
        <td colspan="2"></td>
        <td style="${s.totalLabel}">Rabatt gesamt</td>
        <td style="${s.totalValue}"><strong>−${formatMoney(discount)}</strong></td>
      </tr>
      <tr>
        <td colspan="2"></td>
        <td style="${s.totalLabel}">Zwischensumme nach Rabatt</td>
        <td style="${s.totalValue}"><strong>${formatMoney(offerSubtotal)}</strong></td>
      </tr>`
          : `
      <tr>
        <td colspan="2"></td>
        <td style="${s.totalLabel}">Zwischensumme (netto)</td>
        <td style="${s.totalValue}"><strong>${formatMoney(offerSubtotal)}</strong></td>
      </tr>`
      }
      <tr>
        <td colspan="2"></td>
        <td style="${s.totalLabel}">zzgl. USt. (19%)</td>
        <td style="${s.totalValue}"><strong>${formatMoney(vat)}</strong></td>
      </tr>
      <tr>
        <td colspan="2"></td>
        <td style="${s.totalLabel}"><strong>Bruttosumme</strong></td>
        <td style="${s.totalValue}"><strong>${formatMoney(gross)}</strong></td>
      </tr>
    `;
  }

  const addressCustomer = fullCustomerAddress(customer);

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
           </tr>
        </table>
      </div>
      <div style="${s.accent}"></div>
      <div style="${s.inner}">
        <h2 style="${s.h1}">Ihr individuelles Angebot</h2>
        ${customer.company ? `<p style="${s.p}"><strong>${escapeHtml(customer.company)}</strong></p>` : `<p style="${s.p}"><strong>Firma unbekannt</strong></p>`}
        ${addressCustomer ? `<div style="${s.addressBox}">${escapeHtml(addressCustomer).replace(/\n/g, "<br>")}</div>` : ""}
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
                <li style="${s.pSmall.replace("12px","14px")}">Nahtlose Integration in Microsoft Teams & CRM/Helpdesk</li>
                <li style="${s.pSmall.replace("12px","14px")}">Cloud in Deutschland · DSGVO-konform</li>
                <li style="${s.pSmall.replace("12px","14px")}">Schnelle Bereitstellung, skalierbar je Nutzer</li>
                <li style="${s.pSmall.replace("12px","14px")}">Optionale 4h-SLA & priorisierter Support</li>
              </ul>
            </td>
            <td style="vertical-align:top;width:45%">
              <img src="https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full" alt="xVoice UC Client" style="width:100%;border-radius:10px;border:1px solid #eee;display:block" />
            </td>
          </tr>
        </table>

        <!-- MONATLICHE POSITIONEN -->
        <h3 style="${s.h3};margin-top:8px">Monatliche Positionen</h3>
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
            ${rowsHtml(monthlyRows)}
            ${totalsSection(monthlyRows)}
          </tbody>
        </table>

        <!-- EINMALIGE POSITIONEN -->
        ${
          oneTimeRows.length > 0
            ? `
        <h3 style="${s.h3};margin-top:18px">Einmalige Positionen</h3>
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
            ${rowsHtml(oneTimeRows)}
            ${totalsSection(oneTimeRows)}
          </tbody>
        </table>
        `
            : ""
        }

        <div style="margin-top:16px;display:flex1;gap:10px;flex-wrap:wrap">
          <a href="mailto:orders@xvoice-uc.de?subject=Bestellung%20zu%20Angebot%20{{OFFER_ID}}&body=Ich%20bestelle%20das%20Angebot%20{{OFFER_ID}}.%0D%0ABitte%20best%C3%A4tigen%20Sie%20die%20Auftragsannahme.%0D%0A--%0D%0AFirma:%20{{COMPANY}}%0D%0AName:%20{{CONTACT_NAME}}%0DTelefon:%20{{PHONE}}" style="${s.btn}">Jetzt bestellen</a>
          <a href="https://calendly.com/s-brandl-xvoice-uc/ruckfragen-zum-angebot" target="_blank" rel="noopener" style="${s.btnGhost}">Rückfrage zum Angebot</a>
        </div>

        <!-- Vertriebsgruß -->
        <div style="margin-top:18px;border-top:1px solid #eee;padding-top:12px">
          <p style="${s.p}">Mit freundlichen Grüßen</p>
          ${salesperson.name ? `<p style="${s.p}"><strong>${escapeHtml(salesperson.name)}</strong></p>` : ""}
          ${salesperson.phone ? `<p style="${s.pSmall}">Tel. ${escapeHtml(salesperson.phone)}</p>` : ""}
          ${salesperson.email ? `<p style="${s.pSmall}">${escapeHtml(salesperson.email)}</p>` : ""}
        </div>

        <!-- Orange Linie über CEO-Block -->
        <hr style="${s.hrOrange}" />

        <!-- CEO-Block -->
        <div style="margin-top:0;border-top:1px solid #eee;padding-top:14px;">
          <table width="100%" style="border-collapse:collapse">
            <tr>
              <td style="width:120px;vertical-align:top">
                <img src="https://onecdn.io/media/10febcbf-6c57-4af7-a0c4-810500fea565/full" alt="Sebastian Brandl" style="width:100%;max-width:120px;border:1px solid #eee;border-radius:0;display:block" />
              </td>
              <td style="vertical-align:top;padding-left:20px">
                <p style="${s.p}"><em>„Unser Ziel ist es, Kommunikation für Ihr Team spürbar einfacher zu machen – ohne Kompromisse bei Sicherheit und Service. Gerne begleiten wir Sie von der Planung bis zum Go-Live.“</em></p>
                <img src="https://onecdn.io/media/b96f734e-465e-4679-ac1b-1c093a629530/full" alt="Unterschrift Sebastian Brandl" style="width:160px;margin-top:8px;display:block" />
                <p style="${s.p}"><strong>Sebastian Brandl</strong> · Geschäftsführer</p>
              </td>
            </tr>
          </table>
        </div>

        <p style="${s.pSmall};margin-top:16px">Alle Preise in EUR netto zzgl. gesetzlicher Umsatzsteuer. Änderungen und Irrtümer vorbehalten.</p>

        <!-- Firmenfooter -->
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
        <img src={BRAND.logoUrl} alt="xVoice Logo" className="h-32 w-32 object-contain" />
        <div>
          <div className="text-sm opacity-80" style={{ color: BRAND.headerFg }}>
            Angebots- und Bestell-Konfigurator
          </div>
          <div className="text-2xl font-semibold" style={{ color: BRAND.headerFg }} />
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
  cap: number;
}) {
  const pctCapped = Math.max(0, Math.min(cap, isFinite(discountPct) ? discountPct : 0));
  const unitAfter = item.price * (1 - pctCapped / 100);

  return (
    <div className="grid grid-cols-[minmax(260px,1fr)_120px_260px_140px] items-start gap-4 py-3 border-b last:border-none">
      <div>
        <div className="font-medium">{item.name}</div>
        <div className="text-xs text-muted-foreground">
          {item.sku} · {item.desc}
        </div>
      </div>

      <div className="text-sm font-medium tabular-nums">
        {formatMoney(item.price)}
        {pctCapped > 0 && (
          <div className="text-xs">
            <span className="line-through opacity-60 mr-1">{formatMoney(item.price)}</span>
            <span className="font-semibold" style={{ color: BRAND.primary }}>
              {formatMoney(unitAfter)}
            </span>
            <span
              className="ml-2 px-2 py-[2px] rounded-full text-[11px] text-white"
              style={{ background: BRAND.primary }}
            >
              -{pctCapped}%
            </span>
          </div>
        )}
      </div>

      {/* Menge & Rabatt identische Breite */}
      <div className="grid grid-cols-2 gap-3 items-center">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => onQty(Math.max(0, Math.floor(Number(e.target.value || 0))))}
            className="w-28"
            disabled={!!readOnly}
          />
          <span className="text-xs text-muted-foreground">{item.unit || ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={cap}
            step={0.5}
            value={pctCapped}
            onChange={(e) =>
              onDiscountPct(Math.max(0, Math.min(cap, Number(e.target.value || 0))))
            }
            className="w-28"
            disabled={cap === 0}
          />
          <span className="text-xs text-muted-foreground">max {cap}%</span>
        </div>
      </div>

      <div className="text-right font-semibold tabular-nums">
        {formatMoney(unitAfter * qty)}
      </div>

      {helper ? (
        <div className="col-span-4 -mt-2 text-xs text-muted-foreground">{helper}</div>
      ) : null}
    </div>
  );
}

function Totals({
  title,
  rows,
  vatRate,
}: {
  title: string;
  rows: { listTotal: number; offerTotal: number }[];
  vatRate: number;
}) {
  const listSubtotal = rows.reduce((a, r) => a + r.listTotal, 0);
  const offerSubtotal = rows.reduce((a, r) => a + r.offerTotal, 0);
  const discount = Math.max(0, listSubtotal - offerSubtotal);
  const vat = offerSubtotal * vatRate;
  const gross = offerSubtotal + vat;

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-8">
      <span className={strong ? "font-semibold" : undefined}>{label}</span>
      <span className={"tabular-nums text-right " + (strong ? "font-semibold" : "")}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="space-y-1 text-sm">
      <div className="text-sm font-medium mb-1">{title}</div>
      <Row label="Listen-Zwischensumme (netto)" value={formatMoney(listSubtotal)} />
      {discount > 0 && <Row label="Rabatt gesamt" value={"−" + formatMoney(discount)} />}
      <Row
        label={discount > 0 ? "Zwischensumme nach Rabatt" : "Zwischensumme (netto)"}
        value={formatMoney(offerSubtotal)}
      />
      <Row label="zzgl. USt. (19%)" value={formatMoney(vat)} />
      <Row label="Bruttosumme" value={formatMoney(gross)} strong />
    </div>
  );
}

// ===== PAGE =====
export default function Page() {
  // dynamische Kataloge (Hardware/Setup-Tiers können aus CSV kommen)
  const [hardwareCatalog, setHardwareCatalog] = useState<CatalogItem[]>(HARDWARE_FALLBACK);
  const [setupTiers, setSetupTiers] = useState<SetupTier[]>(SETUP_TIERS_FALLBACK);

  // CSV laden (optional)
  useEffect(() => {
    // Hardware
    fetch("/hardware.csv", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const text = await r.text();
        const rows = parseCsvLines(text);
        if (rows.length < 2) return; // header + at least 1 row
        const header = rows[0].map((h) => h.toLowerCase());
        const idx = {
          sku: header.indexOf("sku"),
          name: header.indexOf("name"),
          price: header.indexOf("price"),
          unit: header.indexOf("unit"),
          desc: header.indexOf("desc"),
          maxDiscountPct: header.indexOf("maxdiscountpct"),
        };
        const list: CatalogItem[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const sku = r[idx.sku] || "";
          const name = r[idx.name] || "";
          const price = parseFloat((r[idx.price] || "").replace(",", "."));
          if (!sku || !name || !isFinite(price)) continue;
          const unit = idx.unit >= 0 ? r[idx.unit] || undefined : undefined;
          const desc = idx.desc >= 0 ? r[idx.desc] || undefined : undefined;
          const maxDiscountPct = idx.maxDiscountPct >= 0 ? parseFloat((r[idx.maxDiscountPct] || "10").replace(",", ".")) : HARDWARE_MAX_DEFAULT;
          list.push({ sku, name, price, unit, desc, billing: "one-time", maxDiscountPct: isFinite(maxDiscountPct) ? maxDiscountPct : HARDWARE_MAX_DEFAULT });
        }
        if (list.length > 0) setHardwareCatalog(list);
      })
      .catch(() => { /* fallback bleibt */ });

    // Setup-Tiers
    fetch("/setup_tiers.csv", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const text = await r.text();
        const rows = parseCsvLines(text);
        if (rows.length < 2) return;
        const header = rows[0].map((h) => h.toLowerCase());
        const idx = {
          minLicenses: header.indexOf("minlicenses"),
          maxLicenses: header.indexOf("maxlicenses"),
          sku: header.indexOf("sku"),
          name: header.indexOf("name"),
          price: header.indexOf("price"),
        };
        const tiers: SetupTier[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const minLicenses = parseInt((r[idx.minLicenses] || "0").trim(), 10);
          const maxLicensesRaw = (r[idx.maxLicenses] || "").trim();
          const maxLicenses = maxLicensesRaw.toLowerCase() === "inf" || maxLicensesRaw === "" ? Number.POSITIVE_INFINITY : parseInt(maxLicensesRaw, 10);
          const sku = r[idx.sku] || "";
          const name = r[idx.name] || "";
          const price = parseFloat((r[idx.price] || "").replace(",", "."));
          if (!sku || !name || !isFinite(price) || !Number.isFinite(minLicenses) || !Number.isFinite(maxLicenses)) continue;
          tiers.push({ minLicenses, maxLicenses, sku, name, price });
        }
        if (tiers.length > 0) setSetupTiers(tiers);
      })
      .catch(() => { /* fallback bleibt */ });
  }, []);

  // Mengen & Rabatte
  const ALL = [...MONTHLY, ...hardwareCatalog]; // dynamisch
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(ALL.map((p) => [p.sku, 0])));
  const [discPct, setDiscPct] = useState<Record<string, number>>(Object.fromEntries(ALL.map((p) => [p.sku, 0])));
  const [vatRate] = useState(0.19);

  // Kunde / Vertrieb
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
  const [salesperson, setSalesperson] = useState<Salesperson>({ name: "", email: "vertrieb@xvoice-uc.de", phone: "" });
  const [salesEmail, setSalesEmail] = useState("vertrieb@xvoice-uc.de");
  const [subject, setSubject] = useState("Ihr individuelles xVoice UC Angebot");

  // XVPS automatisch
  const serviceAutoQty = useMemo(() => (qty["XVPR"] || 0) + (qty["XVDV"] || 0) + (qty["XVMO"] || 0), [qty]);

  // Bei dynamisch geladener Hardware müssen wir qty/disc ggf. erweitern
  useEffect(() => {
    setQty((prev) => {
      const next = { ...prev };
      for (const p of hardwareCatalog) if (!(p.sku in next)) next[p.sku] = 0;
      return next;
    });
    setDiscPct((prev) => {
      const next = { ...prev };
      for (const p of hardwareCatalog) if (!(p.sku in next)) next[p.sku] = 0;
      return next;
    });
  }, [hardwareCatalog]);

  function capForSku(sku: string) {
    const found = ALL.find((i) => i.sku === sku);
    return found?.maxDiscountPct ?? 0;
  }

  // Monatspositionen
  const monthlyRows = useMemo(() => {
    const rows: BuiltRow[] = [];
    for (const p of MONTHLY) {
      const isXVPS = p.sku === "XVPS";
      const q = isXVPS ? serviceAutoQty : (qty[p.sku] || 0);
      if (isXVPS && q <= 0) continue;
      if (!isXVPS && q <= 0) continue;

      const cap = capForSku(p.sku);
      const pct = Math.max(0, Math.min(cap, discPct[p.sku] || 0));
      const listUnit = p.price;
      const offerUnit = p.price * (pct ? (1 - pct / 100) : 1);
      const listTotal = listUnit * q;
      const offerTotal = offerUnit * q;
      const badgePct = listUnit > 0 ? Math.round((1 - offerUnit / listUnit) * 100) : 0;

      rows.push({
        sku: p.sku,
        name: p.name,
        desc: p.desc,
        quantity: q,
        listUnit,
        offerUnit,
        listTotal,
        offerTotal,
        badgePct: Math.max(0, Math.min(100, badgePct)),
      });
    }
    return rows;
  }, [qty, discPct, serviceAutoQty]);

  // Setup aus Tiers
  function pickSetupTier(totalCoreSeats: number): SetupTier | null {
    if (!Number.isFinite(totalCoreSeats) || totalCoreSeats <= 0) return null;
    return setupTiers.find(t => totalCoreSeats >= t.minLicenses && totalCoreSeats <= t.maxLicenses) ?? null;
  }
  const selectedSetup = useMemo(() => pickSetupTier(serviceAutoQty), [serviceAutoQty, setupTiers]);

  // Hardware
  const hardwareRows = useMemo(() => {
    const rows: BuiltRow[] = [];
    for (const p of hardwareCatalog) {
      const q = qty[p.sku] || 0;
      if (q <= 0) continue;
      const cap = capForSku(p.sku);
      const pct = Math.max(0, Math.min(cap, discPct[p.sku] || 0));
      const listUnit = p.price;
      const offerUnit = p.price * (pct ? (1 - pct / 100) : 1);
      const listTotal = listUnit * q;
      const offerTotal = offerUnit * q;
      const badgePct = listUnit > 0 ? Math.round((1 - offerUnit / listUnit) * 100) : 0;

      rows.push({
        sku: p.sku,
        name: p.name,
        desc: p.desc,
        quantity: q,
        listUnit,
        offerUnit,
        listTotal,
        offerTotal,
        badgePct: Math.max(0, Math.min(100, badgePct)),
      });
    }
    return rows;
  }, [qty, discPct, hardwareCatalog]);

  // Einmalige Positionen zusammensetzen (Setup zuerst)
  const oneTimeRows = useMemo(() => {
    const rows: BuiltRow[] = [];
    if (selectedSetup) {
      rows.push({
        sku: selectedSetup.sku,
        name: selectedSetup.name,
        desc:
          "Mit der xVoice UC Installations- und Konfigurationspauschale richten wir Ihre Umgebung vollständig ein (Benutzer, Rufnummern, Routing, Devices, Client-Profile). Die Einrichtung erfolgt remote.",
        quantity: 1,
        listUnit: selectedSetup.price,
        offerUnit: selectedSetup.price,
        listTotal: selectedSetup.price,
        offerTotal: selectedSetup.price,
        badgePct: 0,
      });
    }
    rows.push(...hardwareRows);
    return rows;
  }, [hardwareRows, selectedSetup]);

  // HTML bauen
  const offerHtml = useMemo(
    () =>
      buildEmailHtml({
        customer,
        salesperson,
        monthlyRows,
        oneTimeRows,
        vatRate,
      }),
    [customer, salesperson, monthlyRows, oneTimeRows, vatRate]
  );

  // UX
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState(false);
  const [error, setError] = useState("");
  const [copyOk, setCopyOk] = useState(false);
  const [copyError, setCopyError] = useState("");

  // Preview / Download / Copy
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
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch {}
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
        return { ok: true, via: "clipboard" };
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
      return { ok: !!ok, via: "execCommand" };
    } catch (error) {
      return { ok: false, via: "blocked", error };
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
      const mList = monthlyRows.reduce((a, r) => a + r.listTotal, 0);
      const mOffer = monthlyRows.reduce((a, r) => a + r.offerTotal, 0);
      const oList = oneTimeRows.reduce((a, r) => a + r.listTotal, 0);
      const oOffer = oneTimeRows.reduce((a, r) => a + r.offerTotal, 0);
      await postJson(EMAIL_ENDPOINT, {
        meta: { subject },
        offerHtml,
        customer,
        monthlyRows,
        oneTimeRows,
        totals: {
          monthly: { netList: mList, netOffer: mOffer, vat: mOffer * vatRate, gross: mOffer * (1 + vatRate) },
          oneTime: { netList: oList, netOffer: oOffer, vat: oOffer * vatRate, gross: oOffer * (1 + vatRate) },
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
      });
      setSendOk(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  function resetAll() {
    const baseQty = Object.fromEntries([...MONTHLY, ...hardwareCatalog].map((p) => [p.sku, 0]));
    const baseDisc = Object.fromEntries([...MONTHLY, ...hardwareCatalog].map((p) => [p.sku, 0]));
    setQty(baseQty);
    setDiscPct(baseDisc);
    setCustomer({ salutation: "", company: "", contact: "", email: "", phone: "", street: "", zip: "", city: "", notes: "" });
    setSalesperson({ name: "", email: "vertrieb@xvoice-uc.de", phone: "" });
    setSendOk(false);
    setError("");
    setCopyOk(false);
    setCopyError("");
  }

  // ===== UI =====
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Header />

      {/* 1. Lizenzen (monatlich) */}
      <Section title="1. Lizenzen (monatlich)" action={<div className="text-xs opacity-70">USt. fest: 19%</div>}>
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[minmax(260px,1fr)_120px_260px_140px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Listenpreis</div>
            <div>Menge & Rabatt</div>
            <div className="text-right">Summe</div>
          </div>

          {MONTHLY.map((item) => {
            const isService = item.sku === "XVPS";
            const q = isService ? serviceAutoQty : (qty[item.sku] || 0);
            const onQ = isService
              ? () => {}
              : (v: number) => setQty((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.floor(v)) }));
            const cap = item.maxDiscountPct ?? 0;
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

        <div className="mt-4 flex items-start justify-between gap-6">
          <div className="text-xs opacity-80">Alle Preise netto zzgl. der gültigen USt. Angaben ohne Gewähr. Änderungen vorbehalten.</div>
          <Totals title="Monatliche Summe" rows={monthlyRows} vatRate={vatRate} />
        </div>
      </Section>

      {/* 2. Hardware (einmalig) */}
      <Section title="2. Hardware (einmalig)">
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-[minmax(260px,1fr)_120px_260px_140px] gap-4 text-xs uppercase text-muted-foreground pb-2 border-b">
            <div>Produkt</div>
            <div>Listenpreis</div>
            <div>Menge & Rabatt</div>
            <div className="text-right">Summe</div>
          </div>

          {hardwareCatalog.map((item) => {
            const q = qty[item.sku] || 0;
            const onQ = (v: number) => setQty((prev) => ({ ...prev, [item.sku]: Math.max(0, Math.floor(v)) }));
            const cap = item.maxDiscountPct ?? HARDWARE_MAX_DEFAULT;
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

        <div className="mt-3 text-xs text-muted-foreground">
          Die Installations- & Konfigurationspauschale wird automatisch anhand der Anzahl der Kernlizenzen (XVPR, XVDV, XVMO) ermittelt.
          {(() => {
            const sel = setupTiers && setupTiers.length > 0 ? setupTiers.find(t => serviceAutoQty >= t.minLicenses && serviceAutoQty <= t.maxLicenses) : null;
            return sel ? ` Aktuell zugeordnet: ${sel.name} (${formatMoney(sel.price)}).` : " Wird angezeigt, sobald mindestens eine Kernlizenz gewählt wurde.";
          })()}
        </div>

        <div className="mt-4 flex items-start justify-between gap-6">
          <div className="text-xs opacity-80">Alle Preise netto zzgl. der gültigen USt. Angaben ohne Gewähr. Änderungen vorbehalten.</div>
          <Totals title="Einmalige Summe" rows={(() => {
            const rows = [];
            const sel = setupTiers.find(t => serviceAutoQty >= t.minLicenses && serviceAutoQty <= t.maxLicenses);
            if (sel && serviceAutoQty > 0) rows.push({ listTotal: sel.price, offerTotal: sel.price });
            for (const hr of hardwareRows) rows.push({ listTotal: hr.listTotal, offerTotal: hr.offerTotal });
            return rows;
          })()} vatRate={vatRate} />
        </div>
      </Section>

      {/* 3. Kundendaten & Versand */}
      <Section title="Kundendaten & Versand">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm w-20">Anrede</Label>
            <select
              className="border rounded-md h-10 px-3 text-sm"
              value={customer.salutation}
              onChange={(e) => setCustomer({ ...customer, salutation: e.target.value as Customer["salutation"] })}
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

      {/* Live-Zusammenfassung */}
      <Section title="Live-Zusammenfassung">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Monatlich */}
          <div>
            <div className="text-sm font-medium mb-2">Monatliche Positionen</div>
            {monthlyRows.length === 0 ? (
              <div className="text-sm opacity-70">Keine monatlichen Positionen.</div>
            ) : (
              <div className="space-y-2">
                {monthlyRows.map((li) => (
                  <div key={`m-${li.sku}`} className="flex justify-between text-sm">
                    <div>{li.quantity}× {li.name} ({li.sku})</div>
                    <div className="tabular-nums">{formatMoney(li.offerTotal)}</div>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <Totals title="Summe (monatlich)" rows={monthlyRows} vatRate={vatRate} />
                </div>
              </div>
            )}
          </div>
          {/* Einmalig */}
          <div>
            <div className="text-sm font-medium mb-2">Einmalige Positionen</div>
            {oneTimeRows.length === 0 ? (
              <div className="text-sm opacity-70">Keine einmaligen Positionen.</div>
            ) : (
              <div className="space-y-2">
                {oneTimeRows.map((li) => (
                  <div key={`o-${li.sku}`} className="flex justify-between text-sm">
                    <div>{li.quantity}× {li.name} ({li.sku})</div>
                    <div className="tabular-nums">{formatMoney(li.offerTotal)}</div>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <Totals title="Summe (einmalig)" rows={oneTimeRows} vatRate={vatRate} />
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      <footer className="text-xs text-center opacity-70 pt-2">
        © {new Date().getFullYear()} xVoice UC · Angebotserstellung · Alle Angaben ohne Gewähr
      </footer>
    </div>
  );
}
