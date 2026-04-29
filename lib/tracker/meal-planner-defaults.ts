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

// ─── Symptoms ──────────────────────────────────────────────────────────────
// Lifestyle / wellness symptoms the user may want to address. Distinct from
// HEALTH_OPTIONS, which are diagnoses. Symptoms feed the AI prompt so it can
// bias meal selection (e.g. iron-rich foods for fatigue, anti-inflammatory
// staples for joint pain). Optional in the wizard.

export const SYMPTOM_OPTIONS: Option[] = [
  { id: "hair-loss", label: "Hair loss / thinning" },
  { id: "fatigue", label: "Fatigue / low energy" },
  { id: "brain-fog", label: "Brain fog" },
  { id: "irregular-cycle", label: "Irregular cycle" },
  { id: "cold-sensitivity", label: "Cold sensitivity" },
  { id: "weight-changes", label: "Unexplained weight changes" },
  { id: "mood-swings", label: "Mood swings" },
  { id: "sleep-disturbance", label: "Sleep disturbance" },
  { id: "acne", label: "Acne / skin breakouts" },
  { id: "joint-pain", label: "Joint pain / stiffness" },
  { id: "digestive-issues", label: "Digestive issues / bloating" },
  { id: "low-libido", label: "Low libido" },
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

// ─── Cooking frequency ──────────────────────────────────────────────────────

export const COOKING_FREQUENCIES: { id: "daily" | "alternate" | "twice-weekly" | "weekly" | "custom"; label: string; hint: string }[] = [
  {
    id: "daily",
    label: "Daily",
    hint: "Cook fresh every day. 7 unique dinners.",
  },
  {
    id: "alternate",
    label: "Alternate days",
    hint: "Cook every other day, eat leftovers in between. ~4 dinners.",
  },
  {
    id: "twice-weekly",
    label: "Twice a week",
    hint: "Two batch-cook sessions, larger portions. 2-3 dinners.",
  },
  {
    id: "weekly",
    label: "Once a week",
    hint: "One big batch cook for the whole week. 1-2 dinners.",
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Describe your own pattern.",
  },
];

// ─── Days of week (used for cheat day picker) ───────────────────────────────

export const DAYS_OF_WEEK: Option[] = [
  { id: "Mon", label: "Monday" },
  { id: "Tue", label: "Tuesday" },
  { id: "Wed", label: "Wednesday" },
  { id: "Thu", label: "Thursday" },
  { id: "Fri", label: "Friday" },
  { id: "Sat", label: "Saturday" },
  { id: "Sun", label: "Sunday" },
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
    // Carb staples (South-Asian breakfast/lunch grain rotation)
    "basmati rice", "atta (whole-wheat flour)", "roti", "oats", "poha",
    "dalia (broken wheat)", "ragi", "idli batter", "dosa batter", "millets",
    "rava (semolina)",
    // Legumes & dals
    "lentils", "moong dal", "toor dal", "urad dal", "chana dal", "rajma",
    "chickpeas", "kala chana",
    // Spices & aromatics
    "ginger", "garlic", "turmeric", "cumin", "coriander", "garam masala",
    "mustard seeds", "curry leaves", "asafoetida (hing)", "fenugreek",
    // Dairy & fats
    "ghee", "paneer", "yogurt", "buttermilk",
    // Produce staples
    "onions", "tomatoes", "spinach", "methi (fenugreek leaves)",
    "drumstick (moringa)", "okra (bhindi)",
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
