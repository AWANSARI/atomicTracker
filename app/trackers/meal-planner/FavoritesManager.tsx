"use client";

import { useState, useTransition } from "react";
import { Heart, Plus, X } from "lucide-react";
import {
  addFavoriteIngredient,
  addFavoriteMeal,
  removeFavoriteIngredient,
  removeFavoriteMeal,
} from "./actions";

type FavoritesField = "favoriteMeals" | "favoriteIngredients";

/**
 * Chip-list editor for the user's hearted meals + ingredients. Mounted inside
 * a `<details>` on the meal-planner home. Optimistic-update pattern: edits
 * land immediately in local state; on server failure we roll back and surface
 * the error inline.
 */
export function FavoritesManager({
  initialMeals,
  initialIngredients,
}: {
  initialMeals: string[];
  initialIngredients: string[];
}) {
  const [meals, setMeals] = useState<string[]>(initialMeals);
  const [ingredients, setIngredients] = useState<string[]>(initialIngredients);

  return (
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      <FavoriteList
        title="Favorite meals"
        emptyHint="No favorites yet — heart a meal on any plan to add it here, or use Edit config."
        items={meals}
        setItems={setMeals}
        field="favoriteMeals"
      />
      <FavoriteList
        title="Favorite ingredients"
        emptyHint="No favorites yet — add ingredients you'd like the AI to lean on."
        items={ingredients}
        setItems={setIngredients}
        field="favoriteIngredients"
      />
    </div>
  );
}

function FavoriteList({
  title,
  emptyHint,
  items,
  setItems,
  field,
}: {
  title: string;
  emptyHint: string;
  items: string[];
  setItems: (next: string[]) => void;
  field: FavoritesField;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      setDraft("");
      return;
    }
    const optimistic = [...items, v];
    setItems(optimistic);
    setDraft("");
    setError(null);
    startTransition(async () => {
      try {
        const next =
          field === "favoriteMeals"
            ? await addFavoriteMeal(v)
            : await addFavoriteIngredient(v);
        setItems(next);
      } catch (e) {
        // Roll back the optimistic add.
        setItems(items);
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function remove(name: string) {
    const optimistic = items.filter((n) => n !== name);
    setItems(optimistic);
    setError(null);
    startTransition(async () => {
      try {
        const next =
          field === "favoriteMeals"
            ? await removeFavoriteMeal(name)
            : await removeFavoriteIngredient(name);
        setItems(next);
      } catch (e) {
        setItems(items);
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        <Heart className="h-3.5 w-3.5 text-red-500" fill="currentColor" />
        {title}
        <span className="ml-auto text-[10px] font-normal text-slate-400 dark:text-slate-500">
          {items.length}
        </span>
      </h3>

      {items.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {emptyHint}
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((name) => (
            <li
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <span className="max-w-[200px] truncate">{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => remove(name)}
                disabled={busy}
                className="grid h-4 w-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <input
          aria-label={`Add ${title.toLowerCase()}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add custom…"
          className="h-7 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || busy}
          aria-label="Add"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-brand-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
