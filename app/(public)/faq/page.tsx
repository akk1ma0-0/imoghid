import type { Metadata } from "next";
import { LegalDoc } from "../LegalDoc";

export const metadata: Metadata = {
  title: "Întrebări frecvente · ImoGhid",
  description: "Întrebări frecvente despre ImoGhid.",
};

export default function FaqPage() {
  return <LegalDoc docKey="faq" />;
}
