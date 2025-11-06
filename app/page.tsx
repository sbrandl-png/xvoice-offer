use client";
import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, Download, Mail, ShoppingCart, Copy, Eye, Trash2 } from "lucide-react";

// Branding
const BRAND = {
  name: "xVoice UC",
  logoUrl: "https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x",
  primary: "#ff4e00",
  dark: "#111",
  headerBg: "#000000",
  headerFg: "#ffffff",
};

// Firmendaten für CI-Header & Footer
const COMPANY = {
  name: "xVoice UC UG (Haftungsbeschränkt)",
  street: "Peter-Müller-Straße 3",
  zip: "40468",
  city: "Düsseldorf",
  phone: "+49 211 955 861 0",
  email: "vertrieb@xvoice-uc.de",
  web: "www.xvoice-uc.de",
};

// === Rest des Codes bleibt unverändert, nur Anpassungen im Header- und Footer-Block ===

function Header() {
  return (
    <div className="flex items-center justify-between gap-4 p-6 rounded-2xl shadow-sm" style={{ background: BRAND.headerBg, color: BRAND.headerFg }}>
      <div className="flex items-center gap-6">
        <img src={BRAND.logoUrl} alt="xVoice Logo" className="h-16 w-16 object-contain" />
        <div>
          <div className="text-2xl font-semibold" style={{ color: BRAND.headerFg }}>{BRAND.name}</div>
          <div className="text-sm opacity-80" style={{ color: BRAND.headerFg }}>Angebots- und Bestell-Konfigurator</div>
        </div>
      </div>
      <div className="text-sm" style={{ color: "#d1d5db" }}>Stand {new Date().toISOString().slice(0, 10)}</div>
    </div>
  );
}

// Im buildEmailHtml Footer ersetzen
// ...
<p style="${s.firmH}">${COMPANY.name}</p>
<p style="${s.firm}">${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}</p>
<p style="${s.firm}">Tel. ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}</p>
// ...
