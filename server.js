import express from 'express';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const MARKETPLACES = [
  { key: 'US', host: 'www.amazon.com', currency: 'USD' },
  { key: 'AU', host: 'www.amazon.com.au', currency: 'AUD' }
];

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

function parsePrice(text = '') {
  const normalized = text.replace(/[,\s]/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return normalized ? Number(normalized[1]) : null;
}

function parseNumber(text = '') {
  const match = text.replace(/,/g, '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseListing($, card, market) {
  const title = $(card).find('h2 span').first().text().trim();
  const urlPath = $(card).find('h2 a').attr('href');
  if (!title || !urlPath) return null;

  const priceWhole = $(card).find('.a-price .a-price-whole').first().text();
  const priceFraction = $(card).find('.a-price .a-price-fraction').first().text();
  const priceText = `${priceWhole}.${priceFraction}`;
  const fallbackPriceText = $(card).find('.a-offscreen').first().text();
  const price = parsePrice(priceText) ?? parsePrice(fallbackPriceText);

  const ratingText = $(card).find('.a-icon-alt').first().text();
  const rating = parseFloat(ratingText) || null;

  const reviews = parseNumber(
    $(card).find('[aria-label$="ratings"], [aria-label$="rating"], .a-size-small .a-link-normal span').first().text()
  );

  const prime = $(card).find('[aria-label="Amazon Prime"], .s-prime').length > 0;
  const sponsored = $(card).text().toLowerCase().includes('sponsored');
  const badges = $(card)
    .find('.a-badge-text')
    .map((_, node) => $(node).text().trim())
    .get()
    .filter(Boolean);

  const asin = $(card).attr('data-asin') || null;

  return {
    id: `${market.key}-${Buffer.from(urlPath).toString('base64').slice(0, 12)}`,
    asin,
    title,
    url: `https://${market.host}${urlPath}`,
    image: $(card).find('img.s-image').attr('src') || null,
    price,
    currency: market.currency,
    rating,
    reviews,
    prime,
    sponsored,
    badges,
    attrs: {
      marketplace: market.key,
      hasPrice: Boolean(price),
      hasRating: Boolean(rating),
      badges,
      asin
    }
  };
}

function describeFetchError(error) {
  if (!error) return 'unknown fetch error';
  const causeCode = error.cause?.code ? ` (${error.cause.code})` : '';
  return `${error.message || 'fetch failed'}${causeCode}`;
}

async function fetchMarketResults(query, market) {
  const url = new URL(`https://${market.host}/s`);
  url.searchParams.set('k', query);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html'
      }
    });
  } catch (error) {
    throw new Error(`${market.host}: ${describeFetchError(error)}`);
  }

  if (!response.ok) {
    throw new Error(`${market.host} returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const cards = $('[data-component-type="s-search-result"]');
  const listings = [];
  cards.each((_, card) => {
    const listing = parseListing($, card, market);
    if (listing) listings.push(listing);
  });

  return listings;
}

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Missing query parameter q' });

  const settled = await Promise.allSettled(
    MARKETPLACES.map(async (market) => ({ market: market.key, results: await fetchMarketResults(query, market) }))
  );

  const results = [];
  const errors = [];

  for (const entry of settled) {
    if (entry.status === 'fulfilled') results.push(...entry.value.results);
    else errors.push(entry.reason?.message || 'Unknown fetch error');
  }

  return res.json({ query, fetchedAt: new Date().toISOString(), total: results.length, results, errors });
});

app.listen(PORT, () => {
  console.log(`Search app running at http://localhost:${PORT}`);
});
