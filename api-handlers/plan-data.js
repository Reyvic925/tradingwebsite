export function getDefaultPlans() {
  return [
    { id: 1, name: 'Starter', tagline: 'First desk allocation', min_amount: 200, max_amount: 999, daily_rate: 2.5, duration_days: 6, total_return: 275, featured: false },
    { id: 2, name: 'Premium', tagline: 'The house favorite', min_amount: 1000, max_amount: 4900, daily_rate: 3.5, duration_days: 7, total_return: 357, featured: true },
    { id: 3, name: 'Gold', tagline: 'For serious books', min_amount: 5000, max_amount: 24900, daily_rate: 4.5, duration_days: 9, total_return: 480, featured: false },
    { id: 4, name: 'Diamond', tagline: 'Private client mandate', min_amount: 25000, max_amount: null, daily_rate: 6, duration_days: 14, total_return: 640, featured: false },
  ];
}