// Тип загруженной транзакции (ответ GET /api/transactions/[id]).
export type FlowDoc = {
  id: string;
  objectIndex: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  documentType: string | null;
};
export type FlowField = {
  id: string;
  objectIndex: number;
  fieldName: string;
  value: string | null;
  isActualized: boolean | null;
};
export type FlowFlag = {
  id: string;
  objectIndex: number;
  severity: "RED" | "AMBER" | "GREEN";
  zone: string;
  code: string;
  titleRo: string;
  descriptionRo: string | null;
  legalRef: string | null;
  legalRefUrl: string | null;
};
export type FlowOwner = {
  id: string;
  objectIndex: number;
  fullName: string;
  shareNumerator: number;
  shareDenominator: number;
  cota: string | null;
  isActualized: boolean | null;
  isMinor: boolean;
  isLegalEntity: boolean;
  acordSotRequired: boolean;
  acordSotObtained: boolean;
  tutorApprovalRequired: boolean;
  tutorApprovalObtained: boolean;
  foundersDecisionRequired: boolean;
  foundersDecisionObtained: boolean;
  dataActualizationRequired: boolean;
  dataActualizationDone: boolean;
};
export type FlowChecklistItem = {
  id: string;
  party: string;
  documentKey: string;
  labelRo: string;
  isRequired: boolean;
  isUploaded: boolean;
  sortOrder: number;
};
export type FlowCalculation = {
  buyPrice: number | null;
  sellPrice: number | null;
  isExempt: boolean;
} | null;

export type FlowTx = {
  id: string;
  address: string | null;
  cadastralNo: string | null;
  objectType: string | null;
  suprafata: string | null;
  destinatie: string | null;
  valoare: string | null;
  verificareImobil: string | null;
  dealType: "VANZARE_CUMPARARE" | "DONATIE" | "SCHIMB" | "ALT_TIP";
  sellerType: "PERSOANA_FIZICA" | "PERSOANA_JURIDICA";
  buyerType: "PERSOANA_FIZICA" | "PERSOANA_JURIDICA";
  clientName: string | null;
  clientPhone: string | null;
  clientContractRef: string | null;
  currentStepNumber: number;
  completedAt: string | null;
  documents: FlowDoc[];
  extractedFields: FlowField[];
  flags: FlowFlag[];
  owners: FlowOwner[];
  notarChecklist: FlowChecklistItem[];
  calculation: FlowCalculation;
};
