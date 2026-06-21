import type { Metadata } from "next";
import { LegalDoc } from "../LegalDoc";

export const metadata: Metadata = {
  title: "Despre ImoGhid",
  description: "Despre platforma ImoGhid pentru agenții imobiliari din Republica Moldova.",
};

export default function DesprePage() {
  return <LegalDoc docKey="despre" />;
}
