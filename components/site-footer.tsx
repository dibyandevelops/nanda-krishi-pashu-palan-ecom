"use client";

import Image from "next/image";

type SiteFooterProps = {
  locationUrl: string;
  storeContactNumber: string;
  whatsappUrl: string;
};

export default function SiteFooter({ locationUrl, storeContactNumber, whatsappUrl }: SiteFooterProps) {
  return (
    <footer className="mt-auto border-t border-[#d8bc98] bg-[#f7ead1] px-4 py-8 text-sm text-[#5c4024] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.3fr_1fr_1fr]">
        <div className="rounded-2xl border border-[#e2ccaa] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a6f3f]">Nanda Krishi Tatha Pasupalan</p>
          <p className="mt-2 text-sm">© {new Date().getFullYear()} All rights reserved.</p>
          <div className="mt-2">
            <p className="text-sm">Contact:</p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex rounded-lg bg-[#25d366] px-4 py-2 font-semibold text-white"
            >
              WhatsApp {storeContactNumber}
            </a>
          </div>
          <p className="mt-1 text-sm">Hours: Weekdays 6:00 AM - 6:00 PM</p>
          <p className="mt-1 text-sm">Location: Harisiddhi, Lalitpur</p>
          <p className="mt-1 text-sm">PAN: 123786236</p>
          <a href={locationUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block font-semibold text-[#2f7d32] underline">
            Open Google Maps Location
          </a>
        </div>

        <div className="rounded-2xl border border-[#e2ccaa] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a6f3f]">Accepted Payment Partner</p>
          <div className="mt-2 rounded-lg border border-[#e8d7bd] p-2">
            <Image src="/esewa_logo.png" alt="eSewa payment partner" width={280} height={102} className="h-9 w-auto" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#e2ccaa] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a6f3f]">Support & Development</p>
          <p className="mt-2 text-sm font-semibold">LocoTech Development</p>
          <p className="mt-2 text-sm">Need application similar to this application?</p>
          <p className="mt-2 text-sm">
            <a href="mailto:dibyan.softwaredev@gmail.com" className="font-semibold text-[#2f7d32] underline">
              Contact Us
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
