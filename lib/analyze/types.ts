// Поля, извлекаемые из документов одного объекта (objectIndex).
export type ExtractedFields = {
  cadastralNo: string | null;
  address: string | null;
  owner_names: string[]; // может быть несколько собственников
  area_act: string | null; // площадь по акту, напр. "60,1"
  area_extras: string | null; // площадь по выписке
  legal_basis: string | null; // temeiul dreptului
  encumbrances: string | null; // sarcini/grevări ("" если нет)
  purchase_price: string | null; // сумма из акта (MDL)
  seller_is_legal_entity: boolean; // собственник — юр. лицо
};

export type DocInput = {
  fileName: string;
  fileUrl: string; // /uploads/[txId]/...
  mimeType: string;
};
