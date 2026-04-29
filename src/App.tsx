import { useEffect, useState } from 'react'
import './App.css'
import {
  buildImportedRecipe,
  recipes,
  splitIngredient,
  type Ingredient,
  type Recipe,
} from './recipes'
import type { ImportedRecipePayload } from './recipeImport'

type PlannedRecipe = {
  recipeId: string
  excludedIngredientKeys: string[]
}

type View = 'cookbook' | 'recipe' | 'planner' | 'shopping' | 'import'

type PersistedAppState = {
  importedRecipes: Recipe[]
  plannedRecipes: PlannedRecipe[]
  recipeNotes: Record<string, string>
  manualShoppingItems: string[]
  completedShoppingItems: string[]
  removedShoppingItems: string[]
}

type GroceryListItem = {
  key: string
  item: string
}

const initialPlannedRecipes: PlannedRecipe[] = []
const baseRecipeIds = new Set(recipes.map((recipe) => recipe.id))
const baseRecipeNotes = Object.fromEntries(
  recipes.map((recipe) => [recipe.id, recipe.notes]),
) as Record<string, string>

const views: { id: View; label: string; caption: string; icon: string }[] = [
  { id: 'cookbook', label: 'Cookbook', caption: 'Browse and filter the library', icon: '📚' },
  { id: 'recipe', label: 'Recipe', caption: 'Read and edit the selected recipe', icon: '🍳' },
  { id: 'planner', label: 'Planner', caption: 'Collect recipes you want to make', icon: '📅' },
  { id: 'shopping', label: 'Shopping List', caption: 'Generate groceries from the plan', icon: '🛒' },
  { id: 'import', label: 'Import', caption: 'Create a recipe from a URL', icon: '＋' },
]

const recipePlaceholderImage = '/recipe-placeholder.svg'
const scaleOptions = [0.5, 1, 2, 3]
type ParsedAmountToken = {
  value: number
  plus: boolean
}

const unicodeFractions: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

function ingredientKey(ingredient: Ingredient) {
  return `${ingredient.item}__${ingredient.amount}`
}

function formatIngredient(ingredient: Ingredient) {
  return ingredient.amount ? `${ingredient.amount} ${ingredient.item}` : ingredient.item
}

function parseAmountToken(token: string): ParsedAmountToken | null {
  const trimmed = token.trim()

  if (!trimmed) {
    return null
  }

  const plus = trimmed.endsWith('+')
  const withoutPlus = plus ? trimmed.slice(0, -1) : trimmed

  if (/^\d+\s+\d+\/\d+$/.test(withoutPlus)) {
    const [wholeNumber, fraction] = withoutPlus.split(/\s+/)
    const parsedFraction = parseAmountToken(fraction)

    if (!parsedFraction) {
      return null
    }

    return { value: Number(wholeNumber) + parsedFraction.value, plus }
  }

  if (/^\d+[¼½¾⅓⅔⅛⅜⅝⅞]$/.test(withoutPlus)) {
    const wholeNumber = withoutPlus.slice(0, -1)
    const fraction = withoutPlus.slice(-1)
    const parsedFraction = parseAmountToken(fraction)

    if (!parsedFraction) {
      return null
    }

    return { value: Number(wholeNumber) + parsedFraction.value, plus }
  }

  if (unicodeFractions[withoutPlus] !== undefined) {
    return { value: unicodeFractions[withoutPlus], plus }
  }

  if (/^\d+\/\d+$/.test(withoutPlus)) {
    const [numerator, denominator] = withoutPlus.split('/').map(Number)
    return denominator ? { value: numerator / denominator, plus } : null
  }

  if (/^\d+(?:\.\d+)?$/.test(withoutPlus)) {
    return { value: Number(withoutPlus), plus }
  }

  return null
}

function formatScaledNumber(value: number) {
  const rounded = Math.round(value * 100) / 100
  const whole = Math.trunc(rounded)
  const remainder = rounded - whole
  const fractionChoices = [
    [1 / 8, '1/8'],
    [1 / 4, '1/4'],
    [1 / 3, '1/3'],
    [3 / 8, '3/8'],
    [1 / 2, '1/2'],
    [5 / 8, '5/8'],
    [2 / 3, '2/3'],
    [3 / 4, '3/4'],
    [7 / 8, '7/8'],
  ] as const

  if (Math.abs(remainder) < 0.01) {
    return String(whole)
  }

  const bestFraction = fractionChoices.find(([fraction]) => Math.abs(remainder - fraction) < 0.03)

  if (bestFraction) {
    const [, label] = bestFraction

    if (whole === 0) {
      return label
    }

    return `${whole} ${label}`
  }

  return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function scaleAmountValue(value: string, factor: number) {
  return value.replace(
    /\d+\s+\d+\/\d+\+?|\d+[¼½¾⅓⅔⅛⅜⅝⅞]\+?|\d+(?:\.\d+)?\+?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]/g,
    (token) => {
    const parsedToken = parseAmountToken(token)

    if (!parsedToken) {
      return token
    }

    const scaledValue = formatScaledNumber(parsedToken.value * factor)
    return parsedToken.plus ? `${scaledValue}+` : scaledValue
    },
  )
}

function scaleIngredientAmount(amount: string, factor: number) {
  if (!amount || factor === 1) {
    return amount
  }

  return scaleAmountValue(amount, factor)
}

function resolveRecipeImage(image: string) {
  return image || recipePlaceholderImage
}

function handleRecipeImageError(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.src = recipePlaceholderImage
}

function mergeRecipeLibrary(importedRecipes: Recipe[]) {
  const seenRecipeIds = new Set(baseRecipeIds)

  return [
    ...recipes,
    ...importedRecipes.filter((recipe) => {
      if (seenRecipeIds.has(recipe.id)) {
        return false
      }

      seenRecipeIds.add(recipe.id)
      return true
    }),
  ]
}

function App() {
  const [recipeLibrary, setRecipeLibrary] = useState(recipes)
  const [activeView, setActiveView] = useState<View>('cookbook')
  const [selectedSection, setSelectedSection] = useState('All')
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0].id)
  const [search, setSearch] = useState('')
  const [plannedRecipesState, setPlannedRecipesState] = useState(initialPlannedRecipes)
  const [recipeNotes, setRecipeNotes] = useState(baseRecipeNotes)
  const [ingredientPickerOpen, setIngredientPickerOpen] = useState(false)
  const [ingredientSelection, setIngredientSelection] = useState<string[]>([])
  const [pickerRecipeId, setPickerRecipeId] = useState(recipes[0].id)
  const [recipeScale, setRecipeScale] = useState(1)
  const [importUrl, setImportUrl] = useState(
    'https://www.theguardian.com/food/2025/jul/19/vegan-recipe-sweetcorn-hiyashi-meera-sodha',
  )
  const [importError, setImportError] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'loading'>('idle')
  const [lastImportedRecipeTitle, setLastImportedRecipeTitle] = useState('')
  const [manualShoppingItems, setManualShoppingItems] = useState<string[]>([])
  const [completedShoppingItems, setCompletedShoppingItems] = useState<string[]>([])
  const [removedShoppingItems, setRemovedShoppingItems] = useState<string[]>([])
  const [manualShoppingInput, setManualShoppingInput] = useState('')
  const [stateLoaded, setStateLoaded] = useState(false)
  const [stateError, setStateError] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadPersistedState() {
      try {
        const response = await fetch('/api/state')
        const payload = (await response.json()) as PersistedAppState | { error: string }

        if (!response.ok || !('importedRecipes' in payload)) {
          throw new Error('error' in payload ? payload.error : 'Unable to load saved app state.')
        }

        if (ignore) {
          return
        }

        const mergedRecipes = mergeRecipeLibrary(payload.importedRecipes)
        const availableRecipeIds = new Set(mergedRecipes.map((recipe) => recipe.id))

        setRecipeLibrary(mergedRecipes)
        setRecipeNotes({
          ...Object.fromEntries(mergedRecipes.map((recipe) => [recipe.id, recipe.notes])),
          ...payload.recipeNotes,
        })
        setPlannedRecipesState(
          payload.plannedRecipes.filter((plannedRecipe) =>
            availableRecipeIds.has(plannedRecipe.recipeId),
          ),
        )
        setManualShoppingItems(payload.manualShoppingItems)
        setCompletedShoppingItems(payload.completedShoppingItems)
        setRemovedShoppingItems(payload.removedShoppingItems)
        setSelectedRecipeId((currentRecipeId) =>
          availableRecipeIds.has(currentRecipeId) ? currentRecipeId : mergedRecipes[0].id,
        )
        setStateLoaded(true)
        setStateError('')
      } catch (error) {
        if (!ignore) {
          setStateError(
            error instanceof Error ? error.message : 'Unable to load saved app state.',
          )
        }
      }
    }

    void loadPersistedState()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!stateLoaded) {
      return
    }

    let ignore = false
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const importedRecipes = recipeLibrary.filter((recipe) => !baseRecipeIds.has(recipe.id))
          const persistedNotes = Object.fromEntries(
            Object.entries(recipeNotes).filter(
              ([recipeId, note]) => !baseRecipeIds.has(recipeId) || note.trim(),
            ),
          )

          const response = await fetch('/api/state', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              importedRecipes,
              plannedRecipes: plannedRecipesState,
              recipeNotes: persistedNotes,
              manualShoppingItems,
              completedShoppingItems,
              removedShoppingItems,
            } satisfies PersistedAppState),
          })

          if (!response.ok) {
            const payload = (await response.json()) as { error?: string }
            throw new Error(payload.error || 'Unable to save app state.')
          }

          if (!ignore) {
            setStateError('')
          }
        } catch (error) {
          if (!ignore) {
            setStateError(
              error instanceof Error ? error.message : 'Unable to save app state.',
            )
          }
        }
      })()
    }, 300)

    return () => {
      ignore = true
      window.clearTimeout(timeoutId)
    }
  }, [
    completedShoppingItems,
    manualShoppingItems,
    plannedRecipesState,
    recipeLibrary,
    recipeNotes,
    removedShoppingItems,
    stateLoaded,
  ])

  const allSections = ['All', ...new Set(recipeLibrary.map((recipe) => recipe.section))]

  const visibleRecipes = recipeLibrary.filter((recipe) => {
    const matchesSection =
      selectedSection === 'All' || recipe.section === selectedSection
    const haystack = [
      recipe.title,
      recipe.author,
      recipe.source,
      recipe.section,
      recipe.tags.join(' '),
      recipe.ingredients.map((ingredient) => ingredient.item).join(' '),
    ]
      .join(' ')
      .toLowerCase()

    return matchesSection && haystack.includes(search.trim().toLowerCase())
  })

  const selectedRecipe =
    recipeLibrary.find((recipe) => recipe.id === selectedRecipeId) ?? recipeLibrary[0]

  const pickerRecipe = recipeLibrary.find((recipe) => recipe.id === pickerRecipeId) ?? selectedRecipe

  const selectedRecipePlan = plannedRecipesState.find(
    (plannedRecipe) => plannedRecipe.recipeId === selectedRecipe.id,
  )

  const plannedRecipes = plannedRecipesState
    .map((plannedRecipe) => {
      const recipe = recipeLibrary.find((entry) => entry.id === plannedRecipe.recipeId)
      return recipe ? { recipe, excludedIngredientKeys: plannedRecipe.excludedIngredientKeys } : null
    })
    .filter(
      (
        plannedRecipe,
      ): plannedRecipe is { recipe: Recipe; excludedIngredientKeys: string[] } =>
        Boolean(plannedRecipe),
    )

  const groceryByAisle = plannedRecipes.reduce<Record<string, GroceryListItem[]>>((groups, plannedRecipe) => {
    plannedRecipe.recipe.ingredients
      .filter(
        (ingredient) =>
          !plannedRecipe.excludedIngredientKeys.includes(ingredientKey(ingredient)),
      )
      .forEach((ingredient, ingredientIndex) => {
        if (!groups[ingredient.aisle]) {
          groups[ingredient.aisle] = []
        }

        groups[ingredient.aisle].push({
          key: `recipe:${plannedRecipe.recipe.id}:${ingredientIndex}:${ingredientKey(ingredient)}`,
          item: formatIngredient(ingredient),
        })
      })

    return groups
  }, {})

  manualShoppingItems
    .map((item, itemIndex) => ({ ingredient: splitIngredient(item), itemIndex }))
    .forEach(({ ingredient, itemIndex }) => {
      if (!groceryByAisle[ingredient.aisle]) {
        groceryByAisle[ingredient.aisle] = []
      }

      groceryByAisle[ingredient.aisle].push({
        key: `manual:${itemIndex}:${ingredientKey(ingredient)}`,
        item: formatIngredient(ingredient),
      })
    })

  const completedShoppingItemSet = new Set(completedShoppingItems)
  const removedShoppingItemSet = new Set(removedShoppingItems)

  const visibleGroceryByAisle = Object.fromEntries(
    Object.entries(groceryByAisle)
      .map(
        ([aisle, items]): [string, GroceryListItem[]] => [
          aisle,
          items.filter(
            (item) =>
              !completedShoppingItemSet.has(item.key) &&
              !removedShoppingItemSet.has(item.key),
          ),
        ],
      )
      .filter(([, items]) => items.length > 0),
  ) as Record<string, GroceryListItem[]>

  const doneShoppingItems = Object.entries(groceryByAisle).flatMap(([aisle, items]) =>
    items
      .filter(
        (item) =>
          completedShoppingItemSet.has(item.key) &&
          !removedShoppingItemSet.has(item.key),
      )
      .map((item) => ({ ...item, aisle })),
  )

  useEffect(() => {
    const validItemKeys = new Set(
      Object.values(groceryByAisle)
        .flat()
        .map((item) => item.key),
    )

    setCompletedShoppingItems((currentItems) => {
      const filteredItems = currentItems.filter((itemKey) => validItemKeys.has(itemKey))
      return filteredItems.length === currentItems.length ? currentItems : filteredItems
    })

    setRemovedShoppingItems((currentItems) => {
      const filteredItems = currentItems.filter((itemKey) => validItemKeys.has(itemKey))
      return filteredItems.length === currentItems.length ? currentItems : filteredItems
    })
  }, [groceryByAisle])

  function selectRecipe(recipeId: string) {
    setSelectedRecipeId(recipeId)
    setRecipeScale(1)
    setActiveView('recipe')
  }

  function openIngredientPicker(recipeId: string) {
    setPickerRecipeId(recipeId)
    setIngredientSelection(
      plannedRecipesState.find((plannedRecipe) => plannedRecipe.recipeId === recipeId)
        ?.excludedIngredientKeys ?? [],
    )
    setIngredientPickerOpen(true)
  }

  async function importRecipeFromUrl() {
    setImportStatus('loading')
    setImportError('')

    try {
      const response = await fetch('/api/import-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: importUrl }),
      })

      const payload = (await response.json()) as
        | { recipe: ImportedRecipePayload }
        | { error: string }

      if (!response.ok || !('recipe' in payload)) {
        throw new Error('error' in payload ? payload.error : 'Recipe import failed.')
      }

      const importedRecipe = buildImportedRecipe(
        payload.recipe,
        new Set(recipeLibrary.map((recipe) => recipe.id)),
      )

      setRecipeLibrary((currentRecipes) => [...currentRecipes, importedRecipe])
      setRecipeNotes((currentNotes) => ({
        ...currentNotes,
        [importedRecipe.id]: '',
      }))
      setSelectedRecipeId(importedRecipe.id)
      setSelectedSection('All')
      setSearch('')
      setLastImportedRecipeTitle(importedRecipe.title)
      setRecipeScale(1)
      setActiveView('recipe')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Recipe import failed.')
    } finally {
      setImportStatus('idle')
    }
  }

  function toggleIngredientSelection(key: string) {
    setIngredientSelection((currentSelection) =>
      currentSelection.includes(key)
        ? currentSelection.filter((value) => value !== key)
        : [...currentSelection, key],
    )
  }

  function confirmPlannerAdd() {
    setPlannedRecipesState((currentPlannedRecipes) => {
      if (
        currentPlannedRecipes.some(
          (plannedRecipe) => plannedRecipe.recipeId === pickerRecipe.id,
        )
      ) {
        return currentPlannedRecipes.map((plannedRecipe) =>
          plannedRecipe.recipeId === pickerRecipe.id
            ? { ...plannedRecipe, excludedIngredientKeys: ingredientSelection }
            : plannedRecipe,
        )
      }

      return [
        ...currentPlannedRecipes,
        {
          recipeId: pickerRecipe.id,
          excludedIngredientKeys: ingredientSelection,
        },
      ]
    })
    setIngredientPickerOpen(false)
    setActiveView('planner')
  }

  function removePlannedRecipe(recipeId: string) {
    setPlannedRecipesState((currentPlannedRecipes) =>
      currentPlannedRecipes.filter((plannedRecipe) => plannedRecipe.recipeId !== recipeId),
    )
  }

  function clearAllPlans() {
    setPlannedRecipesState([])
  }

  function updateNote(note: string) {
    setRecipeNotes((currentNotes) => ({
      ...currentNotes,
      [selectedRecipe.id]: note,
    }))
  }

  function addManualShoppingItems() {
    const newItems = manualShoppingInput
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)

    if (newItems.length === 0) {
      return
    }

    setManualShoppingItems((currentItems) => [...currentItems, ...newItems])
    setManualShoppingInput('')
  }

  function markShoppingItemDone(itemKey: string) {
    setCompletedShoppingItems((currentItems) =>
      currentItems.includes(itemKey) ? currentItems : [...currentItems, itemKey],
    )
  }

  function undoCompletedShoppingItem(itemKey: string) {
    setCompletedShoppingItems((currentItems) =>
      currentItems.filter((currentItemKey) => currentItemKey !== itemKey),
    )
  }

  function clearNeedShoppingItems() {
    const visibleItemKeys = Object.values(visibleGroceryByAisle)
      .flat()
      .map((item) => item.key)

    if (visibleItemKeys.length === 0) {
      return
    }

    const visibleItemKeySet = new Set(visibleItemKeys)

    setCompletedShoppingItems((currentItems) =>
      currentItems.filter((itemKey) => !visibleItemKeySet.has(itemKey)),
    )
    setRemovedShoppingItems((currentItems) => [
      ...currentItems.filter((itemKey) => !visibleItemKeySet.has(itemKey)),
      ...visibleItemKeys,
    ])
  }

  function clearBoughtShoppingItems() {
    if (doneShoppingItems.length === 0) {
      return
    }

    const doneItemKeys = doneShoppingItems.map((item) => item.key)
    const doneItemKeySet = new Set(doneItemKeys)
    setCompletedShoppingItems((currentItems) =>
      currentItems.filter((itemKey) => !doneItemKeySet.has(itemKey)),
    )
    setRemovedShoppingItems((currentItems) => [
      ...currentItems.filter((itemKey) => !doneItemKeySet.has(itemKey)),
      ...doneItemKeys,
    ])
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Recipe Cabinet</h1>
        {stateError ? <p className="topbar__status">{stateError}</p> : null}
      </header>

      <nav className="tabs" aria-label="Primary views">
        {views.map((view) => (
          <button
            key={view.id}
            className={activeView === view.id ? 'tab tab--active' : 'tab'}
            onClick={() => setActiveView(view.id)}
            aria-label={`${view.label}: ${view.caption}`}
            title={view.label}
          >
            <span className="tab__icon" aria-hidden="true">
              {view.icon}
            </span>
            <strong className="tab__label">{view.label}</strong>
            <span className="tab__caption">{view.caption}</span>
          </button>
        ))}
      </nav>

      <main className="view-shell">
        {activeView === 'cookbook' ? (
          <section className="panel panel--wide">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Cookbook View</p>
                <h3>Browse Recipes</h3>
              </div>
              <span className="badge">{visibleRecipes.length} matches</span>
            </div>

            <div className="section-pills">
              {allSections.map((section) => (
                <button
                  key={section}
                  className={section === selectedSection ? 'pill pill--active' : 'pill'}
                  onClick={() => setSelectedSection(section)}
                >
                  {section}
                </button>
              ))}
            </div>

            <label className="searchbox">
              <span>Search by title, ingredient, author, or tag</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Try 'miso', 'lentils', or 'Meera'"
              />
            </label>

            <div className="recipe-grid">
              {visibleRecipes.map((recipe) => (
                <article
                  key={recipe.id}
                  className={
                    recipe.id === selectedRecipe.id ? 'recipe-card recipe-card--active' : 'recipe-card'
                  }
                  onClick={() => selectRecipe(recipe.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectRecipe(recipe.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <img
                    className="recipe-card__image"
                    src={resolveRecipeImage(recipe.image)}
                    alt={recipe.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={handleRecipeImageError}
                  />
                  <div className="recipe-card__header">
                    <strong>{recipe.title}</strong>
                    <span>{recipe.time}</span>
                  </div>
                  <p>{recipe.summary}</p>
                  <div className="recipe-card__meta">
                    <span>{recipe.section}</span>
                    <span>{recipe.author}</span>
                  </div>
                  <div className="card-actions">
                    <button
                      className="link-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        selectRecipe(recipe.id)
                      }}
                    >
                      Open recipe
                    </button>
                    <button
                      className="link-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openIngredientPicker(recipe.id)
                      }}
                    >
                      Add to meal plan
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeView === 'recipe' ? (
          <section className="panel panel--wide">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Recipe Detail View</p>
                <h3>{selectedRecipe.title}</h3>
              </div>
              <span className="badge">
                {selectedRecipe.servings} · {selectedRecipe.time}
              </span>
            </div>

            <div className="tag-row">
              <span className="source-tag">{selectedRecipe.source}</span>
              {selectedRecipe.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>

            <img
              className="recipe-detail__image"
              src={resolveRecipeImage(selectedRecipe.image)}
              alt={selectedRecipe.title}
              referrerPolicy="no-referrer"
              onError={handleRecipeImageError}
            />

            <p className="summary">{selectedRecipe.summary}</p>

            <div className="detail-grid">
              <div>
                <div className="detail-section__header">
                  <h4>Ingredients</h4>
                  <div className="scale-controls" aria-label="Ingredient scaling">
                    <span className="scale-controls__label">Scale</span>
                    <div className="scale-controls__buttons">
                      {scaleOptions.map((scaleOption) => (
                        <button
                          key={scaleOption}
                          className={
                            recipeScale === scaleOption
                              ? 'pill pill--active scale-pill'
                              : 'pill scale-pill'
                          }
                          onClick={() => setRecipeScale(scaleOption)}
                        >
                          {scaleOption}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <ul className="plain-list">
                  {selectedRecipe.ingredients.map((ingredient) => (
                    <li key={`${selectedRecipe.id}-${ingredient.item}`}>
                      <span>{ingredient.item}</span>
                      <strong>
                        {scaleIngredientAmount(ingredient.amount, recipeScale) || 'As listed'}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4>Method</h4>
                <ol className="step-list">
                  {selectedRecipe.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="planner-actions">
              <div className="planner-hint">
                <span>Add this recipe to your plan</span>
                <p>
                  {selectedRecipePlan
                    ? 'Choose which ingredients still need buying.'
                    : 'You can remove pantry items before anything reaches the shopping list.'}
                </p>
              </div>
              <button className="action-button" onClick={() => openIngredientPicker(selectedRecipe.id)}>
                Add To Planner
              </button>
            </div>

            <label className="notes">
              <span>Personal notes</span>
              <textarea
                value={recipeNotes[selectedRecipe.id] ?? ''}
                onChange={(event) => updateNote(event.target.value)}
                placeholder="Capture substitutions, timings, and serving tweaks."
              />
            </label>
          </section>
        ) : null}

        {activeView === 'planner' ? (
          <section className="panel panel--wide">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Planner View</p>
                <h3>Recipes To Make</h3>
              </div>
              <span className="badge">{plannedRecipes.length} planned</span>
            </div>

            <div className="planner-banner">
              <div>
                <strong>Selected recipe</strong>
                <p>{selectedRecipe.title}</p>
              </div>
              <div className="planner-banner__actions">
                <button className="action-button action-button--secondary" onClick={clearAllPlans}>
                  Clear All Recipes
                </button>
                <button className="action-button" onClick={() => setActiveView('recipe')}>
                  Review Recipe
                </button>
              </div>
            </div>

            {plannedRecipes.length > 0 ? (
              <div className="planner-list">
                {plannedRecipes.map((plannedRecipe) => {
                  const keptIngredients = plannedRecipe.recipe.ingredients.filter(
                    (ingredient) =>
                      !plannedRecipe.excludedIngredientKeys.includes(ingredientKey(ingredient)),
                  )

                  return (
                    <article key={plannedRecipe.recipe.id} className="planned-recipe-card">
                      <img
                        className="planned-recipe-card__image"
                        src={resolveRecipeImage(plannedRecipe.recipe.image)}
                        alt={plannedRecipe.recipe.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={handleRecipeImageError}
                      />
                      <div className="recipe-card__header">
                        <strong>{plannedRecipe.recipe.title}</strong>
                        <span>{plannedRecipe.recipe.time}</span>
                      </div>
                      <p>{plannedRecipe.recipe.summary}</p>
                      <div className="recipe-card__meta">
                        <span>{plannedRecipe.recipe.section}</span>
                        <span>{plannedRecipe.recipe.author}</span>
                      </div>
                      <div className="planner-preview">
                        <strong>Shopping Preview</strong>
                        <p>{plannedRecipe.recipe.summary}</p>
                        <ul className="planner-preview__list">
                          {keptIngredients.map((ingredient) => (
                            <li key={`${plannedRecipe.recipe.id}-${ingredient.item}`}>
                              {formatIngredient(ingredient)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="card-actions">
                        <button className="link-button" onClick={() => selectRecipe(plannedRecipe.recipe.id)}>
                          Open recipe
                        </button>
                        <button
                          className="link-button"
                          onClick={() => removePlannedRecipe(plannedRecipe.recipe.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <article className="empty-state">
                <strong>No planned recipes yet.</strong>
                <p>Add recipes from the recipe view and they will appear here.</p>
              </article>
            )}
          </section>
        ) : null}

        {activeView === 'shopping' ? (
          <section className="panel panel--wide">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Shopping List View</p>
                <h3>Need To Buy</h3>
              </div>
              <span className="badge">{Object.keys(visibleGroceryByAisle).length} aisles</span>
            </div>

            <div className="import-layout shopping-tools">
              <div className="import-card">
                <label className="searchbox">
                  <span>Add extra items, one per line</span>
                  <textarea
                    value={manualShoppingInput}
                    onChange={(event) => setManualShoppingInput(event.target.value)}
                    placeholder={'toilet roll\nolive oil\n2 l oat milk'}
                  />
                </label>

                <div className="planner-actions">
                  <div className="planner-hint">
                    <span>Manual items</span>
                    <p>
                      These are parsed with the same ingredient logic as recipes, so they
                      fall into the same aisle groups below.
                    </p>
                  </div>
                  <button className="action-button" onClick={addManualShoppingItems}>
                    Add Items
                  </button>
                </div>
              </div>
              <div className="import-card shopping-bulk-actions">
                <h4>List Actions</h4>
                <p className="summary">
                  Remove everything from either list once you no longer need it on this trip.
                </p>
                <button
                  className="action-button"
                  onClick={clearNeedShoppingItems}
                  disabled={Object.keys(visibleGroceryByAisle).length === 0}
                >
                  Clear Need List
                </button>
                <button
                  className="link-button"
                  onClick={clearBoughtShoppingItems}
                  disabled={doneShoppingItems.length === 0}
                >
                  Clear Bought List
                </button>
              </div>
            </div>

            <div className="grocery-grid">
              {Object.entries(visibleGroceryByAisle).length > 0 ? (
                Object.entries(visibleGroceryByAisle).map(([aisle, items]) => (
                  <article key={aisle} className="grocery-group">
                    <h4>{aisle}</h4>
                    <ul className="shopping-list">
                      {items.map((item) => (
                        <li key={item.key}>
                          <button
                            className="shopping-list__item"
                            onClick={() => markShoppingItemDone(item.key)}
                          >
                            <span>{item.item}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              ) : (
                <article className="empty-state">
                  <strong>No groceries yet.</strong>
                  <p>Plan recipes and the shopping list will populate automatically.</p>
                </article>
              )}
            </div>

            {doneShoppingItems.length > 0 ? (
              <article className="grocery-group grocery-group--done">
                <div className="grocery-group__header">
                  <h4>Bought</h4>
                  <span className="badge">{doneShoppingItems.length} items</span>
                </div>
                <ul className="done-list">
                  {doneShoppingItems.map((item) => (
                    <li key={item.key}>
                      <div className="done-list__item">
                        <div className="done-list__copy">
                          <span>{item.item}</span>
                          <small>{item.aisle}</small>
                        </div>
                        <button
                          className="link-button done-list__undo"
                          onClick={() => undoCompletedShoppingItem(item.key)}
                        >
                          Undo
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
          </section>
        ) : null}

        {activeView === 'import' ? (
          <section className="panel panel--wide">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Import View</p>
                <h3>Create A Recipe From A URL</h3>
              </div>
              <span className="badge">{recipeLibrary.length} recipes in library</span>
            </div>

            <div className="import-layout">
              <div className="import-card">
                <label className="searchbox">
                  <span>Paste a recipe URL</span>
                  <input
                    value={importUrl}
                    onChange={(event) => setImportUrl(event.target.value)}
                    placeholder="https://example.com/recipe"
                  />
                </label>

                <div className="planner-actions">
                  <div className="planner-hint">
                    <span>Current parser</span>
                    <p>
                      This prototype imports pages that expose structured
                      <strong> schema.org Recipe </strong>
                      metadata, which covers the Guardian test URL cleanly.
                    </p>
                  </div>
                  <button
                    className="action-button"
                    onClick={importRecipeFromUrl}
                    disabled={importStatus === 'loading'}
                  >
                    {importStatus === 'loading' ? 'Importing…' : 'Import Recipe'}
                  </button>
                </div>

                {importError ? (
                  <p className="import-message import-message--error">{importError}</p>
                ) : null}

                {lastImportedRecipeTitle ? (
                  <p className="import-message">
                    Added <strong>{lastImportedRecipeTitle}</strong> to the cookbook.
                  </p>
                ) : null}
              </div>

              <article className="import-card import-card--note">
                <p className="eyebrow">Test URL</p>
                <h4>Guardian Recipe Import</h4>
                <p>
                  The seeded URL points at the Guardian sweetcorn hiyashi recipe from
                  July 19, 2025 so the import flow is immediately testable.
                </p>
              </article>
            </div>
          </section>
        ) : null}
      </main>

      {ingredientPickerOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIngredientPickerOpen(false)}>
          <section
            className="ingredient-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ingredient-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel__header">
              <div>
                <p className="eyebrow">Planner Setup</p>
                <h3 id="ingredient-modal-title">Remove Ingredients You Already Have</h3>
              </div>
              <button className="link-button" onClick={() => setIngredientPickerOpen(false)}>
                Close
              </button>
            </div>

            <p className="modal-copy">
              Click any ingredient to exclude it from the shopping list for{' '}
              <strong>{pickerRecipe.title}</strong>.
            </p>

            <ul className="ingredient-picker">
              {pickerRecipe.ingredients.map((ingredient) => {
                const key = ingredientKey(ingredient)
                const isExcluded = ingredientSelection.includes(key)

                return (
                  <li key={key} className="ingredient-row">
                    <button
                      className={isExcluded ? 'ingredient-toggle ingredient-toggle--off' : 'ingredient-toggle'}
                      onClick={() => toggleIngredientSelection(key)}
                    >
                      <span
                        className={
                          isExcluded
                            ? 'ingredient-row__main ingredient-row__main--off'
                            : 'ingredient-row__main'
                        }
                      >
                        <strong>{ingredient.item}</strong>
                        <small>{ingredient.amount || 'As listed'}</small>
                      </span>
                      <span className="ingredient-row__status">
                        {isExcluded ? 'Already have this' : 'Add to shopping list'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="modal-actions">
              <button
                className="action-button action-button--secondary"
                onClick={() => setIngredientSelection([])}
              >
                Keep All Ingredients
              </button>
              <button className="action-button" onClick={confirmPlannerAdd}>
                Save To Planner
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
