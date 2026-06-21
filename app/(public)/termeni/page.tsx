import type { Metadata } from "next";
import { LegalDoc } from "../LegalDoc";

export const metadata: Metadata = {
  title: "Termeni și Condiții · ImoGhid",
  description: "Termenii și condițiile de utilizare a aplicației ImoGhid.",
};

export default function TermeniPage() {
  return <LegalDoc docKey="termeni" />;
}
