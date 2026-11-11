export interface OrderForm {
  hero_name: string;   // placeholder "Adam"; later replaced by the order form's child name
  place: string;       // real place, e.g. the clinic name
  toy: string;         // short visual description of the favourite toy
  toy_name: string;
  worry: string;       // the specific worry, as a short noun phrase
}

export const DEFAULT_ORDER: OrderForm = {
  hero_name: "Adam",
  place: "Sunny Smiles Dental Clinic",
  toy: "a small plush lion with a golden mane and a red scarf",
  toy_name: "Leo",
  worry: "the buzzing sounds",
};

export interface PageTemplate {
  text: string;   // may contain {{hero_name}}, {{place}}, {{toy_name}}, {{worry}}
  scene: string;  // illustration description; may contain {{toy}}, {{place}}
}

export interface StoryTemplate {
  series_no: number;
  slug: string;
  title: string;          // may contain {{hero_name}}
  event: string;
  pages: PageTemplate[];  // pages[0] is the cover
}

export function fill(s: string, o: OrderForm): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => (o as unknown as Record<string, string>)[k] ?? "");
}
