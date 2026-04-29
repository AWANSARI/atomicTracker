/**
 * Catalogs and per-cuisine ingredient suggestions used by the meal-planner
 * config wizard. Pure data, safe to ship to the client.
 */

export type Option = { id: string; label: string };

// ─── Diet ──────────────────────────────────────────────────────────────────

export type DietGroup = { title: string; options: Option[] };

export const DIET_GROUPS: DietGroup[] = [
  {
    title: "Style",
    options: [
      { id: "vegetarian", label: "Vegetarian" },
      { id: "non-vegetarian", label: "Non-vegetarian" },
      { id: "vegan", label: "Vegan" },
      { id: "pescatarian", label: "Pescatarian" },
    ],
  },
  {
    title: "Religious",
    options: [
      { id: "halal", label: "Halal" },
      { id: "kosher", label: "Kosher" },
    ],
  },
  {
    title: "Approach",
    options: [
      { id: "keto", label: "Keto / Low-carb" },
      { id: "paleo", label: "Paleo" },
      { id: "mediterranean", label: "Mediterranean" },
      { id: "whole30", label: "Whole30" },
    ],
  },
  {
    title: "Restrictions",
    options: [
      { id: "gluten-free", label: "Gluten-free" },
      { id: "dairy-free", label: "Dairy-free" },
      { id: "nut-free", label: "Nut-free" },
    ],
  },
  {
    title: "Goals",
    options: [
      { id: "low-sodium", label: "Low-sodium" },
      { id: "high-protein", label: "High-protein" },
      { id: "diabetic-friendly", label: "Diabetic-friendly" },
    ],
  },
];

export const ALL_DIETS: Option[] = DIET_GROUPS.flatMap((g) => g.options);

// ─── Health conditions ─────────────────────────────────────────────────────

export const HEALTH_OPTIONS: Option[] = [
  { id: "thyroid-hypo", label: "Hypothyroid" },
  { id: "thyroid-hyper", label: "Hyperthyroid" },
  { id: "diabetes-t1", label: "Diabetes (T1)" },
  { id: "diabetes-t2", label: "Diabetes (T2)" },
  { id: "hypertension", label: "Hypertension" },
  { id: "high-cholesterol", label: "High cholesterol" },
  { id: "pcos", label: "PCOS" },
  { id: "ibs", label: "IBS" },
  { id: "gerd", label: "GERD / acid reflux" },
  { id: "kidney", label: "Kidney issues" },
  { id: "anemia", label: "Anemia" },
];

// ─── Allergies ─────────────────────────────────────────────────────────────

export const COMMON_ALLERGIES: Option[] = [
  { id: "peanuts", label: "Peanuts" },
  { id: "tree-nuts", label: "Tree nuts" },
  { id: "shellfish", label: "Shellfish" },
  { id: "eggs", label: "Eggs" },
  { id: "soy", label: "Soy" },
  { id: "wheat", label: "Wheat / gluten" },
  { id: "fish", label: "Fish" },
  { id: "sesame", label: "Sesame" },
  { id: "dairy", label: "Dairy" },
];

// ─── Cuisines ──────────────────────────────────────────────────────────────

export const CUISINES: Option[] = [
  { id: "italian", label: "Italian" },
  { id: "mexican", label: "Mexican" },
  { id: "indian", label: "Indian" },
  { id: "chinese", label: "Chinese" },
  { id: "japanese", label: "Japanese" },
  { id: "thai", label: "Thai" },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "american", label: "American" },
  { id: "french", label: "French" },
  { id: "korean", label: "Korean" },
  { id: "vietnamese", label: "Vietnamese" },
  { id: "middle-eastern", label: "Middle Eastern" },
];

// ─── Per-cuisine suggested ingredients ─────────────────────────────────────

export const CUISINE_INGREDIENTS: Record<string, string[]> = {
  italian: [
    "olive oil", "garlic", "tomatoes", "basil", "mozzarella", "parmesan",
    "pasta", "arborio rice", "prosciutto", "pancetta",
  ],
  mexican: [
    "corn tortillas", "black beans", "pinto beans", "tomatoes", "avocado",
    "lime", "cilantro", "jalapeño", "queso fresco", "cumin",
  ],
  indian: [
    "basmati rice", "lentils", "chickpeas", "ginger", "garlic", "turmeric",
    "cumin", "coriander", "garam masala", "ghee", "paneer", "yogurt",
    "onions", "tomatoes",
  ],
  chinese: [
    "jasmine rice", "soy sauce", "ginger", "garlic", "sesame oil", "scallions",
    "bok choy", "tofu", "shiitake mushrooms", "rice vinegar",
  ],
  japanese: [
    "short-grain rice", "soy sauce", "miso", "mirin", "dashi", "nori", "tofu",
    "edamame", "salmon", "wakame",
  ],
  thai: [
    "rice noodles", "coconut milk", "fish sauce", "lime", "lemongrass",
    "galangal", "thai basil", "peanuts", "kaffir lime leaves",
  ],
  mediterranean: [
    "olive oil", "lemon", "feta", "olives", "tomatoes", "cucumber", "chickpeas",
    "greek yogurt", "oregano", "parsley",
  ],
  american: [
    "chicken breast", "ground beef", "potatoes", "corn", "lettuce", "cheddar",
    "bacon", "BBQ sauce",
  ],
  french: [
    "butter", "cream", "thyme", "tarragon", "dijon mustard", "leeks",
    "shallots", "white wine", "gruyère",
  ],
  korean: [
    "short-grain rice", "gochujang", "sesame oil", "kimchi", "tofu",
    "scallions", "garlic", "soy sauce",
  ],
  vietnamese: [
    "rice noodles", "fish sauce", "lime", "cilantro", "mint", "thai basil",
    "bean sprouts", "rice paper",
  ],
  "middle-eastern": [
    "olive oil", "tahini", "lemon", "parsley", "mint", "chickpeas", "lamb",
    "sumac", "za'atar", "bulgur",
  ],
};
