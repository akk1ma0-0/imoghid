import type { Metadata } from "next";
import { LegalDoc } from "../LegalDoc";

export const metadata: Metadata = {
  title: "Politică de confidențialitate · ImoGhid",
  description: "Politica de confidențialitate a aplicației ImoGhid.",
};

export default function ConfidentialitatePage() {
  return <LegalDoc docKey="confidentialitate" />;
}
