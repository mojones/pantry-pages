export type MethodIngredient = {
  item: string
  amount: string
}

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
    /\d+\s+\d+\/\d+\+?|\d+[¼½¾⅓⅔⅛⅜⅝⅞]\+?|\d+\/\d+\+?|\d+(?:\.\d+)?\+?|[¼½¾⅓⅔⅛⅜⅝⅞]/g,
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

export function scaleIngredientAmount(amount: string, factor: number) {
  if (!amount || factor === 1) {
    return amount
  }

  return scaleAmountValue(amount, factor)
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function methodIngredientNames(item: string) {
  const baseItem = item.split(',', 1)[0]

  return baseItem
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+\bor\b\s+/i)
    .flatMap((alternative) => {
      const words = alternative
        .replace(/\bto taste\b.*$/i, '')
        .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)

      if (!words?.length) {
        return []
      }

      return [...new Set([words.join(' '), words.slice(-3).join(' '), words.slice(-2).join(' '), words.at(-1)!])]
        .map((name) => name.trim())
        .filter(Boolean)
    })
}

export function annotateMethodStep(step: string, ingredients: MethodIngredient[], factor: number) {
  const candidatesByMethodName = new Map<
    string,
    { methodName: string; amount: string; ingredientIndex: number } | null
  >()

  ingredients.forEach((ingredient, ingredientIndex) => {
    if (!ingredient.amount.trim()) {
      return
    }

    methodIngredientNames(ingredient.item).forEach((methodName) => {
      const key = methodName.toLocaleLowerCase()
      const existingCandidate = candidatesByMethodName.get(key)

      if (existingCandidate && existingCandidate.ingredientIndex !== ingredientIndex) {
        candidatesByMethodName.set(key, null)
        return
      }

      if (existingCandidate !== null) {
        candidatesByMethodName.set(key, { methodName, amount: ingredient.amount, ingredientIndex })
      }
    })
  })

  const matchableIngredients = Array.from(candidatesByMethodName.values())
    .filter((ingredient): ingredient is { methodName: string; amount: string; ingredientIndex: number } => ingredient !== null)
    .sort((left, right) => right.methodName.length - left.methodName.length)

  if (!matchableIngredients.length) {
    return step
  }

  const amountByMethodName = new Map(
    matchableIngredients.map((ingredient) => [
      ingredient.methodName.toLocaleLowerCase(),
      scaleIngredientAmount(ingredient.amount, factor),
    ]),
  )
  const expression = new RegExp(
    `\\b(${matchableIngredients.map((ingredient) => escapeRegularExpression(ingredient.methodName)).join('|')})\\b`,
    'gi',
  )

  return step.replace(expression, (mention, _matchedName, offset, source) => {
    if (/^\s*\([^)]*\)/.test(source.slice(offset + mention.length))) {
      return mention
    }

    return `${mention} (${amountByMethodName.get(mention.toLocaleLowerCase())})`
  })
}
