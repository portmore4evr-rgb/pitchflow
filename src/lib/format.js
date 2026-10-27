export const GAME_TYPES = ['Futsal', 'Grass field', '5v5'];
export const SETTINGS = ['Indoor', 'Outdoor'];

export function formatWhen(iso) {
  return (
    new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) + ' ET'
  );
}

export function money(n) {
  const v = Number(n);
  return v > 0 ? `$${v.toFixed(2)}` : 'Free';
}
