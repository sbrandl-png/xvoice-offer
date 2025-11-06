function buildEmailHtml(params: {
  customer: Customer;
  lineItems: Array<{ sku: string; name: string; price: number; quantity: number; total: number }>;
  subtotal: number;
  vatRate: number;
  discountPct: number;
}) {
  const { customer, lineItems, subtotal, vatRate, discountPct } = params;
  const discountAmount = Math.max(0, Math.min(100, discountPct || 0)) / 100 * subtotal;
  const net = Math.max(0, subtotal - discountAmount);
  const vat = net * vatRate;
  const gross = net + vat;

  const s = {
    body: "margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111",
    container: "max-width:720px;margin:0 auto;padding:24px",
    card: "background:#ffffff;border-radius:14px;padding:0;border:1px solid #e9e9ef;overflow:hidden",
    header: `background:#000;color:#fff;padding:16px 20px;`,
    headerTable: "width:100%;border-collapse:collapse",
    logo: "display:block;height:40px;object-fit:contain",
    title: "margin:0;font-size:18px;line-height:22px;color:#fff",
    subtitle: "margin:2px 0 0 0;font-size:12px;opacity:.8;color:#fff",
    accent: `height:3px;background:${BRAND.primary};`,
    inner: "padding:20px",
    h1: `margin:0 0 8px 0;font-size:22px;color:${BRAND.dark}`,
    p: "margin:0 0 8px 0;font-size:14px;color:#333",
    li: "margin:0 0 4px 0;font-size:14px;color:#333",
    small: "font-size:12px;color:#666",
    th: "text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555",
    td: "padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5",
    totalRow: "padding:8px 8px;font-size:13px",
    btn: `display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
    btnGhost: `display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold`,
    firmH: "margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#111",
    firm: "margin:0;font-size:12px;color:#444",
  } as const;

  const addressCustomer = [customer.street, `${customer.zip || ""} ${customer.city || ""}`]
    .filter(Boolean)
    .join(" · ");

  const greet = salutation(customer.contact);
  const calendly = "https://calendly.com/s-brandl-xvoice-uc/ruckfragen-zum-angebot";

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
              <h1 style="${s.title}">${COMPANY.name}</h1>
              <p style="${s.subtitle}">${COMPANY.web} · ${COMPANY.email} · ${COMPANY.phone}</p>
            </td>
          </tr>
        </table>
      </div>
      <div style="${s.accent}"></div>
      <div style="${s.inner}">
        <h2 style="${s.h1}">Ihr individuelles Angebot</h2>
        <p style="${s.p}">Stand ${todayIso()} · Netto-Preise zzgl. USt.</p>

        <!-- Vertriebs-Einleitung mit Anrede -->
        <p style="${s.p}"><strong>${greet}</strong>,</p>
        <p style="${s.p}">vielen Dank für Ihr Interesse an <strong>xVoice UC</strong>. Auf Basis Ihrer Anforderungen haben wir Ihnen nachfolgend ein passgenaues Angebot zusammengestellt. Mit xVoice verbinden Sie moderne Cloud-Telefonie mit Microsoft&nbsp;Teams und führenden CRM-Systemen – flexibel skalierbar, DSGVO-konform und mit kurzen Bereitstellungszeiten.</p>
        <ul style="padding-left:18px;margin:8px 0 12px 0">
          <li style="${s.li}"><strong>Nahtlose Integration</strong> in Microsoft Teams & CRM/Helpdesk</li>
          <li style="${s.li}"><strong>Cloud-Betrieb in Deutschland</strong> – DSGVO-konform</li>
          <li style="${s.li}">Schnelle Bereitstellung, <strong>skalierbar</strong> je Nutzer</li>
          <li style="${s.li}">Optionale <strong>4h-SLA</strong> & priorisierter Support</li>
          <li style="${s.li}">Portierung bestehender Rufnummern inklusive</li>
        </ul>

        <div style="margin:10px 0 14px 0">
          <a href="${calendly}" style="${s.btnGhost}" target="_blank" rel="noopener">Rückfrage-Termin buchen</a>
        </div>

        <!-- Kundendaten -->
        <div style="margin:12px 0 6px 0">
          <p style="${s.p}"><strong>${escapeHtml(customer.company || "Firma unbekannt")}</strong></p>
          ${customer.contact ? `<p style="${s.p}">${escapeHtml(customer.contact)}</p>` : ""}
          ${addressCustomer ? `<p style="${s.p}">${escapeHtml(addressCustomer)}</p>` : ""}
          ${customer.email ? `<p style="${s.p}">${escapeHtml(customer.email)}</p>` : ""}
        </div>

        <!-- Positionen -->
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
            ${lineItems.map(li => `
              <tr>
                <td style="${s.td}"><strong>${escapeHtml(li.name)}</strong><div style="${s.small}">${li.sku}</div></td>
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
              <td align="right" style="${s.totalRow}">Rabatt (${discountPct}%)</td>
              <td style="${s.totalRow}"><strong>−${formatMoney(discountAmount)}</strong></td>
            </tr>` : ""}
            <tr>
              <td colspan="2"></td>
              <td align="right" style="${s.totalRow}">Zwischensumme nach Rabatt</td>
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

        <!-- CTAs -->
        <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
          <a href="#" style="${s.btn}">Jetzt bestellen</a>
          <a href="${calendly}" style="${s.btnGhost}" target="_blank" rel="noopener">Beratungstermin vereinbaren</a>
        </div>

        <!-- Hinweis & Gruß -->
        <p style="${s.small};margin-top:16px">Alle Preise in EUR netto zzgl. der gesetzlichen Umsatzsteuer. Änderungen und Irrtümer vorbehalten.</p>
        <p style="${s.p};margin-top:12px">Mit freundlichen Grüßen<br/><strong>Sebastian Brandl</strong><br/>Managing Director · xVoice UC</p>

        <!-- Firmenblock -->
        <div style="margin-top:18px;padding-top:12px;border-top:1px solid #eee">
          <p style="${s.firmH}">${COMPANY.name}</p>
          <p style="${s.firm}">${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}</p>
          <p style="${s.firm}">Tel. ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
