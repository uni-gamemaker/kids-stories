import type { StoryTemplate } from "./types";

// Story no. 1 in the series: the first dentist visit.
const dentist: StoryTemplate = {
  series_no: 1,
  slug: "first-dentist-visit",
  title: "{{hero_name}}'s First Visit to the Dentist",
  event: "first dentist visit",
  pages: [
    { text: "A story for {{hero_name}}", scene: "Cover: the cartoon boy stands smiling in front of a bright, cheerful dental clinic door holding {{toy}}, a big shiny cartoon tooth with a friendly face waves beside him." },
    { text: "One sunny morning, {{hero_name}} brushed his teeth, front and back, all the way round. Today was a special day: his very first visit to the dentist!", scene: "A sunny bathroom, the boy brushing his teeth at the sink on a little step stool, a window with morning light, {{toy}} sitting on the sink." },
    { text: "{{hero_name}} felt a little wobbly inside. He had one big worry: {{worry}}. {{toy_name}} snuggled close. \"I'll come too,\" said {{toy_name}}.", scene: "The boy sits on his bed holding {{toy}} close, looking a little thoughtful, a small cloud-shaped thought bubble above his head with soft wavy lines (no words)." },
    { text: "At {{place}}, the door went ding-a-ling! The waiting room had colorful books, a fish tank and a basket of toys.", scene: "A bright child-friendly dental waiting room with a fish tank, colorful books and a basket of toys, the boy walking in with {{toy}} under his arm." },
    { text: "\"Hello, {{hero_name}}!\" said Dr. Maya with a warm smile. \"I will always tell you what I'm doing. And if you want a break, just raise your hand and I'll stop.\"", scene: "The friendly dentist crouches to the boy's height and smiles warmly, the boy raises one hand with a brave little smile." },
    { text: "Up, up, up went the big chair, like a gentle elevator! {{hero_name}} wore shiny sunglasses so the bright light wouldn't tickle his eyes.", scene: "The boy reclines in a big dental chair wearing small round sunglasses, the lamp glowing softly above, {{toy}} watching from a side table." },
    { text: "Dr. Maya showed him a tiny mirror. \"This is my tooth-detective mirror. Open wide like a sleepy lion!\" {{hero_name}} opened wide and said, \"Aaaah.\"", scene: "The dentist holds a tiny round mirror, the boy opens his mouth wide, playful magnifying-glass detective feel." },
    { text: "Dr. Maya explained everything before it began, so {{worry}} did not feel so big anymore. A little brush hummed \"zzzz\" and tickled his teeth with minty toothpaste.", scene: "The dentist gently holds a small spinning brush near the boy's smile, tiny sparkles and mint-green bubbles floating, the boy giggles." },
    { text: "A little straw named Mr. Slurpy sipped the water away. Slurp, slurp! Then it was {{toy_name}}'s turn to open wide, too.", scene: "The boy laughs as the dentist holds a little suction straw with a funny cartoon face, {{toy}} sits on the chair arm with its mouth open." },
    { text: "\"All done!\" said Dr. Maya. \"Your teeth are shiny and strong.\" {{hero_name}} picked a sticker and a brand-new toothbrush.", scene: "The boy proudly holds a new toothbrush and a sticker, the dentist gives a thumbs-up, shiny sparkles around his smile." },
    { text: "That night, {{hero_name}} brushed his teeth, front and back, all the way round. \"The dentist isn't so scary,\" he whispered to {{toy_name}}. The end.", scene: "A cozy bedroom at night with a warm lamp, the boy in pajamas in bed hugging {{toy}}, a new toothbrush in a cup on the nightstand, a crescent moon in the window." },
  ],
};

export const TEMPLATES: StoryTemplate[] = [dentist];

export function findTemplate(key: string | number): StoryTemplate | undefined {
  return TEMPLATES.find((t) => t.slug === key || t.series_no === Number(key));
}
