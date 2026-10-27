// A player's name in a game roster.
// Yellow = host confirmed payment. Outlined = player says they paid, host hasn't checked yet.
export default function PlayerChip({ player, paysFee }) {
  let cls = 'chip';
  let note = '';
  if (paysFee && player.paid_confirmed) {
    cls = 'chip paid';
    note = ' ✓';
  } else if (paysFee && player.paid_claimed) {
    cls = 'chip claimed';
    note = ' · pending';
  }
  return (
    <span className={cls}>
      {player.player_name}
      {player.state === 'waitlist' ? ' (waitlist)' : ''}
      {note}
    </span>
  );
}
