type Ingredient = {
  item: string
  amount: string
  aisle: string
}

const aisleCategories = [
  'Produce',
  'Herbs',
  'Spices',
  'Baking',
  'Pasta & Rice',
  'Grains & Beans',
  'Dairy & Chilled',
  'Canned & Jarred',
  'Oils & Vinegars',
  'Condiments & Sauces',
  'Nuts & Seeds',
  'Bakery',
  'Drinks',
  'Meat & Seafood',
  'Pantry',
] as const

const aisleRules: Array<{ aisle: (typeof aisleCategories)[number]; pattern: RegExp }> = [
  {
    aisle: 'Canned & Jarred',
    pattern:
      /\b(can|cans|tin|tins|jar|jars|carton|coconut milk|tomato paste|tomato purée|tomato puree|passata|diced tomatoes|crushed tomatoes|chopped tomatoes|tinned tomatoes|cherry tomatoes|artichokes|chipotle in adobo)\b/i,
  },
  {
    aisle: 'Oils & Vinegars',
    pattern:
      /\b(olive oil|extra virgin olive oil|extra-virgin olive oil|rapeseed oil|vegetable oil|sunflower oil|sesame oil|toasted sesame oil|groundnut oil|coconut oil|oil|vinegar|apple cider vinegar|red wine vinegar|white wine vinegar|rice wine vinegar|rice vinegar)\b/i,
  },
  {
    aisle: 'Condiments & Sauces',
    pattern:
      /\b(miso|soy sauce|tamari|tamarind|maple syrup|honey|sriracha|gochujang|chutney|harissa|tahini|mustard|dijon|capers|molasses|brown rice syrup|vegan fish sauce|nutritional yeast|stock|broth)\b/i,
  },
  {
    aisle: 'Nuts & Seeds',
    pattern:
      /\b(peanut|peanuts|peanut butter|hazelnut|hazelnuts|pistachio|pistachios|walnut|walnuts|almond|almonds|cashew|cashews|sesame|seed|seeds|pine nut|pine nuts)\b/i,
  },
  {
    aisle: 'Grains & Beans',
    pattern:
      /\b(lentil|lentils|chickpea|chickpeas|butter bean|butter beans|black bean|black beans|cannellini|kidney bean|kidney beans|white bean|white beans|bean|beans|quinoa|dal|dhal|split pea|split peas|falafel)\b/i,
  },
  {
    aisle: 'Pasta & Rice',
    pattern:
      /\b(pasta|spaghetti|macaroni|orzo|rice|noodles|udon|soba|vermicelli|polenta|couscous|bulgur|grain|grains)\b/i,
  },
  {
    aisle: 'Dairy & Chilled',
    pattern:
      /\b(butter|milk|cream|paneer|feta|halloumi|cheddar|cheese|yogurt|yoghurt|tofu|egg|eggs|ghee|vegan butter|margarine)\b/i,
  },
  {
    aisle: 'Spices',
    pattern:
      /\b(salt|pepper|cumin|turmeric|cinnamon|cardamom|nutmeg|cayenne|paprika|garam masala|mustard seed|mustard seeds|fennel seeds|coriander seed|coriander seeds|ground coriander|chilli flakes|chili flakes|oregano|thyme|bay leaves|bay leaf|zaatar|spice|spices|smoked salt)\b/i,
  },
  {
    aisle: 'Baking',
    pattern:
      /\b(flour|gram flour|besan|cornstarch|cornflour|bicarbonate|baking powder|baking soda|yeast|sugar|brown sugar|caster sugar|demerara sugar|icing sugar|oats|oatmeal|chocolate|cocoa|vanilla|pretzel|rice krispies)\b/i,
  },
  {
    aisle: 'Bakery',
    pattern:
      /\b(breadcrumb|breadcrumbs|bread|pitta|tortilla|pastry|puff pastry|crumpet|crumpets)\b/i,
  },
  {
    aisle: 'Drinks',
    pattern: /\b(apple juice|juice|wine|beer|cider)\b/i,
  },
  {
    aisle: 'Meat & Seafood',
    pattern: /\b(anchovy|anchovies|fish|prawn|prawns|chicken|beef|lamb|pork)\b/i,
  },
  {
    aisle: 'Herbs',
    pattern:
      /\b(coriander|cilantro|parsley|basil|mint|dill|chives|thyme|rosemary|sage|tarragon|herb|herbs)\b/i,
  },
  {
    aisle: 'Produce',
    pattern:
      /\b(onion|shallot|garlic|ginger|potato|sweet potato|tomato|aubergine|eggplant|courgette|zucchini|broccoli|broccolini|cauliflower|cabbage|carrot|celery|leek|pea|peas|spinach|kale|chard|spring onion|scallion|lime|lemon|orange|apple|pear|melon|plum|chilli|chili|pepper|peppers|mushroom|hispi|kohlrabi|salad|lettuce|rocket|cucumber|avocado|corn|sweetcorn|squash|pumpkin|beetroot|beet|radish|sprout|sprouts|cress)\b/i,
  },
]

function inferAisle(ingredient: string) {
  for (const rule of aisleRules) {
    if (rule.pattern.test(ingredient)) {
      return rule.aisle
    }
  }

  return 'Pantry'
}

const unicodeFractionPattern = '[¼½¾⅓⅔⅛⅜⅝⅞]'
const numberPattern = `(?:\\d+(?:\\.\\d+)?\\+?|\\d+\\/\\d+|${unicodeFractionPattern})`
const mixedNumberPattern = `(?:${numberPattern}(?:\\s+${numberPattern})?)`
const rangePattern = `(?:${mixedNumberPattern}(?:\\s*(?:-|to)\\s*${mixedNumberPattern})?)`
const dimensionPattern =
  `(?:${mixedNumberPattern}\\s*(?:cm|mm|inch(?:es)?)\\s*x\\s*${mixedNumberPattern}\\s*(?:cm|mm|inch(?:es)?))`
const standardUnitPattern =
  '(?:g|gram(?:s)?|kg|kilogram(?:s)?|ml|millilitre(?:s)?|milliliter(?:s)?|l|litre(?:s)?|liter(?:s)?|oz|ounce(?:s)?|lb|pound(?:s)?|tsp|tsps|teaspoon(?:s)?|tbsp|tbsps|tablespoon(?:s)?|cup(?:s)?|pinch(?:es)?|dash(?:es)?|handful(?:s)?|bunch(?:es)?|sprig(?:s)?|can(?:s)?|tin(?:s)?|packet(?:s)?|pack(?:s)?|jar(?:s)?|clove(?:s)?|slice(?:s)?|stick(?:s)?|piece(?:s)?|inch(?:es)?|cm|mm|sachet(?:s)?)'
const quantityPattern = new RegExp(
  `^((?:${dimensionPattern}|${rangePattern}))(?:\\s*(${standardUnitPattern}))?(?:\\s+of)?\\s+(.+)$`,
  'i',
)

function normalizeIngredientText(rawIngredient: string) {
  return rawIngredient
    .replace(/[–—]/g, '-')
    .replace(/(\d)([A-Za-z¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2')
    .replace(/([¼½¾⅓⅔⅛⅜⅝⅞])([A-Za-z])/g, '$1 $2')
    .replace(/(\d)\s*-\s*(inch(?:es)?|cm|mm)\b/gi, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitIngredient(rawIngredient: string): Ingredient {
  const cleaned = normalizeIngredientText(rawIngredient)
  const amountMatch = cleaned.match(quantityPattern)

  if (!amountMatch) {
    return {
      item: cleaned,
      amount: '',
      aisle: inferAisle(cleaned),
    }
  }

  const quantity = amountMatch[1].trim()
  const unit = amountMatch[2]?.trim() ?? ''
  const item = amountMatch[3].trim()

  return {
    amount: unit ? `${quantity} ${unit}` : quantity,
    item,
    aisle: inferAisle(cleaned),
  }
}

export type { Ingredient }
export { aisleCategories, splitIngredient }
