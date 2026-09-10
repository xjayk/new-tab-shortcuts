/**
 * reorder.js — Pure reordering utility for shortcuts and lists.
 */

/**
 * Move the item at `index` one position in `direction` within a list.
 * Returns a new array (immutable) or the original list when the move
 * would exit bounds. Orders are encoded purely by array index, so this
 * is the single primitive behind all reordering.
 * @param {Array} list
 * @param {number} index
 * @param {'left'|'right'} direction
 * @returns {Array}
 */
function moveItemInList(list, index, direction) {
  const nextIndex = direction === 'left' ? index - 1 : index + 1;
  if (index < 0 || index >= list.length || nextIndex < 0 || nextIndex >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

export { moveItemInList };
