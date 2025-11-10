"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic"; // verhindert hartnäckige SSG-Fälle

function OrderClient() {
  const sp = useSearchParams();
  const token = sp.get("token") || "";
  // Optional: signer & salesEmail aus Query erlauben (falls ihr sie anhängt)
  const signerName = sp.get("signer_name") || "";
  const signerEmail = sp.get("signer_email") || "";
  const salesEmail = sp.get("sales") || "";

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit: true,
          token,
          signer: { name: signerName, email: signerEmail },
          salesEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Unbekannter Fehler");
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-lg w-full bg-white shadow-md rounded-xl p-8 text-center">
          <img
            src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x"
            alt="xVoice Logo"
            className="mx-auto h-16 mb-6"
          />
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">
            Vielen Dank für Ihre Bestellung!
          </h1>
          <p className="text-gray-700 leading-relaxed mb-6">
            Ihre Auftragsbestätigung wurde erfolgreich übermittelt. Unser Team bereitet nun die Bereitstellung Ihrer xVoice&nbsp;UC Lösung vor.
          </p>
          <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600 mb-6">
            Um die technische Umsetzung und Konfiguration gemeinsam zu besprechen, können Sie direkt einen Termin für das Kick-off-Gespräch buchen:
          </div>
          <a
            href="https://calendly.com/s-brandl-xvoice-uc/xvoice-uc-kickoff-meeting"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#ff4e00] text-white font-medium px-6 py-3 rounded-lg hover:bg-[#e24400] transition-colors"
          >
            Kick-off-Gespräch jetzt buchen
          </a>
          <p className="text-xs text-gray-500 mt-8">
            © {new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·{" "}
            <a href="https://www.xvoice-uc.de/impressum" className="underline">
              Impressum & Datenschutz
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full bg-white shadow-md rounded-xl p-8 text-center">
        <img
          src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x"
          alt="xVoice Logo"
          className="mx-auto h-16 mb-6"
        />
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          Bestellung abschließen
        </h1>
        <p className="text-gray-700 mb-6">
          Bitte bestätigen Sie Ihre Bestellung, um die Bereitstellung Ihrer Lösung zu starten.
        </p>

        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-2 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !token}
          className="w-full bg-[#ff4e00] text-white font-semibold py-3 rounded-lg hover:bg-[#e24400] transition-colors disabled:opacity-60"
        >
          {loading ? "Wird übermittelt …" : "Jetzt verbindlich bestellen"}
        </button>

        {!token && (
          <p className="text-xs text-red-600 mt-3">
            Es wurde kein Token in der URL gefunden (?token=...).
          </p>
        )}

        <p className="text-xs text-gray-500 mt-8">
          © {new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·{" "}
          <a href="https://www.xvoice-uc.de/impressum" className="underline">
            Impressum & Datenschutz
          </a>
        </p>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12">
          <div className="max-w-lg w-full bg-white shadow-md rounded-xl p-8 text-center">
            <p className="text-gray-700">Lade Bestellseite …</p>
          </div>
        </main>
      }
    >
      <OrderClient />
    </Suspense>
  );
}
