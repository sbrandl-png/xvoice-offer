function buildEmailHtml(params: {
  customer: Customer;
  salesperson: Salesperson;
  lineItems: Array<{ sku: string; name: string; desc?: string; price: number; quantity: number; total: number }>; // price/total = bereits rabattiert
  subtotal: number;   // Summe rabattiert (netto)
  vatRate: number;
  discountPct: number; // ggf. ungenutzt, bleibt für Kompatibilität erhalten
}) {
  const { customer, salesperson, lineItems, subtotal, vatRate } = params;

  // Hilfen & Styles
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
    th: "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555",
    td: "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5;vertical-align:top",
    totalRow: "padding:8px 8px;font-size:13px",
    priceList: "display:inline-block;text-decoration:line-through;opacity:.6;margin-right:8px",
    priceOffer: `display:inline-block;color:${BRAND.primary};font-weight:bold`,
    badge: `display:inline-block;background:${BRAND.primary};color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;margin-left:8px;vertical-align:middle`,
    btn: `display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
    btnGhost: "display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold",
  } as const;

  const clientImage = "https://onecdn.io/media/5b9be381-eed9-40b6-99ef-25a944a49927/full";
  const ceoPhoto = "https://onecdn.io/media/10febcbf-6c57-4af7-a0c4-810500fea565/full";
  const ceoSign  = "https://onecdn.io/media/b96f734e-465e-4679-ac1b-1c093a629530/full";

  const addressCustomer = fullCustomerAddress(customer);

  // Listenpreise je SKU ziehen (Fallback: rabattierter Preis)
  function listUnitForSku(sku: string, discountedUnit: number) {
    const base = CATALOG.find(p => p.sku === sku)?.price;
    return typeof base === "number" ? base : discountedUnit;
  }

  // Enhanced Lines: berechne Listeneinzelpreis, -summe, %-Rabatt
  const enhanced = lineItems.map(li => {
    const listUnit  = listUnitForSku(li.sku, li.price);
    const listTotal = listUnit * li.quantity;
    const offerUnit = li.price;
    const offerTotal = li.total;
    const pct = listUnit > 0 ? Math.round((1 - (offerUnit / listUnit)) * 100) : 0;
    const pctClamped = Math.max(0, Math.min(100, pct));
    const diff = Math.max(0, listTotal - offerTotal);
    return { ...li, listUnit, listTotal, offerUnit, offerTotal, pct: pctClamped, diff };
  });

  // Summen
  const listSubtotal = enhanced.reduce((s, r) => s + r.listTotal, 0);
  const discountTotal = Math.max(0, listSubtotal - subtotal); // gesamt gewährter Rabatt
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
        ${addressCustomer ? `<div style="background:#f2f3f7;border-radius:6px;padding:10px 14px;margin-top:12px;margin-bottom:18px;line-height:1.55;font-size:13px;color:#333;">${escapeHtml(addressCustomer).replace(/\\n/g,'<br>')}</div>` : ''}

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

        <!-- Positionen mit Listen- vs. Angebotspreis -->
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
            ${enhanced.map(li => `
              <tr>
                <td style="${s.td}">
                  <strong>${escapeHtml(li.name)}</strong>
                  ${li.desc ? `<div style="${s.pSmall}">${escapeHtml(li.desc)}</div>` : ''}
                  <div style="${s.pSmall}">${li.sku}</div>
                </td>
                <td style="${s.td}">${li.quantity}</td>
                <td style="${s.td}">
                  ${li.pct > 0
                    ? `<span style="${s.priceList}">${formatMoney(li.listUnit)}</span>
                       <span style="${s.priceOffer}">${formatMoney(li.offerUnit)}</span>
                       <span style="${s.badge}">-${li.pct}%</span>`
                    : `<span>${formatMoney(li.offerUnit)}</span>`
                  }
                </td>
                <td style="${s.td}">
                  ${li.pct > 0
                    ? `<span style="${s.priceList}">${formatMoney(li.listTotal)}</span>
                       <strong>${formatMoney(li.offerTotal)}</strong>`
                    : `<strong>${formatMoney(li.offerTotal)}</strong>`
                  }
                </td>
              </tr>
            `).join('')}

            <!-- Totals mit Rabattdarstellung -->
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Listen-Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(listSubtotal)}</strong></td>
            </tr>
            ${discountTotal > 0 ? `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Rabatt gesamt</td>
              <td style="${s.totalRow}"><strong>−${formatMoney(discountTotal)}</strong></td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme nach Rabatt</td>
              <td style="${s.totalRow}"><strong>${formatMoney(subtotal)}</strong></td>
            </tr>` : `
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme (netto)</td>
              <td style="${s.totalRow}"><strong>${formatMoney(subtotal)}</strong></td>
            </tr>`}
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

        <div style="margin-top:18px;border-top:1px solid #eee;padding-top:12px">
          <p style="${s.p}">Mit freundlichen Grüßen</p>
          ${salesperson.name ? `<p style="${s.p}"><strong>${escapeHtml(salesperson.name)}</strong></p>` : ''}
          ${salesperson.phone ? `<p style="${s.pSmall}">Tel. ${escapeHtml(salesperson.phone)}</p>` : ''}
          ${salesperson.email ? `<p style="${s.pSmall}">${escapeHtml(salesperson.email)}</p>` : ''}
        </div>

        <!-- Oranger Gedankenstrich als Trennung -->
        <div style="text-align:center;margin:12px 0 18px 0;">
          <span style="display:inline-block;font-size:22px;line-height:1;color:${BRAND.primary};">—</span>
        </div>

        <div style="margin-top:14px;border-top:1px solid #eee;padding-top:14px;">
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
          <p style="${s.pSmall}">© ${new Date().getFullYear()} xVoice UC · Impressum & Datenschutz auf xvoice-uc.de</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
