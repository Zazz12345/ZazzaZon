const state = {
  raw: [],
  filtered: [],
  facets: [],
  selectedFilters: new Map()
};

const searchForm = document.getElementById('searchForm');
const queryInput = document.getElementById('query');
const sortBy = document.getElementById('sortBy');
const expressionFilter = document.getElementById('expressionFilter');
const status = document.getElementById('status');
const resultsContainer = document.getElementById('results');
const resultTemplate = document.getElementById('resultTemplate');
const filtersContainer = document.getElementById('filters');
const clearFilters = document.getElementById('clearFilters');

function parseExpression(input) {
  const terms = [];
  const regex = /(-?"(?:\\"|[^"])+"|-?\S+)/g;
  const parts = input.match(regex) || [];

  for (const part of parts) {
    const negated = part.startsWith('-');
    const raw = negated ? part.slice(1) : part;
    const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    const normalized = unquoted.replaceAll('\\"', '"').toLowerCase();
    if (!normalized) continue;
    terms.push({ negated, value: normalized });
  }

  return terms;
}

function matchesExpression(item, expression) {
  if (expression.length === 0) return true;
  const haystack = `${item.title} ${item.attrs.marketplace} ${item.badges.join(' ')}`.toLowerCase();

  return expression.every((term) => {
    const hit = haystack.includes(term.value);
    return term.negated ? !hit : hit;
  });
}

function buildFacets(items) {
  const baseFacets = [
    {
      key: 'marketplace',
      label: 'Marketplace',
      values: [...new Set(items.map((item) => item.attrs.marketplace))]
    },
    {
      key: 'prime',
      label: 'Prime',
      values: ['Yes']
    },
    {
      key: 'sponsored',
      label: 'Sponsored',
      values: ['No']
    },
    {
      key: 'hasPrice',
      label: 'Has price',
      values: ['Yes']
    },
    {
      key: 'hasRating',
      label: 'Has rating',
      values: ['Yes']
    }
  ];

  const badgeValues = [...new Set(items.flatMap((item) => item.badges || []))].filter(Boolean).slice(0, 12);
  if (badgeValues.length > 0) {
    baseFacets.push({ key: 'badges', label: 'Badges', values: badgeValues });
  }

  return baseFacets;
}

function itemHasFacetValue(item, facetKey, value) {
  switch (facetKey) {
    case 'marketplace':
      return item.attrs.marketplace === value;
    case 'prime':
      return value === 'Yes' ? item.prime : true;
    case 'sponsored':
      return value === 'No' ? !item.sponsored : true;
    case 'hasPrice':
      return value === 'Yes' ? item.attrs.hasPrice : true;
    case 'hasRating':
      return value === 'Yes' ? item.attrs.hasRating : true;
    case 'badges':
      return item.badges.includes(value);
    default:
      return true;
  }
}

function applyFiltersAndSort() {
  const expression = parseExpression(expressionFilter.value.trim());

  let current = [...state.raw].filter((item) => {
    if (!matchesExpression(item, expression)) return false;

    for (const [facetKey, values] of state.selectedFilters.entries()) {
      if (!values || values.size === 0) continue;
      const hasAny = [...values].some((value) => itemHasFacetValue(item, facetKey, value));
      if (!hasAny) return false;
    }

    return true;
  });

  switch (sortBy.value) {
    case 'priceAsc':
      current.sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
      break;
    case 'priceDesc':
      current.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
      break;
    case 'ratingDesc':
      current.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      break;
    case 'reviewsDesc':
      current.sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1));
      break;
    default:
      break;
  }

  state.filtered = current;
  renderResults();
}

function renderFilters() {
  filtersContainer.innerHTML = '';

  for (const facet of state.facets) {
    const section = document.createElement('section');
    section.className = 'facet';

    const title = document.createElement('h3');
    title.textContent = facet.label;
    section.appendChild(title);

    const options = document.createElement('div');
    options.className = 'facet-options';

    for (const value of facet.values) {
      const selected = state.selectedFilters.get(facet.key)?.has(value);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chip ${selected ? 'active' : ''}`;
      button.textContent = value;
      button.addEventListener('click', () => {
        const current = state.selectedFilters.get(facet.key) || new Set();
        if (current.has(value)) current.delete(value);
        else current.add(value);
        state.selectedFilters.set(facet.key, current);
        renderFilters();
        applyFiltersAndSort();
      });
      options.appendChild(button);
    }

    section.appendChild(options);
    filtersContainer.appendChild(section);
  }
}

function priceLabel(item) {
  return item.price ? `${item.currency} ${item.price.toFixed(2)}` : 'Price N/A';
}

function renderResults() {
  resultsContainer.innerHTML = '';
  status.textContent = `Showing ${state.filtered.length} / ${state.raw.length} products.`;

  for (const item of state.filtered) {
    const node = resultTemplate.content.cloneNode(true);
    const img = node.querySelector('.thumb');
    const title = node.querySelector('.title');
    const meta = node.querySelector('.meta');
    const tags = node.querySelector('.tags');

    img.src = item.image || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    title.href = item.url;
    title.textContent = item.title;

    meta.textContent = [
      `Market ${item.attrs.marketplace}`,
      priceLabel(item),
      item.rating ? `⭐ ${item.rating}` : 'No rating',
      item.reviews ? `${item.reviews} reviews` : 'No reviews'
    ].join(' · ');

    const badgeParts = [];
    if (item.prime) badgeParts.push('Prime');
    if (item.sponsored) badgeParts.push('Sponsored');
    badgeParts.push(...(item.badges || []).slice(0, 3));
    tags.textContent = badgeParts.join(' · ');

    resultsContainer.appendChild(node);
  }
}

async function executeSearch(query) {
  status.textContent = 'Searching...';
  status.className = '';

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Search failed');

    state.raw = data.results;
    state.selectedFilters = new Map();
    state.facets = buildFacets(data.results);

    if (data.errors?.length > 0) {
      status.textContent = `Warning: ${data.errors.join(' | ')}`;
      status.className = 'status-error';
    }

    renderFilters();
    applyFiltersAndSort();
  } catch (error) {
    status.textContent = error.message;
    status.className = 'status-error';
    state.raw = [];
    state.filtered = [];
    state.facets = [];
    renderFilters();
    renderResults();
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  executeSearch(queryInput.value.trim());
});

sortBy.addEventListener('change', applyFiltersAndSort);
expressionFilter.addEventListener('input', applyFiltersAndSort);

clearFilters.addEventListener('click', () => {
  state.selectedFilters = new Map();
  expressionFilter.value = '';
  renderFilters();
  applyFiltersAndSort();
});
