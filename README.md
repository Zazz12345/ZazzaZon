# ZazzaZon Local Search

A local web app that searches Amazon US (`amazon.com`) and Amazon AU (`amazon.com.au`), then applies transparent sorting and filtering locally in your browser.

## What is improved

- Query both marketplaces from one search box.
- Local sort options: relevance (fetched order), price asc/desc, rating, review count.
- Expression-based local filtering:
  - quoted phrases (`"usb c hub"`)
  - exclusions (`-adapter`)
  - mixed expressions (`"usb c" -dock 4k`)
- Filter controls are generated from product attributes in fetched cards:
  - marketplace
  - Prime
  - sponsored/non-sponsored
  - has price/rating
  - badges discovered from listings (for example, "Best Seller" when available)

## Run

```bash
npm install
npm start
```

Open http://localhost:3000.

## Notes

- Amazon can throttle/block automated requests, and markup changes can break field extraction.
- This project is intentionally local and transparent; use it in compliance with Amazon terms and your local laws.
