/**
 * Localize region slugs to human-readable names
 */
function localizeRegion(slug) {
  const regions = [
    { slug: 'nyc1', name: 'New York 1' },
    { slug: 'nyc2', name: 'New York 2' },
    { slug: 'nyc3', name: 'New York 3' },
    { slug: 'sfo1', name: 'San Francisco 1' },
    { slug: 'sfo2', name: 'San Francisco 2' },
    { slug: 'sfo3', name: 'San Francisco 3' },
    { slug: 'ams2', name: 'Amsterdam 2' },
    { slug: 'ams3', name: 'Amsterdam 3' },
    { slug: 'sgp1', name: 'Singapore 1' },
    { slug: 'lon1', name: 'London 1' },
    { slug: 'fra1', name: 'Frankfurt 1' },
    { slug: 'blr1', name: 'Bangalore 1' },
    { slug: 'tor1', name: 'Toronto 1' },
  ];

  const region = regions.find(r => r.slug === slug);
  return region ? region.name : slug;
}

module.exports = localizeRegion;

